import { describe, it, expect } from "vitest"
import { shouldHandoff, generateHandoffSummary, isNonLeadContact } from "./handoff"

describe("shouldHandoff", () => {
  it("triggers on high score + price request", () => {
    const result = shouldHandoff({
      qualificationScore: 80,
      message: "Quanto custa o apartamento?",
      conversationState: {},
    })
    expect(result.trigger).toBe(true)
    expect(result.reason).toContain("preco")
  })

  it("triggers on high score + simulation request", () => {
    const result = shouldHandoff({
      qualificationScore: 70,
      message: "Quero fazer uma simulação",
      conversationState: {},
    })
    expect(result.trigger).toBe(true)
  })

  it("does NOT trigger price handoff on low score", () => {
    const result = shouldHandoff({
      qualificationScore: 50,
      message: "Quanto custa?",
      conversationState: {},
    })
    // Low score + price should NOT trigger (score < 70)
    // But it might match out-of-scope patterns. Let's check:
    // "quanto custa" matches PRICE_SIMULATION_PATTERNS but score < 70
    // It does NOT match OUT_OF_SCOPE_PATTERNS
    expect(result.trigger).toBe(false)
  })

  it("does NOT trigger when visit has been scheduled (Nicole continues attending)", () => {
    const result = shouldHandoff({
      qualificationScore: 20,
      message: "ok",
      conversationState: { visit_proposed: true },
    })
    expect(result.trigger).toBe(false)
  })

  it("does NOT trigger when visit_availability is true (Nicole continues attending)", () => {
    const result = shouldHandoff({
      qualificationScore: 10,
      message: "ok",
      conversationState: { visit_availability: true },
    })
    expect(result.trigger).toBe(false)
  })

  it("triggers on out-of-scope: wants to talk to a broker", () => {
    const result = shouldHandoff({
      qualificationScore: 30,
      message: "Quero falar com um corretor",
      conversationState: {},
    })
    expect(result.trigger).toBe(true)
    expect(result.reason).toContain("fora do escopo")
  })

  it("triggers on out-of-scope: complaint", () => {
    const result = shouldHandoff({
      qualificationScore: 10,
      message: "Tenho uma reclamação sobre o atendimento",
      conversationState: {},
    })
    expect(result.trigger).toBe(true)
  })

  it("triggers on out-of-scope: contract questions", () => {
    const result = shouldHandoff({
      qualificationScore: 10,
      message: "Preciso saber sobre o contrato",
      conversationState: {},
    })
    expect(result.trigger).toBe(true)
  })

  it("triggers on out-of-scope: financing details", () => {
    const result = shouldHandoff({
      qualificationScore: 10,
      message: "Como funciona o financiamento?",
      conversationState: {},
    })
    expect(result.trigger).toBe(true)
  })

  it("does NOT trigger for regular conversation", () => {
    const result = shouldHandoff({
      qualificationScore: 30,
      message: "Bom dia, tudo bem?",
      conversationState: {},
    })
    expect(result.trigger).toBe(false)
  })

  it("does NOT trigger for low score without special keywords", () => {
    const result = shouldHandoff({
      qualificationScore: 10,
      message: "Quero saber mais sobre os quartos",
      conversationState: {},
    })
    expect(result.trigger).toBe(false)
  })

  it("does NOT trigger for non-lead contact (job seeker), even with high score", () => {
    const result = shouldHandoff({
      qualificationScore: 90,
      message: "Gostaria de saber se há vagas de emprego e enviar meu currículo",
      conversationState: {},
    })
    expect(result.trigger).toBe(false)
  })
})

describe("isNonLeadContact", () => {
  it("detects job/employment inquiries", () => {
    expect(isNonLeadContact("vocês têm vagas disponíveis?")).toBe(true)
    expect(isNonLeadContact("gostaria de enviar meu curriculo")).toBe(true)
    expect(isNonLeadContact("tenho interesse em fazer parte da equipe, processo seletivo")).toBe(true)
  })

  it("detects partnership / vendor inquiries", () => {
    expect(isNonLeadContact("tenho uma proposta de parceria")).toBe(true)
    expect(isNonLeadContact("sou fornecedor de materiais")).toBe(true)
  })

  it("detects media / advertising inquiries", () => {
    expect(isNonLeadContact("quero anunciar com vocês, proposta de mídia")).toBe(true)
    expect(isNonLeadContact("trabalho com publicidade exterior")).toBe(true)
  })

  it("does NOT flag genuine buyer messages", () => {
    expect(isNonLeadContact("quero comprar um apartamento")).toBe(false)
    expect(isNonLeadContact("tem unidade de 3 quartos disponível?")).toBe(false)
    expect(isNonLeadContact("gostaria de agendar uma visita")).toBe(false)
  })
})

describe("generateHandoffSummary", () => {
  it("returns formatted summary string with all sections", () => {
    const summary = generateHandoffSummary(
      {
        name: "Maria",
        property_interest: "yarden",
        bedrooms: 3,
        floor: "alto",
        view: "frente",
        garages: 2,
        has_down_payment: true,
        source: "instagram",
        visit_availability: true,
      },
      [
        { role: "user", content: "Oi, quero saber sobre o Yarden" },
        { role: "assistant", content: "Olá! O Yarden é um empreendimento incrível." },
        { role: "user", content: "Quanto custa?" },
      ]
    )

    expect(summary).toContain("=== RESUMO DO LEAD (HANDOFF) ===")
    expect(summary).toContain("Maria")
    expect(summary).toContain("yarden")
    expect(summary).toContain("3")
    expect(summary).toContain("alto")
    expect(summary).toContain("frente")
    expect(summary).toContain("instagram")
    expect(summary).toContain("sim") // has_down_payment=true
    expect(summary).toContain("MENSAGENS DO LEAD:")
    expect(summary).toContain("Quanto custa?")
    expect(summary).toContain("TOTAL DE MENSAGENS: 3")
    expect(summary).toContain("=== FIM DO RESUMO ===")
  })

  it("shows 'nao informado' for missing fields", () => {
    const summary = generateHandoffSummary({}, [])
    expect(summary).toContain("nao informado")
  })

  it("formats has_down_payment=false as 'nao'", () => {
    const summary = generateHandoffSummary({ has_down_payment: false }, [])
    expect(summary).toContain("Entrada disponivel: nao")
  })

  it("includes only user messages in conversation section", () => {
    const summary = generateHandoffSummary(
      {},
      [
        { role: "user", content: "Mensagem do usuario" },
        { role: "assistant", content: "Resposta do assistente" },
      ]
    )
    expect(summary).toContain("Mensagem do usuario")
    expect(summary).not.toContain("Resposta do assistente")
  })

  it("limits to last 5 user messages", () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({
      role: "user",
      content: `Mensagem ${i + 1}`,
    }))
    const summary = generateHandoffSummary({}, messages)
    expect(summary).not.toContain('"Mensagem 2"')
    expect(summary).toContain('"Mensagem 6"')
    expect(summary).toContain('"Mensagem 10"')
  })

  it("truncates long messages at 200 characters", () => {
    const longMessage = "A".repeat(300)
    const summary = generateHandoffSummary({}, [
      { role: "user", content: longMessage },
    ])
    expect(summary).toContain("...")
    expect(summary).not.toContain("A".repeat(300))
  })
})
