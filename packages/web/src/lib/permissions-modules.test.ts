import { describe, expect, it } from "vitest"

import { podeVerMenuConfig, SUBMODULE_MAP } from "./permissions-modules"

// Story 75-251 — o menu Config aparece por SUB-módulo, sem abrir o pai.
describe("podeVerMenuConfig", () => {
  it("admin/supervisor: tem o pai → vê o menu", () => {
    expect(podeVerMenuConfig({ configuracoes: true })).toBe(true)
  })

  it("🔴 O CASO DA STORY — gerente-comercial: pai FALSE, mas tem configuracoes.pipeline → vê o menu", () => {
    expect(
      podeVerMenuConfig({ configuracoes: false, "configuracoes.pipeline": true, corretores: true })
    ).toBe(true)
  })

  it("AC4 — sub-módulo explicitamente FALSE não faz o menu aparecer", () => {
    expect(podeVerMenuConfig({ configuracoes: false, "configuracoes.pipeline": false })).toBe(false)
  })

  it("perfil sem nada de configuracoes segue sem o menu", () => {
    expect(podeVerMenuConfig({ leads: true, agenda: true, configuracoes: false })).toBe(false)
    expect(podeVerMenuConfig({})).toBe(false)
  })

  it("não confunde módulo que só COMEÇA parecido com o prefixo", () => {
    // "configuracoesx" não é sub-módulo de "configuracoes" (o ponto é o separador)
    expect(podeVerMenuConfig({ configuracoes: false, configuracoesx: true })).toBe(false)
  })

  it("qualquer sub-módulo concedido serve — vale por construção p/ perfis futuros", () => {
    for (const sub of ["configuracoes.corretores", "configuracoes.horario", "configuracoes.clientes"]) {
      expect(podeVerMenuConfig({ configuracoes: false, [sub]: true })).toBe(true)
    }
  })
})

// Story 84-1 (Epic 84) — sub-módulo leads.qualificacao (Qualificação Comercial).
describe("SUBMODULE_MAP.leads", () => {
  it("tem a entrada leads.qualificacao com o label esperado", () => {
    expect(SUBMODULE_MAP.leads).toEqual({ "leads.qualificacao": "Qualificação Comercial" })
  })
})
