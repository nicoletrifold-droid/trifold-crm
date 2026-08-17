import { describe, it, expect } from "vitest"
import { calcularScore } from "./score"
import type { FormSchema } from "./schema"

// Story 75-330 — AC5. Os três casos que a AC exige nominalmente: peso ausente,
// resposta fora das opções e formulário sem nenhum peso definido.

const schema = (perguntas: FormSchema["perguntas"]): FormSchema => ({ perguntas })

describe("calcularScore", () => {
  it("normaliza para 0–100 sobre o teto do caminho percorrido", () => {
    const s = schema([
      {
        id: "orcamento",
        tipo: "escolha",
        titulo: "Faixa de investimento",
        opcoes: [
          { valor: "ate_300", rotulo: "Até 300 mil", peso: 0 },
          { valor: "300_600", rotulo: "300 a 600 mil", peso: 5 },
          { valor: "acima_600", rotulo: "Acima de 600 mil", peso: 10 },
        ],
      },
    ])
    expect(calcularScore(s, { orcamento: "acima_600" }).score).toBe(100)
    expect(calcularScore(s, { orcamento: "300_600" }).score).toBe(50)
    expect(calcularScore(s, { orcamento: "ate_300" }).score).toBe(0)
  })

  it("trata peso AUSENTE como zero, sem quebrar o teto", () => {
    const s = schema([
      {
        id: "prazo",
        tipo: "escolha",
        titulo: "Quando pretende comprar?",
        opcoes: [
          { valor: "ja", rotulo: "Agora", peso: 10 },
          { valor: "depois", rotulo: "Sem pressa" }, // sem peso de propósito
        ],
      },
    ])
    expect(calcularScore(s, { prazo: "depois" })).toEqual({ score: 0, bruto: 0, maximo: 10 })
    expect(calcularScore(s, { prazo: "ja" }).score).toBe(100)
  })

  it("ignora resposta FORA das opções — o schema é editável em produção", () => {
    const s = schema([
      {
        id: "prazo",
        tipo: "escolha",
        titulo: "Quando?",
        opcoes: [{ valor: "ja", rotulo: "Agora", peso: 10 }],
      },
    ])
    // "opcao_removida" foi respondida antes de alguém editar o formulário.
    const r = calcularScore(s, { prazo: "opcao_removida" })
    expect(r.score).toBe(0)
    expect(r.maximo).toBe(10) // o teto continua existindo; a resposta é que não vale
  })

  it("formulário SEM nenhum peso devolve 0, não erro nem NaN", () => {
    const s = schema([
      {
        id: "cor",
        tipo: "escolha",
        titulo: "Cor preferida",
        opcoes: [
          { valor: "azul", rotulo: "Azul" },
          { valor: "verde", rotulo: "Verde" },
        ],
      },
    ])
    const r = calcularScore(s, { cor: "azul" })
    expect(r).toEqual({ score: 0, bruto: 0, maximo: 0 })
    expect(Number.isNaN(r.score)).toBe(false)
  })

  it("não conta pergunta escondida pela ramificação — nem no teto", () => {
    const s = schema([
      {
        id: "pagamento",
        tipo: "escolha",
        titulo: "Como pretende pagar?",
        opcoes: [
          { valor: "vista", rotulo: "À vista", peso: 10 },
          { valor: "financiado", rotulo: "Financiado", peso: 5 },
        ],
      },
      {
        id: "entrada",
        tipo: "escolha",
        titulo: "Tem entrada?",
        condicoes: [{ pergunta: "pagamento", em: ["financiado"] }],
        opcoes: [{ valor: "sim", rotulo: "Sim", peso: 20 }],
      },
    ])
    // Quem paga à vista nunca vê "entrada": o teto é só o da pergunta que viu.
    expect(calcularScore(s, { pagamento: "vista" })).toEqual({ score: 100, bruto: 10, maximo: 10 })
    // Quem financia vê as duas — e não responder a segunda derruba o score.
    // Teto = melhor de "pagamento" (10) + melhor de "entrada" (20) = 30.
    expect(calcularScore(s, { pagamento: "financiado" })).toEqual({ score: 17, bruto: 5, maximo: 30 })
  })

  it("múltipla escolha soma os pesos escolhidos contra o teto das positivas", () => {
    const s = schema([
      {
        id: "motivo",
        tipo: "multipla",
        titulo: "O que busca?",
        opcoes: [
          { valor: "morar", rotulo: "Morar", peso: 10 },
          { valor: "investir", rotulo: "Investir", peso: 10 },
          { valor: "curiosidade", rotulo: "Só olhando", peso: -5 },
        ],
      },
    ])
    expect(calcularScore(s, { motivo: ["morar", "investir"] }).score).toBe(100)
    expect(calcularScore(s, { motivo: ["morar"] }).score).toBe(50)
    // Peso negativo não empurra a escala abaixo de zero.
    expect(calcularScore(s, { motivo: ["curiosidade"] }).score).toBe(0)
  })

  it("sem resposta nenhuma o score é 0, mas o teto já existe", () => {
    const s = schema([
      {
        id: "orcamento",
        tipo: "escolha",
        titulo: "Faixa",
        opcoes: [{ valor: "alto", rotulo: "Alto", peso: 10 }],
      },
    ])
    expect(calcularScore(s, {})).toEqual({ score: 0, bruto: 0, maximo: 10 })
  })
})
