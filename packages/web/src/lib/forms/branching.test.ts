import { describe, it, expect } from "vitest"
import {
  perguntaVisivel,
  proximaPergunta,
  formularioCompleto,
  limparRespostas,
  passoAtual,
  passoCompleto,
} from "./branching"
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

  it("OBRIGATÓRIA em branco continua pendente", () => {
    expect(proximaPergunta(schema, { nome: "   " })?.id).toBe("nome")
    expect(proximaPergunta(schema, { nome: "Ana", pagamento: [] as string[] })?.id).toBe("pagamento")
  })

  // ⛔ REGRESSÃO (@qa, gate 75-330) — este caso TRAVAVA o formulário: pular uma
  // pergunta opcional devolvia a MESMA pergunta para sempre, e ninguém
  // conseguia chegar ao envio. Numa campanha paga, isso é o formulário inteiro
  // não coletando nada de quem deixa um campo opcional em branco.
  it("OPCIONAL pulada em branco AVANÇA — não devolve a mesma pergunta", () => {
    const comOpcional: FormSchema = {
      perguntas: [
        { id: "nome", tipo: "texto", titulo: "Nome", obrigatoria: true },
        { id: "obs", tipo: "texto", titulo: "Algo a acrescentar?" }, // opcional
        { id: "fim", tipo: "texto", titulo: "Última" },
      ],
    }
    expect(proximaPergunta(comOpcional, { nome: "Ana", obs: "" })?.id).toBe("fim")
    // Idem para múltipla opcional deixada sem marcar nada.
    const comMultipla: FormSchema = {
      perguntas: [
        { id: "m", tipo: "multipla", titulo: "Opcional", opcoes: [{ valor: "a", rotulo: "A" }] },
        { id: "fim", tipo: "texto", titulo: "Última" },
      ],
    }
    expect(proximaPergunta(comMultipla, { m: [] as string[] })?.id).toBe("fim")
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

// ─── Story 75-336: passo agrupado ────────────────────────────────────────────
// Pedido do Marcos: nome e telefone no PRIMEIRO passo, juntos, com uma frase
// amigável. O motor mostrava uma pergunta por tela.

describe("passoAtual", () => {
  const agrupado: FormSchema = {
    perguntas: [
      { id: "nome", tipo: "texto", titulo: "Seu nome", obrigatoria: true, grupo: "contato", intro: "Oi!" },
      { id: "tel", tipo: "telefone", titulo: "Seu WhatsApp", obrigatoria: true, grupo: "contato" },
      { id: "valor", tipo: "escolha", titulo: "Faixa", obrigatoria: true, opcoes: [{ valor: "a", rotulo: "A" }] },
    ],
  }

  it("o primeiro passo traz nome E telefone juntos", () => {
    expect(passoAtual(agrupado, {}).map((p) => p.id)).toEqual(["nome", "tel"])
  })

  it("respondido só o nome, o passo continua sendo o bloco inteiro", () => {
    // Senão a tela perderia o campo do nome no meio do preenchimento.
    expect(passoAtual(agrupado, { nome: "Ana" }).map((p) => p.id)).toEqual(["nome", "tel"])
  })

  it("bloco completo avança para a pergunta seguinte, sozinha", () => {
    expect(passoAtual(agrupado, { nome: "Ana", tel: "4499" }).map((p) => p.id)).toEqual(["valor"])
  })

  it("formulário terminado devolve passo vazio", () => {
    expect(passoAtual(agrupado, { nome: "Ana", tel: "4499", valor: "a" })).toEqual([])
  })

  it("pergunta sem grupo continua sendo um passo de uma", () => {
    expect(passoAtual(schema, {}).map((p) => p.id)).toEqual(["nome"])
  })

  it("grupos IGUAIS mas NÃO consecutivos não se juntam", () => {
    // Agrupar por cima de uma pergunta do meio reordenaria o formulário sem o
    // autor pedir.
    const separado: FormSchema = {
      perguntas: [
        { id: "a", tipo: "texto", titulo: "A", grupo: "x", obrigatoria: true },
        { id: "meio", tipo: "texto", titulo: "Meio", obrigatoria: true },
        { id: "b", tipo: "texto", titulo: "B", grupo: "x", obrigatoria: true },
      ],
    }
    expect(passoAtual(separado, {}).map((p) => p.id)).toEqual(["a"])
    expect(passoAtual(separado, { a: "1" }).map((p) => p.id)).toEqual(["meio"])
    expect(passoAtual(separado, { a: "1", meio: "2" }).map((p) => p.id)).toEqual(["b"])
  })

  it("pergunta do grupo escondida pela ramificação sai do passo", () => {
    const comCondicao: FormSchema = {
      perguntas: [
        { id: "tipo", tipo: "escolha", titulo: "Tipo", obrigatoria: true, opcoes: [{ valor: "pf", rotulo: "PF" }, { valor: "pj", rotulo: "PJ" }] },
        { id: "nome", tipo: "texto", titulo: "Nome", obrigatoria: true, grupo: "c" },
        { id: "cnpj", tipo: "texto", titulo: "CNPJ", grupo: "c", condicoes: [{ pergunta: "tipo", em: ["pj"] }] },
      ],
    }
    expect(passoAtual(comCondicao, { tipo: "pf" }).map((p) => p.id)).toEqual(["nome"])
    expect(passoAtual(comCondicao, { tipo: "pj" }).map((p) => p.id)).toEqual(["nome", "cnpj"])
  })
})

describe("passoCompleto", () => {
  const passo = [
    { id: "nome", tipo: "texto" as const, titulo: "Nome", obrigatoria: true },
    { id: "tel", tipo: "telefone" as const, titulo: "Tel", obrigatoria: true },
    { id: "obs", tipo: "texto" as const, titulo: "Obs" },
  ]

  it("exige todas as obrigatórias do passo", () => {
    expect(passoCompleto(passo, { nome: "Ana" })).toBe(false)
    expect(passoCompleto(passo, { nome: "Ana", tel: "4499" })).toBe(true)
  })

  it("opcional em branco não trava o passo", () => {
    expect(passoCompleto(passo, { nome: "Ana", tel: "4499", obs: "" })).toBe(true)
  })

  it("obrigatória só com espaços não conta", () => {
    expect(passoCompleto(passo, { nome: "  ", tel: "4499" })).toBe(false)
  })
})
