/**
 * Story 75-344 — para onde vai quem abre CRM/Meta Ads sem ter o módulo.
 *
 * A decisão é pura de propósito: as telas são server components que puxam sessão
 * e permissões, e o projeto não tem jsdom. O que precisa ser garantido é a ordem
 * de destino — e que ninguém tome 404 tendo uma aba permitida.
 */
import { describe, it, expect } from "vitest"
import { destinoSemModuloCampanhas } from "./access"

describe("destinoSemModuloCampanhas", () => {
  it("com a tela de Formulários → vai para Formulários", () => {
    expect(destinoSemModuloCampanhas({ modulo: false, formularios: true, agente: false })).toBe(
      "/dashboard/campaigns/formularios"
    )
  })

  it("só com a Lídia → vai para a Lídia (a porta que o perfil de marketing já usa)", () => {
    expect(destinoSemModuloCampanhas({ modulo: false, formularios: false, agente: true })).toBe(
      "/dashboard/campaigns/agente"
    )
  })

  it("com as duas, Formulários ganha", () => {
    // Quem recebeu a tela de Formulários recebeu para usá-la; a Lídia continua
    // acessível pela aba.
    expect(destinoSemModuloCampanhas({ modulo: false, formularios: true, agente: true })).toBe(
      "/dashboard/campaigns/formularios"
    )
  })

  it("sem nenhuma aba → null, e aí a tela responde notFound", () => {
    expect(destinoSemModuloCampanhas({ modulo: false, formularios: false, agente: false })).toBeNull()
  })
})
