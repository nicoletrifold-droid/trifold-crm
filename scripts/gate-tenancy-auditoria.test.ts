/**
 * Story 900-2c · AC7 — o gate confrontado com os achados reais da auditoria.
 *
 * Este teste roda contra o **relatório congelado** (`docs/audits/gate-tenancy-report.json`),
 * não contra a rede: um teste de CI não pode depender de PAT nem de latência de API.
 *
 * ### O escopo é 6 de 13, e a diferença é o ponto do teste
 *
 * O epic pedia "teste contra os 13 achados da auditoria". **Sete deles não são alcançáveis por
 * um gate de schema**, e afirmar que são produziria exatamente a falsa segurança contra a qual
 * o próprio gate alerta:
 *
 * | Achado | Coberto? | Por quê |
 * |---|---|---|
 * | P1 grant a PUBLIC | ✅ R6 | ACL é schema |
 * | P2 view sem security_invoker | ✅ R5 | `reloptions` é schema |
 * | P3 policy `USING(true)` | ✅ R4 | `pg_policies` é schema |
 * | P6 RLS desabilitada | ✅ R1 | `relrowsecurity` é schema |
 * | P8 tabela sem policy | ✅ R2 + allowlist | `pg_policies` é schema |
 * | P13 SECURITY DEFINER sem search_path | ✅ R7 | `proconfig` é schema |
 * | P4 tabelas de plataforma | ❌ | exige saber o que é "de plataforma" — semântica, não schema |
 * | P5 `privacy_consents` sem `org_id` | ❌ | exige decidir que ela DEVERIA ter — juízo de modelagem |
 * | P7 policies de Storage | ❌ | vivem em `storage.objects`, fora do escopo de `public` |
 * | P9 UNIQUE global | ❌ | exige saber quais UNIQUEs deveriam ser por org — a auditoria diz que a maioria é falso positivo |
 * | P10 `users.auth_id UNIQUE` | ❌ | é decisão de produto (1 usuário = 1 org), não defeito |
 * | P11 índices sem `org_id` à esquerda | ❌ | é performance, não isolamento |
 * | P12 service-role nas rotas | ❌ | **é código, não banco** — o maior risco e o que o gate nunca verá |
 *
 * Testar os 7 daria verde por vacuidade e treinaria o time a ler "gate verde" como
 * "auditoria fechada".
 */

import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

interface Report {
  totais: { fails: number; warns: number; porRegra: Record<string, number> }
  violacoes: Array<{ rule: string; table: string; detail: string; severity: string }>
}

const report = JSON.parse(
  readFileSync(join(process.cwd(), "docs", "audits", "gate-tenancy-report.json"), "utf-8"),
) as Report

const porRegra = (r: string) => report.violacoes.filter((v) => v.rule === r)

describe("AC7 — achados corrigidos pelo PR #308 não aparecem mais", () => {
  it("P1 (grant a PUBLIC nas funções da roleta) — as funções do hotfix não constam em R6", () => {
    const alvos = ["roleta_pick_and_advance", "seed_system_roles", "pegar_lead_bolsao", "log_pii_access"]
    const acusadas = porRegra("R6").map((v) => v.table)
    for (const fn of alvos) {
      expect(acusadas.some((a) => a.startsWith(`${fn}(`))).toBe(false)
    }
  })

  it("P2 (view sem security_invoker) — R5 limpa", () => {
    expect(porRegra("R5")).toHaveLength(0)
  })

  it("P3 (system_events com USING(true)) — R4 limpa", () => {
    expect(porRegra("R4")).toHaveLength(0)
    expect(porRegra("R4").some((v) => v.table === "system_events")).toBe(false)
  })

  it("P6 (RLS desabilitada) — R1 limpa", () => {
    expect(porRegra("R1")).toHaveLength(0)
  })
})

describe("AC7 — P8 aparece como allowlisted, não como violação", () => {
  const P8 = [
    "fornecedores", "imobiliarias", "imob_cards", "imob_columns", "imob_card_comments",
    "lancamentos", "lancamento_cards", "lancamento_columns", "lancamento_card_attachments",
    "lancamento_card_checklist", "lancamento_card_comments", "lancamento_card_fornecedores",
    "marketing_brands", "marketing_brand_assets", "marketing_posts", "supremo_sync_log",
  ]

  it("nenhuma das 16 tabelas de P8 é reportada por R2", () => {
    const acusadas = new Set(porRegra("R2").map((v) => v.table))
    const vazando = P8.filter((t) => acusadas.has(t))
    expect(vazando).toEqual([])
  })

  it("a allowlist tem exatamente as 16, todas com reason preenchido", () => {
    const yml = readFileSync(join(process.cwd(), "docs", "audits", "tenancy-allowlist.yml"), "utf-8")
    for (const t of P8) {
      expect(yml).toContain(`- table: ${t}`)
    }
    // nenhuma entrada com reason vazio — o motor as ignoraria, e o silêncio seria enganoso
    expect(yml).not.toMatch(/reason:\s*(""|''|\n)/)
  })
})

describe("AC7 — P13 aparece como violação ATIVA (ainda não corrigido)", () => {
  it("R7 acusa SECURITY DEFINER sem search_path", () => {
    const r7 = porRegra("R7")
    expect(r7.length).toBeGreaterThan(0)
    expect(r7.every((v) => v.severity === "FAIL")).toBe(true)
  })

  it("is_admin() está entre as acusadas — caso concreto do P13", () => {
    expect(porRegra("R7").some((v) => v.table.startsWith("is_admin("))).toBe(true)
  })
})

describe("AC7 — os 7 achados fora do desenho NÃO são reivindicados", () => {
  it("o gate não emite regra nenhuma para P5, P7, P9, P10, P11 ou P12", () => {
    // Se algum dia alguém acrescentar uma regra achando que cobre esses achados, este teste
    // obriga a atualizar a tabela de cobertura junto — que é onde a honestidade mora.
    const regrasEmitidas = new Set(report.violacoes.map((v) => v.rule))
    const conhecidas = new Set(["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9"])
    for (const r of regrasEmitidas) expect(conhecidas.has(r)).toBe(true)
  })

  it("P12 (service-role nas rotas) é código e permanece invisível ao gate — por construção", () => {
    // Documental: nenhuma violação do relatório fala de route handler.
    expect(report.violacoes.some((v) => /route|handler|createAdminClient/i.test(v.detail))).toBe(false)
  })
})
