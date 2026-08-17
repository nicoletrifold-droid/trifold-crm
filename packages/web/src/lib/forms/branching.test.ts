import { describe, it, expect } from "vitest"
import { perguntaVisivel, proximaPergunta, formularioCompleto, limparRespostas } from "./branching"
import type { FormSchema } from "./schema"

// Story 75-330 — AC3. A ramificação é o que separa este formulário de um
// Google Forms: quem responde "à vista" não pode ver pergunta de financiamento.

const schema: FormSchema = {
  perguntas: [
    { id: "nome", tipo: "texto", titulo: "Seu nome", obrigatoria: true, campo_contato: "nome" },
    {
      id: "pagamento",
      tipo: "escolha",
      titulo: "Como pretende pagar?",
      obrigatoria: true,
      opcoes: [
        { valor: "vista", rotulo: "À vista" },
        { valor: "financiado", rotulo: "Financiado" },
      ],
    },
    {
      id: "banco",
      tipo: "escolha",
      titulo: "Já tem financiamento aprovado?",
      obrigatoria: true,
      condicoes: [{ pergunta: "pagamento", em: ["financiado"] }],
      opcoes: [
        { valor: "sim", rotulo: "Sim" },
        { valor: "nao", rotulo: "Ainda não" },
      ],
    },
    {
      id: "qual_banco",
      tipo: "texto",
      titulo: "Em qual banco?",
      condicoes: [{ pergunta: "banco", em: ["sim"] }],
    },
  ],
}

describe("perguntaVisivel", () => {
  it("pergunta sem condição sempre aparece", () => {
    expect(perguntaVisivel(schema.perguntas[0]!, {})).toBe(true)
  })

  it("condição não satisfeita esconde", () => {
    expect(perguntaVisivel(schema.perguntas[2]!, { pagamento: "vista" })).toBe(false)
    expect(perguntaVisivel(schema.perguntas[2]!, { pagamento: "financiado" })).toBe(true)
  })

  it("condição sobre pergunta ainda não respondida esconde", () => {
    expect(perguntaVisivel(schema.perguntas[2]!, {})).toBe(false)
  })
})

describe("proximaPergunta", () => {
  it("caminha na ordem e pula o ramo que não se aplica", () => {
    expect(proximaPergunta(schema, {})?.id).toBe("nome")
    expect(proximaPergunta(schema, { nome: "Ana" })?.id).toBe("pagamento")
    // À vista: "banco" e "qual_banco" somem — acabou.
    expect(proximaPergunta(schema, { nome: "Ana", pagamento: "vista" })).toBeNull()
  })

  it("entra no ramo do financiamento quando ele se aplica", () => {
    const r = { nome: "Ana", pagamento: "financiado" }
    expect(proximaPergunta(schema, r)?.id).toBe("banco")
    expect(proximaPergunta(schema, { ...r, banco: "sim" })?.id).toBe("qual_banco")
    // "Ainda não" fecha o ramo sem perguntar o banco.
    expect(proximaPergunta(schema, { ...r, banco: "nao" })).toBeNull()
  })

  it("resposta em branco não conta como respondida", () => {
    expect(proximaPergunta(schema, { nome: "   " })?.id).toBe("nome")
    expect(proximaPergunta(schema, { nome: "Ana", pagamento: [] as string[] })?.id).toBe("pagamento")
  })
})

describe("formularioCompleto", () => {
  it("obrigatória ESCONDIDA não trava o envio", () => {
    // "banco" é obrigatória, mas quem paga à vista nunca a vê.
    expect(formularioCompleto(schema, { nome: "Ana", pagamento: "vista" })).toBe(true)
  })

  it("obrigatória visível e não respondida trava", () => {
    expect(formularioCompleto(schema, { nome: "Ana", pagamento: "financiado" })).toBe(false)
    expect(formularioCompleto(schema, { nome: "Ana", pagamento: "financiado", banco: "nao" })).toBe(true)
  })

  it("opcional em branco não trava", () => {
    const r = { nome: "Ana", pagamento: "financiado", banco: "sim" }
    expect(formularioCompleto(schema, r)).toBe(true) // qual_banco é opcional
  })
})

describe("limparRespostas", () => {
  it("descarta resposta de ramo abandonado", () => {
    const sujas = { nome: "Ana", pagamento: "vista", banco: "sim", qual_banco: "Itaú" }
    expect(limparRespostas(schema, sujas)).toEqual({ nome: "Ana", pagamento: "vista" })
  })

  it("limpa em CASCATA — se o pai some, o neto some junto", () => {
    // Trocar "financiado" por "vista" tem de matar "banco" E "qual_banco",
    // que só existia por causa de "banco".
    const sujas = { nome: "Ana", pagamento: "vista", banco: "sim", qual_banco: "Itaú" }
    const limpas = limparRespostas(schema, sujas)
    expect(limpas.banco).toBeUndefined()
    expect(limpas.qual_banco).toBeUndefined()
  })

  it("preserva o ramo que continua valendo", () => {
    const r = { nome: "Ana", pagamento: "financiado", banco: "sim", qual_banco: "Itaú" }
    expect(limparRespostas(schema, r)).toEqual(r)
  })

  it("ignora chave que não existe no schema", () => {
    const limpas = limparRespostas(schema, { nome: "Ana", pagamento: "vista", inventada: "x" })
    expect(limpas.inventada).toBeUndefined()
  })
})
