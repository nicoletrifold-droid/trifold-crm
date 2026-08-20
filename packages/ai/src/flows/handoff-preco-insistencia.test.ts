import { describe, it, expect } from "vitest"
import {
  shouldHandoff,
  ehPedidoDePrecoDoLead,
  PEDIDOS_DE_PRECO_PARA_ESCALAR,
} from "./handoff"

/**
 * Story 75-361 — escalar na 2ª insistência em preço (caminho A, decisão do
 * Marcos em 20/08). A política de preço NÃO muda: a Nicole segue sem cotar.
 */
describe("75-361 — insistência em preço chama o corretor", () => {
  const base = { qualificationScore: 10, conversationState: {} }

  it("o limiar é 2", () => {
    expect(PEDIDOS_DE_PRECO_PARA_ESCALAR).toBe(2)
  })

  it("1º pedido NÃO escala (lead com score baixo segue com a Nicole)", () => {
    const r = shouldHandoff({ ...base, message: "Qual o valor do imóvel?", pedidosDePrecoDoLead: 1 })
    expect(r.trigger).toBe(false)
  })

  it("2º pedido escala, mesmo com score baixo", () => {
    const r = shouldHandoff({ ...base, message: "Qual o valor do imóvel?", pedidosDePrecoDoLead: 2 })
    expect(r.trigger).toBe(true)
    expect(r.motivo).toBe("preco_insistencia")
    expect(r.reason).toContain("2x")
  })

  it("o caso Maria Inês: 7º pedido continua escalando", () => {
    const r = shouldHandoff({ ...base, message: "Valor do imóvel?", pedidosDePrecoDoLead: 7 })
    expect(r.motivo).toBe("preco_insistencia")
  })

  it("mensagem que NÃO é pedido de preço não escala, mesmo com contador alto", () => {
    // A contagem alta é histórico; quem dispara é a mensagem de AGORA. Sem isto,
    // "0k" e "Sim." — que a Maria Inês mandou — virariam gatilho.
    for (const texto of ["0k", "Sim.", "?", "Obrigado", "Semana q vem a gente se fala."]) {
      const r = shouldHandoff({ ...base, message: texto, pedidosDePrecoDoLead: 7 })
      expect(r.motivo, texto).not.toBe("preco_insistencia")
    }
  })

  it("sem o contador o comportamento é o de ANTES (parâmetro opcional)", () => {
    const r = shouldHandoff({ ...base, message: "Qual o valor do imóvel?" })
    expect(r.trigger).toBe(false)
  })

  it("não-lead nunca escala, nem insistindo em preço", () => {
    const r = shouldHandoff({
      ...base,
      message: "Quero enviar meu currículo, qual o valor da vaga?",
      pedidosDePrecoDoLead: 5,
    })
    expect(r.trigger).toBe(false)
  })

  it("score alto continua escalando no 1º pedido (gatilho antigo intacto)", () => {
    const r = shouldHandoff({
      qualificationScore: 80,
      conversationState: {},
      message: "Qual o valor?",
      pedidosDePrecoDoLead: 1,
    })
    expect(r.trigger).toBe(true)
    expect(r.motivo).toBe("preco_qualificado")
  })

  it("fora de escopo continua com o motivo próprio", () => {
    const r = shouldHandoff({ ...base, message: "Quero falar com um corretor" })
    expect(r.trigger).toBe(true)
    expect(r.motivo).toBe("fora_de_escopo")
  })
})

describe("75-361 — a régua de 'pedido de preço' é uma só", () => {
  it("reconhece as formas que a produção mostrou", () => {
    for (const t of [
      "Valor do imóvel?",
      "Qual o preço?",
      "quanto custa",
      "Com 2 quartos qual o valor?",
      "Que valor sai?",
      "tem financiamento?",
      "manda a tabela",
      "consegue fazer uma simulação?",
      "qual a parcela",
    ]) {
      expect(ehPedidoDePrecoDoLead(t), t).toBe(true)
    }
  })

  it("FURO CONHECIDO: 'condições de pagamento' não conta como pedido de preço", () => {
    // Mensagem real da Maria Inês em 25/06 ("E condiçõe de pagamento"), e a régua
    // não pega. NÃO alarguei o padrão de propósito: `PRICE_SIMULATION_PATTERNS` é
    // COMPARTILHADO com o gatilho antigo de `score >= 70`, e acrescentar
    // "pagamento" mudaria quando aquele dispara — comportamento novo fora do que
    // foi decidido nesta story. Fica documentado para o Marcos decidir.
    expect(ehPedidoDePrecoDoLead("E condiçõe de pagamento")).toBe(false)
    expect(ehPedidoDePrecoDoLead("quais as condições de pagamento?")).toBe(false)
  })

  it("não confunde conversa comum com pedido de preço", () => {
    for (const t of ["Oi", "Moro em Maringá", "Já comprei", "Bom dia", "Pode ser sexta", ""]) {
      expect(ehPedidoDePrecoDoLead(t), t).toBe(false)
    }
    expect(ehPedidoDePrecoDoLead(null)).toBe(false)
    expect(ehPedidoDePrecoDoLead(undefined)).toBe(false)
  })
})
