import { describe, it, expect } from "vitest"
import {
  extractCollectedData,
  calculateQualificationScore,
  getNextQualificationStep,
} from "./qualification"
import { interestLevelFromScore } from "./interest-level"

/**
 * Story 75-347 — a finalidade (moradia × investimento) entra na régua.
 *
 * O teste que importa mais aqui é o de ORIGEM: a pergunta da própria Nicole
 * contém as duas palavras, e extrair dela reproduziria a 87-4.
 */
describe("75-347 — extração de finalidade", () => {
  const lead = { origem: "lead" as const }

  it("extrai moradia da fala do lead", () => {
    expect(extractCollectedData("é pra morar, quero sair do aluguel", {}, lead).finalidade).toBe("moradia")
    expect(extractCollectedData("Moradia", {}, lead).finalidade).toBe("moradia")
    expect(extractCollectedData("pra mim e minha família", {}, lead).finalidade).toBe("moradia")
  })

  it("extrai investimento da fala do lead", () => {
    expect(extractCollectedData("é investimento mesmo", {}, lead).finalidade).toBe("investimento")
    expect(extractCollectedData("penso em comprar pra alugar depois", {}, lead).finalidade).toBe("investimento")
    expect(extractCollectedData("quero saber da valorização até a entrega", {}, lead).finalidade).toBe("investimento")
  })

  it("marca ambos quando o lead cita os dois", () => {
    expect(
      extractCollectedData("é pra morar agora e depois virar investimento", {}, lead).finalidade
    ).toBe("ambos")
  })

  it("🔥 NÃO extrai da fala da Nicole — a pergunta dela tem as duas palavras", () => {
    const perguntaDaNicole = "Você está buscando pra morar ou pensando mais como investimento?"
    expect(extractCollectedData(perguntaDaNicole, {}, { origem: "assistant" }).finalidade).toBeUndefined()
    // Fail-closed: sem origem declarada, nada é escrito.
    expect(extractCollectedData(perguntaDaNicole, {}).finalidade).toBeUndefined()
  })

  it("não sobrescreve finalidade já conhecida", () => {
    const atual = { finalidade: "investimento" }
    expect(extractCollectedData("é pra morar", atual, lead).finalidade).toBe("investimento")
  })

  it("mensagem sem sinal nenhum deixa a finalidade nula", () => {
    expect(extractCollectedData("bom dia, tudo bem?", {}, lead).finalidade).toBeUndefined()
    expect(extractCollectedData("quero saber o valor", {}, lead).finalidade).toBeUndefined()
  })
})

describe("75-347 — a régua de calor", () => {
  it("os pesos somam exatamente 100", () => {
    const todos = {
      name: "Ana",
      finalidade: "moradia",
      property_interest: "vind",
      bedrooms: 2,
      floor: "alto",
      view: "frente",
      garages: 1,
      has_down_payment: true,
      source: "meta_ads",
      visit_availability: "sexta 10h",
    }
    expect(calculateQualificationScore(todos)).toBe(100)
  })

  it("🔥 lead que SÓ aceitou visita não chega a hot (era o defeito medido)", () => {
    // Antes da 75-347 a visita valia 20 e carregava 82% dos leads `hot`.
    const soVisita = { name: "Ana", property_interest: "vind", visit_availability: "sexta 10h" }
    const score = calculateQualificationScore(soVisita)
    expect(score).toBeLessThan(70)
    expect(interestLevelFromScore(score)).not.toBe("hot")
  })

  it("a visita vale 10 e a finalidade vale 10", () => {
    const base = { name: "Ana" }
    const comVisita = calculateQualificationScore({ ...base, visit_availability: "sexta 10h" })
    const comFinalidade = calculateQualificationScore({ ...base, finalidade: "moradia" })
    expect(comVisita - calculateQualificationScore(base)).toBe(10)
    expect(comFinalidade - calculateQualificationScore(base)).toBe(10)
  })

  it("a finalidade é perguntada antes da ficha técnica", () => {
    expect(getNextQualificationStep({ name: "Ana" })).toBe("finalidade")
    expect(getNextQualificationStep({ name: "Ana", finalidade: "moradia" })).toBe("property_interest")
  })
})
