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

// ===========================================================================
// Story 900-2b — R5-R9 e severidade
// ===========================================================================

import {
  ruleR5,
  ruleR6,
  ruleR7,
  ruleR8,
  detectarColisoes,
  extrairFuncoesRedefinidas,
  type RelationInfo,
  type FunctionInfo,
} from "./gate-tenancy"

function relacao(over: Partial<RelationInfo> = {}): RelationInfo {
  return {
    name: "v_leads",
    relkind: "v",
    acl: ["postgres=arwdDxtm/postgres", "authenticated=rm/postgres"],
    securityInvoker: "on",
    ...over,
  }
}

function funcao(over: Partial<FunctionInfo> = {}): FunctionInfo {
  return {
    name: "user_org_id",
    args: "",
    securityDefiner: true,
    config: ["search_path=public, pg_temp"],
    acl: ["postgres=X/postgres"],
    body: "select org_id from users where auth_id = auth.uid()",
    ...over,
  }
}

function schemaCom(over: Partial<IntrospectedSchema>): IntrospectedSchema {
  return { tables: [], policies: [], source: "snapshot", capturedAt: "", projectRef: "t", ...over }
}

describe("R5 — relkind decide o veredito", () => {
  it("view exposta sem security_invoker é violação", () => {
    const v = ruleR5(schemaCom({ relations: [relacao({ securityInvoker: null })] }), SEM_ALLOWLIST)
    expect(v).toHaveLength(1)
    expect(v[0].detail).toContain("security_invoker")
  })

  it("view com security_invoker=on está ok", () => {
    expect(ruleR5(schemaCom({ relations: [relacao()] }), SEM_ALLOWLIST)).toHaveLength(0)
  })

  it("matview com grant NUNCA recebe recomendação de security_invoker (ERRCODE 42809)", () => {
    // Prescrever security_invoker para matview manda o dev escrever um ALTER que não roda.
    const v = ruleR5(
      schemaCom({ relations: [relacao({ name: "meta_campaign_roas", relkind: "m", securityInvoker: null })] }),
      SEM_ALLOWLIST,
    )
    expect(v).toHaveLength(1)
    expect(v[0].detail).toContain("revoke")
    expect(v[0].detail).not.toMatch(/sem security_invoker/)
  })

  it("matview sem grant a anon/authenticated/PUBLIC não é violação", () => {
    const m = relacao({ relkind: "m", acl: ["postgres=arwdDxtm/postgres", "service_role=r/postgres"], securityInvoker: null })
    expect(ruleR5(schemaCom({ relations: [m] }), SEM_ALLOWLIST)).toHaveLength(0)
  })
})

describe("R6 — PUBLIC", () => {
  it("acusa SECURITY DEFINER com EXECUTE para PUBLIC (entrada '=')", () => {
    const f = funcao({ acl: ["=X/postgres", "postgres=X/postgres"] })
    expect(ruleR6(schemaCom({ functions: [f] }), SEM_ALLOWLIST)).toHaveLength(1)
  })

  it("NÃO acusa SECURITY INVOKER com PUBLIC — é o default do Postgres e a RLS ainda vale", () => {
    // 136 das 176 funções do projeto caem aqui; reportá-las seria ruído.
    const f = funcao({ securityDefiner: false, acl: ["=X/postgres"] })
    expect(ruleR6(schemaCom({ functions: [f] }), SEM_ALLOWLIST)).toHaveLength(0)
  })

  it("não acusa quando só anon/authenticated aparecem nomeadamente", () => {
    const f = funcao({ acl: ["authenticated=X/postgres"] })
    expect(ruleR6(schemaCom({ functions: [f] }), SEM_ALLOWLIST)).toHaveLength(0)
  })
})

describe("R7 — SECURITY DEFINER sem search_path", () => {
  it("acusa proconfig vazio", () => {
    const v = ruleR7(schemaCom({ functions: [funcao({ name: "is_admin", config: [] })] }), SEM_ALLOWLIST)
    expect(v).toHaveLength(1)
    expect(v[0].severity).toBe("FAIL")
  })

  it("aceita search_path definido", () => {
    expect(ruleR7(schemaCom({ functions: [funcao()] }), SEM_ALLOWLIST)).toHaveLength(0)
  })

  it("ignora função SECURITY INVOKER sem search_path", () => {
    const f = funcao({ securityDefiner: false, config: [] })
    expect(ruleR7(schemaCom({ functions: [f] }), SEM_ALLOWLIST)).toHaveLength(0)
  })
})

describe("R8 — p_org_id não validado (WARN)", () => {
  it("acusa p_org_id sem user_org_id no corpo, com severidade WARN", () => {
    const f = funcao({ name: "get_stats", args: "p_org_id uuid", body: "select 1 from leads where org_id = p_org_id" })
    const v = ruleR8(schemaCom({ functions: [f] }), SEM_ALLOWLIST)
    expect(v).toHaveLength(1)
    expect(v[0].severity).toBe("WARN")
  })

  it("aceita quando o corpo chama user_org_id()", () => {
    const f = funcao({ name: "ok", args: "p_org_id uuid", body: "select assert_org_scope(p_org_id)" })
    expect(ruleR8(schemaCom({ functions: [f] }), SEM_ALLOWLIST)).toHaveLength(0)
  })

  it("ignora função sem p_org_id na assinatura", () => {
    const f = funcao({ args: "p_lead_id uuid", body: "select 1" })
    expect(ruleR8(schemaCom({ functions: [f] }), SEM_ALLOWLIST)).toHaveLength(0)
  })
})

describe("R9 — colisão de migrations no mesmo PR", () => {
  it("AC6: reproduz o caso real 195 × 199 (roleta_pick_and_advance)", () => {
    // Cenário que quase reverteu a Story 75-226: as duas redefinem a mesma função.
    // No caso real a 199 chegou depois da 195 já aplicada; o teste cobre o caso que a
    // regra previne daqui pra frente — as duas chegando juntas no mesmo PR.
    const v = detectarColisoes({
      "195_sdr_na_roleta.sql":
        "CREATE OR REPLACE FUNCTION roleta_pick_and_advance(p_org_id uuid) RETURNS uuid AS $$ BEGIN RETURN null; END; $$ LANGUAGE plpgsql;",
      "199_hotfix_rls_org_scope.sql":
        "CREATE OR REPLACE FUNCTION roleta_pick_and_advance(p_org_id uuid) RETURNS uuid AS $$ BEGIN PERFORM assert_org_scope(p_org_id); RETURN null; END; $$ LANGUAGE plpgsql;",
    })
    expect(v).toHaveLength(1)
    expect(v[0].table).toBe("roleta_pick_and_advance")
    expect(v[0].detail).toContain("195_sdr_na_roleta.sql")
    expect(v[0].detail).toContain("199_hotfix_rls_org_scope.sql")
    expect(v[0].detail).toContain("ganha em silêncio")
  })

  it("não acusa quando cada migration mexe numa função diferente", () => {
    expect(
      detectarColisoes({
        "a.sql": "CREATE OR REPLACE FUNCTION foo() RETURNS void AS $$ $$ LANGUAGE sql;",
        "b.sql": "CREATE OR REPLACE FUNCTION bar() RETURNS void AS $$ $$ LANGUAGE sql;",
      }),
    ).toHaveLength(0)
  })

  it("a mesma função redefinida duas vezes no MESMO arquivo não é colisão", () => {
    // Um arquivo só é aplicado de uma vez; não há ambiguidade de ordem.
    expect(
      detectarColisoes({
        "a.sql":
          "CREATE OR REPLACE FUNCTION foo() RETURNS void AS $$ $$ LANGUAGE sql; CREATE OR REPLACE FUNCTION foo() RETURNS void AS $$ $$ LANGUAGE sql;",
      }),
    ).toHaveLength(0)
  })

  it("extrai nomes tolerando public., aspas e espaçamento", () => {
    const nomes = extrairFuncoesRedefinidas(`
      create or replace function public."minha_func"() returns void as $$ $$ language sql;
      CREATE  OR  REPLACE   FUNCTION outra_func(a int) RETURNS int AS $$ $$ LANGUAGE sql;
    `)
    expect(nomes.sort()).toEqual(["minha_func", "outra_func"])
  })
})

describe("AC7 — sem regressão: R1-R4 seguem com o motor estendido", () => {
  it("R1 continua funcionando com relations/functions presentes", () => {
    const s = schemaCom({
      tables: [tabela({ rowsecurity: false })],
      relations: [relacao()],
      functions: [funcao()],
    })
    expect(ruleR1(s, SEM_ALLOWLIST)).toHaveLength(1)
  })

  it("regras novas toleram schema SEM relations/functions (snapshot da 900-2a)", () => {
    const antigo = schema([tabela()], [policy()])
    expect(() => {
      ruleR5(antigo, SEM_ALLOWLIST)
      ruleR6(antigo, SEM_ALLOWLIST)
      ruleR7(antigo, SEM_ALLOWLIST)
      ruleR8(antigo, SEM_ALLOWLIST)
    }).not.toThrow()
  })
})

// ===========================================================================
// Story 900-2c — catraca, allowlist e stubs R10-R12
// ===========================================================================

import { aplicarCatraca, chaveDe, ruleR10, ruleR11, ruleR12, type Baseline } from "./gate-tenancy"

function baselineCom(chaves: string[]): Baseline {
  return {
    _aviso: "",
    geradoEm: "2026-08-23T00:00:00.000Z",
    projectRef: "test",
    total: chaves.length,
    porRegra: {},
    chaves,
  }
}

const vio = (rule: string, table: string, detail = "d"): Violation => ({ rule, table, detail })

describe("catraca", () => {
  it("passa quando nada mudou", () => {
    const v = [vio("R2", "leads"), vio("R7", "is_admin()")]
    const r = aplicarCatraca(v, baselineCom(v.map(chaveDe)))
    expect(r.ok).toBe(true)
    expect(r.delta).toBe(0)
  })

  it("falha quando o total sobe (a)", () => {
    const base = baselineCom([chaveDe(vio("R2", "leads"))])
    const r = aplicarCatraca([vio("R2", "leads"), vio("R2", "users")], base)
    expect(r.ok).toBe(false)
    expect(r.motivos.join(" ")).toContain("(a)")
    expect(r.delta).toBe(1)
  })

  it("falha com violação nova mesmo se o total não subir (b)", () => {
    // Uma sai, outra entra: total igual, mas houve regressão real.
    const base = baselineCom([chaveDe(vio("R2", "leads"))])
    const r = aplicarCatraca([vio("R2", "users")], base)
    expect(r.ok).toBe(false)
    expect(r.motivos.join(" ")).toContain("(b)")
    expect(r.novas).toHaveLength(1)
    expect(r.resolvidas).toHaveLength(1)
  })

  it("R3 derruba sempre, mesmo se estiver no baseline (c)", () => {
    // R3 é declarada 'FAIL absoluto sem baseline' — não pode ser silenciada por congelamento.
    const r3 = vio("R3", "tabela_nova")
    const r = aplicarCatraca([r3], baselineCom([chaveDe(r3)]))
    expect(r.ok).toBe(false)
    expect(r.motivos.join(" ")).toContain("(c)")
  })

  it("celebra violação resolvida sem falhar", () => {
    const base = baselineCom([chaveDe(vio("R2", "leads")), chaveDe(vio("R2", "users"))])
    const r = aplicarCatraca([vio("R2", "leads")], base)
    expect(r.ok).toBe(true)
    expect(r.resolvidas).toHaveLength(1)
    expect(r.delta).toBe(-1)
  })

  it("WARN não conta para a catraca", () => {
    const base = baselineCom([])
    const r = aplicarCatraca([{ ...vio("R8", "f()"), severity: "WARN" }], base)
    expect(r.ok).toBe(true)
  })

  it("sem baseline, não inventa veredito", () => {
    const r = aplicarCatraca([vio("R2", "leads")], null)
    expect(r.motivos.join(" ")).toContain("baseline ausente")
  })
})

describe("R10-R12 — stubs desligados por flag", () => {
  it("retornam vazio sem GATE_ONDA e não estouram", () => {
    const s = schema([], [])
    expect(ruleR10(s, SEM_ALLOWLIST)).toEqual([])
    expect(ruleR11(s, SEM_ALLOWLIST)).toEqual([])
    expect(ruleR12(s, SEM_ALLOWLIST)).toEqual([])
  })
})
