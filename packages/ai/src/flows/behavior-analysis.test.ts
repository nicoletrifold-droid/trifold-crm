import { describe, it, expect } from "vitest"
import { parseBehaviorAnalysis } from "./behavior-analysis"

const VALID = {
  estagio_real: "Visita quase agendada — funil diz 'Atendimento', comportamento indica avanço",
  temperatura: "morno — responde rápido mas evita falar de orçamento",
  sinais: ["Remarcou visita mas se recomprometeu (21/07)", "Responde em <5min"],
  objecoes: ["provavel: não quer imobilizar capital"],
  como_abordar: "WhatsApp na segunda de manhã, confirmar visita com opção de horário",
  proxima_acao: "Enviar WhatsApp segunda 09h confirmando a visita",
  dados_faltando: [],
  resumo: "Lead com interesse real, travado em objeção financeira não verbalizada.",
}

describe("parseBehaviorAnalysis", () => {
  it("aceita JSON válido completo", () => {
    const result = parseBehaviorAnalysis(JSON.stringify(VALID))
    expect(result).not.toBeNull()
    expect(result!.estagio_real).toContain("Visita")
    expect(result!.sinais).toHaveLength(2)
    expect(result!.dados_faltando).toEqual([])
  })

  it("aceita JSON embrulhado em code block markdown", () => {
    const result = parseBehaviorAnalysis("```json\n" + JSON.stringify(VALID) + "\n```")
    expect(result).not.toBeNull()
    expect(result!.proxima_acao).toContain("segunda")
  })

  it("rejeita JSON sem campo obrigatório (como_abordar)", () => {
    const { como_abordar: _omit, ...incomplete } = VALID
    expect(parseBehaviorAnalysis(JSON.stringify(incomplete))).toBeNull()
  })

  it("rejeita campo obrigatório vazio", () => {
    expect(parseBehaviorAnalysis(JSON.stringify({ ...VALID, resumo: "  " }))).toBeNull()
  })

  it("rejeita texto que não é JSON", () => {
    expect(parseBehaviorAnalysis("O lead parece interessado em comprar.")).toBeNull()
  })

  it("normaliza arrays ausentes/impuros para arrays de string", () => {
    const messy = { ...VALID, sinais: undefined, objecoes: ["ok", 42, null, "outra"] }
    const result = parseBehaviorAnalysis(JSON.stringify(messy))
    expect(result).not.toBeNull()
    expect(result!.sinais).toEqual([])
    expect(result!.objecoes).toEqual(["ok", "outra"])
  })
})
