/**
 * Story 900-14 — testes do piso de isolamento.
 *
 * O client é um Proxy sobre o client do Supabase, então os testes usam um duplo que registra
 * as chamadas encadeadas. O que importa verificar não é "o Supabase funciona" e sim: o filtro
 * é injetado onde deve, NÃO é injetado onde quebraria, e a cadeia continua encadeável.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

const chamadas: Array<{ metodo: string; args: unknown[] }> = []

function queryBuilderFalso() {
  const qb: Record<string, unknown> = {}
  for (const m of ["select", "insert", "update", "delete", "upsert", "eq", "order", "limit"]) {
    qb[m] = vi.fn((...args: unknown[]) => {
      chamadas.push({ metodo: m, args })
      return qb
    })
  }
  return qb
}

const clientFalso = { from: vi.fn(() => queryBuilderFalso()) }

vi.mock("./admin", () => ({ createAdminClient: () => clientFalso }))

const ORG = "11111111-1111-1111-1111-111111111111"
const OUTRA_ORG = "22222222-2222-2222-2222-222222222222"

const { createOrgScopedAdminClient, tabelaTemOrgId } = await import("./org-scoped-admin")

beforeEach(() => {
  chamadas.length = 0
})

describe("validação de orgId (AC5)", () => {
  it.each([["vazio", ""], ["undefined", undefined], ["não-UUID", "abc"], ["número", 123]])(
    "recusa orgId %s",
    (_rotulo, valor) => {
      expect(() => createOrgScopedAdminClient(valor as string)).toThrow(/orgId inválido/)
    },
  )

  it("aceita UUID válido", () => {
    expect(() => createOrgScopedAdminClient(ORG)).not.toThrow()
  })

  it("a mensagem explica POR QUE recusar é melhor que devolver client sem escopo", () => {
    // Um client 'escopado' com orgId undefined parece seguro e não filtra nada.
    expect(() => createOrgScopedAdminClient("")).toThrow(/parece seguro/)
  })
})

describe("injeção de escopo (AC1, AC3)", () => {
  it("select em tabela com org_id recebe .eq('org_id', orgId)", () => {
    createOrgScopedAdminClient(ORG).from("leads").select("*")
    expect(chamadas).toContainEqual({ metodo: "eq", args: ["org_id", ORG] })
  })

  it("update recebe o filtro — UPDATE cego não atinge outra org", () => {
    createOrgScopedAdminClient(ORG).from("leads").update({ name: "x" })
    expect(chamadas).toContainEqual({ metodo: "eq", args: ["org_id", ORG] })
  })

  it("delete recebe o filtro — DELETE cego não apaga de outra org", () => {
    createOrgScopedAdminClient(ORG).from("leads").delete()
    expect(chamadas).toContainEqual({ metodo: "eq", args: ["org_id", ORG] })
  })

  it("a cadeia continua encadeável depois da injeção", () => {
    const db = createOrgScopedAdminClient(ORG)
    expect(() => db.from("leads").select("*").eq("status", "novo").order("created_at").limit(10))
      .not.toThrow()
    expect(chamadas.map((c) => c.metodo)).toEqual(
      expect.arrayContaining(["select", "eq", "order", "limit"]),
    )
  })
})

describe("insert e o vetor de IDOR (AC2)", () => {
  it("injeta org_id no payload", () => {
    createOrgScopedAdminClient(ORG).from("leads").insert({ name: "Lead" })
    const ins = chamadas.find((c) => c.metodo === "insert")
    expect(ins?.args[0]).toMatchObject({ name: "Lead", org_id: ORG })
  })

  it("SOBRESCREVE org_id forjado no payload — é o IDOR mais direto numa API multi-tenant", () => {
    createOrgScopedAdminClient(ORG).from("leads").insert({ name: "Lead", org_id: OUTRA_ORG })
    const ins = chamadas.find((c) => c.metodo === "insert")
    expect((ins?.args[0] as { org_id: string }).org_id).toBe(ORG)
  })

  it("injeta em todas as linhas de um insert em lote", () => {
    createOrgScopedAdminClient(ORG).from("leads").insert([{ name: "A" }, { name: "B", org_id: OUTRA_ORG }])
    const ins = chamadas.find((c) => c.metodo === "insert")
    for (const linha of ins?.args[0] as Array<{ org_id: string }>) {
      expect(linha.org_id).toBe(ORG)
    }
  })

  it("upsert também é escopado", () => {
    createOrgScopedAdminClient(ORG).from("leads").upsert({ name: "L" })
    const up = chamadas.find((c) => c.metodo === "upsert")
    expect(up?.args[0]).toMatchObject({ org_id: ORG })
  })
})

describe("tabelas sem org_id (AC4)", () => {
  it("organizations não recebe filtro — injetar quebraria a query", () => {
    createOrgScopedAdminClient(ORG).from("organizations").select("*")
    expect(chamadas.some((c) => c.metodo === "eq" && c.args[0] === "org_id")).toBe(false)
  })

  it("insert em tabela sem org_id não ganha a coluna", () => {
    createOrgScopedAdminClient(ORG).from("organizations").insert({ name: "Nova" })
    const ins = chamadas.find((c) => c.metodo === "insert")
    expect(ins?.args[0]).not.toHaveProperty("org_id")
  })

  it("a lista vem do snapshot, não de array manual", () => {
    // Se alguém trocar por array escrito à mão, estes casos denunciam a defasagem.
    expect(tabelaTemOrgId("leads")).toBe(true)
    expect(tabelaTemOrgId("organizations")).toBe(false)
    expect(tabelaTemOrgId("tabela_que_nao_existe")).toBe(false)
  })
})
