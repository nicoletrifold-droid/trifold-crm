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

  it("qualquer TELA registrada no SUBMODULE_MAP concedida serve", () => {
    // Story 75-300: o contrato mudou de "qualquer prefixo configuracoes.*" para
    // "tela registrada no SUBMODULE_MAP" — o teste antigo usava
    // "configuracoes.corretores", chave que nunca existiu no mapa (a UI de
    // exceções só grava chaves do mapa, então em prod não há linhas fora dele).
    for (const sub of Object.keys(SUBMODULE_MAP["configuracoes"] ?? {})) {
      expect(podeVerMenuConfig({ configuracoes: false, [sub]: true }), sub).toBe(true)
    }
  })

  // Story 75-300 (Perfis de Acesso 2.0) — o seed de capabilities grava AÇÕES como
  // `configuracoes.atendente_padrao_ver`; elas NÃO podem abrir o menu Config
  // (supervisor tem o módulo desligado e ganharia o menu no dia 1 — o gotcha da story).
  it("🔴 O CASO DA 75-300 — capability de AÇÃO concedida NÃO abre o menu", () => {
    expect(
      podeVerMenuConfig({
        configuracoes: false,
        "configuracoes.atendente_padrao_ver": true,
        "configuracoes.pipeline_followup": true,
      })
    ).toBe(false)
  })

  it("75-300 — tela E ação juntas: a tela continua mandando", () => {
    expect(
      podeVerMenuConfig({
        configuracoes: false,
        "configuracoes.pipeline": true,
        "configuracoes.atendente_padrao_ver": true,
      })
    ).toBe(true)
  })
})

// Story 84-1 (Epic 84) — sub-módulo leads.qualificacao (Qualificação Comercial).
describe("SUBMODULE_MAP.leads", () => {
  it("tem a entrada leads.qualificacao com o label esperado", () => {
    expect(SUBMODULE_MAP.leads).toEqual({ "leads.qualificacao": "Qualificação Comercial" })
  })
})
