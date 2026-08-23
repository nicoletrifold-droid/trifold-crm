/**
 * Story 900-2a — testes das regras R1-R4 do gate de tenancy.
 *
 * As regras são funções puras de schema → violações, então dão para testar sem rede e sem
 * banco. O caso mais importante daqui é o do `WITH CHECK` omitido (ver bloco da R2): a
 * primeira versão da regra ignorava essa semântica do Postgres e produzia 164 falsos
 * positivos contra o schema real — o suficiente para tornar o gate ruído e ser ignorado.
 */

import { describe, it, expect } from "vitest"
import {
  ruleR1,
  ruleR2,
  ruleR4,
  checksumTabelas,
  type IntrospectedSchema,
  type TableInfo,
  type PolicyInfo,
} from "./gate-tenancy"

const SEM_ALLOWLIST = new Set<string>()

function tabela(over: Partial<TableInfo> = {}): TableInfo {
  return { name: "leads", rowsecurity: true, hasOrgId: true, orgIdNotNull: true, ...over }
}

function policy(over: Partial<PolicyInfo> = {}): PolicyInfo {
  return {
    table: "leads",
    cmd: "ALL",
    permissive: true,
    roles: ["public"],
    qual: "(org_id = user_org_id())",
    withCheck: "",
    ...over,
  }
}

function schema(tables: TableInfo[], policies: PolicyInfo[]): IntrospectedSchema {
  return {
    tables,
    policies,
    source: "snapshot",
    capturedAt: "2026-01-01T00:00:00.000Z",
    projectRef: "test",
  }
}

describe("R1 — RLS desabilitada", () => {
  it("acusa tabela com org_id e rowsecurity=false", () => {
    const v = ruleR1(schema([tabela({ rowsecurity: false })], []), SEM_ALLOWLIST)
    expect(v).toHaveLength(1)
    expect(v[0]).toMatchObject({ rule: "R1", table: "leads" })
  })

  it("ignora tabela SEM org_id, mesmo com RLS desabilitada", () => {
    // Tabela de plataforma sem org_id não é assunto da R1 — é da R3/allowlist.
    const v = ruleR1(schema([tabela({ hasOrgId: false, rowsecurity: false })], []), SEM_ALLOWLIST)
    expect(v).toHaveLength(0)
  })

  it("não acusa quando RLS está ligada", () => {
    expect(ruleR1(schema([tabela()], []), SEM_ALLOWLIST)).toHaveLength(0)
  })
})

describe("R2 — cobertura por comando", () => {
  it("policy FOR ALL com org no USING cobre os quatro comandos", () => {
    const v = ruleR2(schema([tabela()], [policy()]), SEM_ALLOWLIST)
    expect(v).toHaveLength(0)
  })

  it("WITH CHECK omitido: o USING vale para INSERT — o falso positivo que derrubava 164 casos", () => {
    // Padrão dominante do projeto: FOR ALL USING (org_id = ...) sem WITH CHECK.
    // O Postgres aplica o USING também às linhas novas.
    const p = policy({ cmd: "ALL", qual: "(org_id = user_org_id())", withCheck: "" })
    const v = ruleR2(schema([tabela()], [p]), SEM_ALLOWLIST)
    expect(v.filter((x) => x.detail.includes("INSERT"))).toHaveLength(0)
  })

  it("policy FOR INSERT sem menção a org não cobre INSERT", () => {
    const p = policy({ cmd: "INSERT", qual: "", withCheck: "(true)" })
    const v = ruleR2(schema([tabela()], [p]), SEM_ALLOWLIST)
    expect(v.some((x) => x.detail.includes("INSERT"))).toBe(true)
  })

  it("tabela sem policy nenhuma acusa os quatro comandos", () => {
    const v = ruleR2(schema([tabela({ name: "marketing_brands" })], []), SEM_ALLOWLIST)
    expect(v).toHaveLength(4)
    expect(v.map((x) => x.detail.split(" ").pop()).sort()).toEqual(
      ["DELETE", "INSERT", "SELECT", "UPDATE"],
    )
  })

  it("só SELECT coberto acusa os outros três", () => {
    // A policy precisa apontar para a MESMA tabela — o caso real de `system_events`.
    const p = policy({ table: "system_events", cmd: "SELECT", qual: "(org_id = user_org_id())" })
    const v = ruleR2(schema([tabela({ name: "system_events" })], [p]), SEM_ALLOWLIST)
    expect(v).toHaveLength(3)
    expect(v.map((x) => x.detail.split(" ").pop()).sort()).toEqual(["DELETE", "INSERT", "UPDATE"])
  })

  it("respeita a allowlist", () => {
    const v = ruleR2(schema([tabela({ name: "platform_costs" })], []), new Set(["platform_costs"]))
    expect(v).toHaveLength(0)
  })

  it("não duplica ruído de R1 — tabela com RLS off é reportada só por R1", () => {
    const v = ruleR2(schema([tabela({ rowsecurity: false })], []), SEM_ALLOWLIST)
    expect(v).toHaveLength(0)
  })

  it("SELECT não é coberto por policy que só define WITH CHECK", () => {
    // WITH CHECK não filtra leitura; se só ele menciona org, o SELECT segue descoberto.
    const p = policy({ cmd: "INSERT", qual: "", withCheck: "(org_id = user_org_id())" })
    const v = ruleR2(schema([tabela()], [p]), SEM_ALLOWLIST)
    expect(v.some((x) => x.detail.includes("SELECT"))).toBe(true)
  })
})

describe("R4 — policy permissiva USING(true)", () => {
  it("acusa USING(true) permissiva em tabela com org_id", () => {
    const p = policy({ table: "system_events", cmd: "SELECT", qual: "true", permissive: true })
    const v = ruleR4(schema([tabela({ name: "system_events" })], [p]), SEM_ALLOWLIST)
    expect(v).toHaveLength(1)
    expect(v[0].rule).toBe("R4")
  })

  it("ignora policy RESTRICTIVE com true — restritiva não anula as demais", () => {
    const p = policy({ qual: "true", permissive: false })
    expect(ruleR4(schema([tabela()], [p]), SEM_ALLOWLIST)).toHaveLength(0)
  })

  it("ignora tabela sem org_id", () => {
    const p = policy({ table: "plataforma", qual: "true" })
    const v = ruleR4(schema([tabela({ name: "plataforma", hasOrgId: false })], [p]), SEM_ALLOWLIST)
    expect(v).toHaveLength(0)
  })

  it("tolera espaço e caixa em 'TRUE'", () => {
    const p = policy({ qual: "  TRUE  " })
    expect(ruleR4(schema([tabela()], [p]), SEM_ALLOWLIST)).toHaveLength(1)
  })
})

describe("checksum da grandfather list", () => {
  it("é estável e independe da ordem de entrada", () => {
    expect(checksumTabelas(["a", "b", "c"])).toBe(checksumTabelas(["c", "a", "b"]))
  })

  it("muda quando uma tabela é acrescentada — que é o ponto da guarda", () => {
    expect(checksumTabelas(["a", "b"])).not.toBe(checksumTabelas(["a", "b", "c"]))
  })
})
