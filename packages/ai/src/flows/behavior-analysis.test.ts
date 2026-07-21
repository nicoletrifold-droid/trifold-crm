import { describe, it, expect, vi } from "vitest"
import type Anthropic from "@anthropic-ai/sdk"
import { analyzeLeadBehavior, parseBehaviorAnalysis } from "./behavior-analysis"

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

  it("recorta JSON cercado de prosa (primeiro { ao último })", () => {
    const wrapped = `Aqui está a análise solicitada:\n${JSON.stringify(VALID)}\nEspero ter ajudado.`
    const result = parseBehaviorAnalysis(wrapped)
    expect(result).not.toBeNull()
    expect(result!.temperatura).toContain("morno")
  })

  it("normaliza arrays ausentes/impuros para arrays de string", () => {
    const messy = { ...VALID, sinais: undefined, objecoes: ["ok", 42, null, "outra"] }
    const result = parseBehaviorAnalysis(JSON.stringify(messy))
    expect(result).not.toBeNull()
    expect(result!.sinais).toEqual([])
    expect(result!.objecoes).toEqual(["ok", "outra"])
  })
})

describe("analyzeLeadBehavior — blocos de resposta do Sonnet (Story 82-4)", () => {
  const input = {
    leadProfile: { nome: "Palmieri" },
    currentStage: "Atendimento",
    chronology: [
      { at: "2026-07-21T12:18:00Z", source: "Nota do corretor", description: "vem semana que vem" },
    ],
    now: "2026-07-21T15:00:00Z",
  }

  function mockClient(content: unknown[]): Anthropic {
    return {
      messages: { create: vi.fn().mockResolvedValue({ content }) },
    } as unknown as Anthropic
  }

  it("lê o texto mesmo com bloco de thinking ANTES (adaptive thinking padrão do Sonnet 5)", async () => {
    const client = mockClient([
      { type: "thinking", thinking: "" },
      { type: "text", text: JSON.stringify(VALID) },
    ])
    const result = await analyzeLeadBehavior(client, input)
    expect(result).not.toBeNull()
    expect(result!.proxima_acao).toContain("segunda")
  })

  it("concatena múltiplos blocos de texto", async () => {
    const json = JSON.stringify(VALID)
    const client = mockClient([
      { type: "thinking", thinking: "" },
      { type: "text", text: json.slice(0, 40) },
      { type: "text", text: json.slice(40) },
    ])
    const result = await analyzeLeadBehavior(client, input)
    expect(result).not.toBeNull()
  })

  it("devolve null se só vier thinking (sem texto)", async () => {
    const client = mockClient([{ type: "thinking", thinking: "" }])
    const result = await analyzeLeadBehavior(client, input)
    expect(result).toBeNull()
  })
})
