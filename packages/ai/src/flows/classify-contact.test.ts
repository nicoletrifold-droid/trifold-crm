import { describe, it, expect, vi } from "vitest"
import type Anthropic from "@anthropic-ai/sdk"
import {
  classifyContactIntent,
  parseContactClassification,
} from "./classify-contact"

/** Mock mínimo do client Anthropic que devolve um bloco de texto fixo. */
function mockAnthropic(text: string): Anthropic {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text }],
      }),
    },
  } as unknown as Anthropic
}

/** Mock que sempre lança — usado para garantir que o LLM NÃO foi chamado. */
function throwingAnthropic(): Anthropic {
  return {
    messages: {
      create: vi.fn().mockRejectedValue(new Error("não deveria ter chamado")),
    },
  } as unknown as Anthropic
}

describe("parseContactClassification", () => {
  it("parseia JSON válido de não-lead", () => {
    const r = parseContactClassification('{"is_lead": false, "category": "emprego", "reason": "candidato"}')
    expect(r.isLead).toBe(false)
    expect(r.category).toBe("emprego")
  })

  it("parseia JSON envolto em code block markdown", () => {
    const r = parseContactClassification('```json\n{"is_lead": true, "category": "lead", "reason": "comprador"}\n```')
    expect(r.isLead).toBe(true)
    expect(r.category).toBe("lead")
  })

  it("default seguro (isLead=true) para JSON inválido", () => {
    expect(parseContactClassification("isso não é json").isLead).toBe(true)
  })

  it("default seguro quando is_lead não é boolean", () => {
    expect(parseContactClassification('{"is_lead": "sim"}').isLead).toBe(true)
  })

  it("normaliza categoria inválida para 'outro' quando não-lead", () => {
    const r = parseContactClassification('{"is_lead": false, "category": "xpto", "reason": "x"}')
    expect(r.category).toBe("outro")
  })

  it("aceita a categoria cliente_existente (Story 76-3)", () => {
    const r = parseContactClassification('{"is_lead": false, "category": "cliente_existente", "reason": "fala da obra dele"}')
    expect(r.isLead).toBe(false)
    expect(r.category).toBe("cliente_existente")
  })
})

describe("classifyContactIntent", () => {
  it("AC3: keyword inequívoca → não-lead SEM chamar o LLM", async () => {
    const anthropic = throwingAnthropic()
    const r = await classifyContactIntent(anthropic, "gostaria de enviar meu currículo")
    expect(r.isLead).toBe(false)
    expect(anthropic.messages.create).not.toHaveBeenCalled()
  })

  it("AC1: pitch profissional de candidato (sem keyword) → não-lead via Haiku", async () => {
    const anthropic = mockAnthropic('{"is_lead": false, "category": "emprego", "reason": "candidato a emprego"}')
    const r = await classifyContactIntent(
      anthropic,
      "Com mais de 15 anos de experiência na área de Perícia e avaliação de imóveis, acredito que minha experiência profissional possa ajudar ao máximo essa empresa."
    )
    expect(r.isLead).toBe(false)
    expect(anthropic.messages.create).toHaveBeenCalledOnce()
  })

  it("AC2: 'vaga de garagem' → lead", async () => {
    const anthropic = mockAnthropic('{"is_lead": true, "category": "lead", "reason": "interesse em vaga de garagem"}')
    const r = await classifyContactIntent(anthropic, "esse apê tem vaga de garagem?")
    expect(r.isLead).toBe(true)
  })

  it("AC4: falha do Haiku → default seguro isLead=true", async () => {
    const r = await classifyContactIntent(throwingAnthropic(), "mensagem ambígua qualquer sobre o empreendimento")
    expect(r.isLead).toBe(true)
  })

  it("mensagem vazia sem documento → lead sem chamar LLM", async () => {
    const anthropic = throwingAnthropic()
    const r = await classifyContactIntent(anthropic, "")
    expect(r.isLead).toBe(true)
    expect(anthropic.messages.create).not.toHaveBeenCalled()
  })

  it("passa hasDocument ao prompt quando há anexo de documento", async () => {
    const anthropic = mockAnthropic('{"is_lead": false, "category": "emprego", "reason": "currículo anexado"}')
    await classifyContactIntent(anthropic, "segue em anexo", { hasDocument: true })
    const callArg = (anthropic.messages.create as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(callArg.messages[0].content).toContain("anexou um documento")
  })
})
