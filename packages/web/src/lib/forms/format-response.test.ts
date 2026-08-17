import { describe, it, expect } from "vitest"
import { formatarRespostas } from "./format-response"
import type { FormSchema } from "./schema"

// Story 75-330 — AC9. O schema é editável em produção: o histórico do lead não
// pode depender de o formulário ter continuado igual.

const schema: FormSchema = {
  perguntas: [
    { id: "nome", tipo: "texto", titulo: "Seu nome" },
    {
      id: "pagamento",
      tipo: "escolha",
      titulo: "Como pretende pagar?",
      opcoes: [
        { valor: "vista", rotulo: "À vista" },
        { valor: "financiado", rotulo: "Financiado" },
      ],
    },
    {
      id: "motivo",
      tipo: "multipla",
      titulo: "O que busca?",
      opcoes: [
        { valor: "morar", rotulo: "Morar" },
        { valor: "investir", rotulo: "Investir" },
      ],
    },
  ],
}

describe("formatarRespostas", () => {
  it("traduz valor para rótulo e mantém a ordem do schema", () => {
    expect(formatarRespostas(schema, { pagamento: "financiado", nome: "Ana" })).toEqual([
      { perguntaId: "nome", titulo: "Seu nome", resposta: "Ana" },
      { perguntaId: "pagamento", titulo: "Como pretende pagar?", resposta: "Financiado" },
    ])
  })

  it("junta múltipla escolha com vírgula, usando os rótulos", () => {
    const r = formatarRespostas(schema, { motivo: ["morar", "investir"] })
    expect(r[0]!.resposta).toBe("Morar, Investir")
  })

  it("omite pergunta sem resposta, em branco ou com lista vazia", () => {
    expect(formatarRespostas(schema, { nome: "   ", motivo: [] })).toEqual([])
  })

  it("opção removida do schema mostra o valor cru em vez de sumir", () => {
    const r = formatarRespostas(schema, { pagamento: "consorcio" })
    expect(r[0]!.resposta).toBe("consorcio")
  })

  it("PRESERVA resposta de pergunta que foi apagada do formulário", () => {
    // Apagar a pergunta não pode apagar o que o lead respondeu.
    const r = formatarRespostas(schema, { nome: "Ana", pergunta_antiga: "valor histórico" })
    expect(r).toContainEqual({
      perguntaId: "pergunta_antiga",
      titulo: "pergunta_antiga",
      resposta: "valor histórico",
    })
  })

  it("formulário sem respostas devolve lista vazia", () => {
    expect(formatarRespostas(schema, {})).toEqual([])
  })
})
