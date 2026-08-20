import { describe, it, expect } from "vitest"
import {
  extractCollectedData,
  podeGravarNomeDoLead,
  normalizaParaStopword,
} from "./qualification"

/**
 * Story 75-360 — o nome do lead sendo destruído por texto qualquer.
 *
 * Casos medidos em produção (20/08/2026, minutos depois de o cron de follow-up
 * voltar a entregar): três leads perderam o nome real para a própria resposta.
 */
describe("75-360 — palpite não apaga nome que o lead já tem", () => {
  const casosDeProducao: [string, string][] = [
    ["Melquiades Jesus", "Já comprei"],
    ["Cleonice Viana", "Oii"],
    ["Amauri", "Morar"],
  ]

  it.each(casosDeProducao)("%s não vira \"%s\"", (nomeReal, resposta) => {
    const extraido = extractCollectedData(resposta, {})
    // Se o extrator ainda achar nome aí, a guarda tem de barrar de todo jeito.
    expect(
      podeGravarNomeDoLead(nomeReal, extraido.name, extraido.name_origin)
    ).toBe(false)
  })

  it("lead SEM nome aceita palpite (é o que preenche o vazio)", () => {
    const extraido = extractCollectedData("João Silva", {})
    expect(extraido.name).toBe("João Silva")
    expect(extraido.name_origin).toBe("inferido")
    expect(podeGravarNomeDoLead(null, extraido.name, extraido.name_origin)).toBe(true)
    expect(podeGravarNomeDoLead("", extraido.name, extraido.name_origin)).toBe(true)
    expect(podeGravarNomeDoLead("   ", extraido.name, extraido.name_origin)).toBe(true)
  })

  it("lead COM nome só troca por nome DECLARADO", () => {
    const declarado = extractCollectedData("meu nome é Amauri Souza", {})
    expect(declarado.name).toBe("Amauri Souza")
    expect(declarado.name_origin).toBe("declarado")
    // Aqui a troca é legítima: a pessoa disse o nome dela.
    expect(podeGravarNomeDoLead("Amauri", declarado.name, declarado.name_origin)).toBe(true)

    // O mesmo nome vindo de palpite NÃO troca.
    expect(podeGravarNomeDoLead("Amauri", "Amauri Souza", "inferido")).toBe(false)
  })

  it("mesmo nome em caixa diferente passa (normaliza sem exigir declaração)", () => {
    expect(podeGravarNomeDoLead("joao", "João", "inferido")).toBe(true)
    expect(podeGravarNomeDoLead("JOÃO", "João", "inferido")).toBe(true)
  })

  it("nunca grava lixo, com ou sem nome atual", () => {
    expect(podeGravarNomeDoLead(null, "", "declarado")).toBe(false)
    expect(podeGravarNomeDoLead(null, "   ", "declarado")).toBe(false)
    expect(podeGravarNomeDoLead(null, undefined, "declarado")).toBe(false)
    expect(podeGravarNomeDoLead(null, 42, "declarado")).toBe(false)
    // A própria Nicole nunca é o nome do lead.
    expect(podeGravarNomeDoLead(null, "Nicole", "declarado")).toBe(false)
    expect(podeGravarNomeDoLead("Amauri", "nicole", "declarado")).toBe(false)
  })
})

describe("75-360 — stoplist tolerante a letra repetida", () => {
  it("colapsa letra repetida", () => {
    expect(normalizaParaStopword("Oii")).toBe("oi")
    expect(normalizaParaStopword("oiiii")).toBe("oi")
    expect(normalizaParaStopword("simm")).toBe("sim")
    expect(normalizaParaStopword("obggg")).toBe("obg")
    // Não estraga nome com letra dobrada legítima.
    expect(normalizaParaStopword("Anna")).toBe("ana")
  })

  it("os cumprimentos e respostas de produção param de virar nome", () => {
    const lixo = [
      "Oii", "Oiii", "Morar", "Já comprei", "E aí", "Tá bom", "É parcelado",
      "Pede senha", "Até", "Faz tempo", "Investimento", "Bom dia",
    ]
    for (const texto of lixo) {
      expect(extractCollectedData(texto, {}).name, texto).toBeUndefined()
    }
  })

  it("nome de verdade continua passando", () => {
    // 🔒 O contrapeso: stoplist agressiva demais deixaria de captar nome real.
    for (const nome of ["João Silva", "Priscila Tanijo", "Maria Cristina Gonzalez"]) {
      expect(extractCollectedData(nome, {}).name, nome).toBe(nome)
    }
  })
})
