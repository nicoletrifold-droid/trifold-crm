import { describe, it, expect } from "vitest"
import { parseFormSchema, problemasParaPublicar, FormSchemaInvalido } from "./schema"

// Story 75-330 — AC8. O schema é editado em produção por quem não é dev: o erro
// precisa dizer QUAL pergunta está errada, não "Unexpected token".

describe("parseFormSchema", () => {
  it("aceita um formulário mínimo", () => {
    const s = parseFormSchema({ perguntas: [{ id: "nome", tipo: "texto", titulo: "Seu nome" }] })
    expect(s.perguntas).toHaveLength(1)
    expect(s.perguntas[0]).toEqual({ id: "nome", tipo: "texto", titulo: "Seu nome" })
  })

  it("rejeita o que não é objeto", () => {
    expect(() => parseFormSchema(null)).toThrow(FormSchemaInvalido)
    expect(() => parseFormSchema("[]")).toThrow(FormSchemaInvalido)
    expect(() => parseFormSchema([])).toThrow(/objeto JSON/)
  })

  it("exige a lista de perguntas", () => {
    expect(() => parseFormSchema({})).toThrow(/lista "perguntas"/)
  })

  it("aponta a pergunta pelo número e pelo id", () => {
    expect(() => parseFormSchema({ perguntas: [{ tipo: "texto", titulo: "x" }] })).toThrow(
      /Pergunta 1: falta o "id"/
    )
    expect(() =>
      parseFormSchema({ perguntas: [{ id: "a", tipo: "inventado", titulo: "x" }] })
    ).toThrow(/Pergunta 1 \("a"\): tipo "inventado" não existe/)
  })

  it("rejeita id repetido — ele é a chave das respostas", () => {
    expect(() =>
      parseFormSchema({
        perguntas: [
          { id: "a", tipo: "texto", titulo: "x" },
          { id: "a", tipo: "texto", titulo: "y" },
        ],
      })
    ).toThrow(/o id "a" está repetido/)
  })

  it("escolha sem opção é erro", () => {
    expect(() => parseFormSchema({ perguntas: [{ id: "a", tipo: "escolha", titulo: "x" }] })).toThrow(
      /exige pelo menos uma opção/
    )
  })

  it("condição só pode apontar para pergunta ANTERIOR", () => {
    // Para frente: a pergunta ficaria invisível para sempre e ninguém veria isso
    // até o anúncio já estar rodando.
    expect(() =>
      parseFormSchema({
        perguntas: [
          { id: "a", tipo: "texto", titulo: "x", condicoes: [{ pergunta: "b", em: ["1"] }] },
          { id: "b", tipo: "texto", titulo: "y" },
        ],
      })
    ).toThrow(/não é uma pergunta anterior/)
  })

  it("condição para si mesma é erro", () => {
    expect(() =>
      parseFormSchema({
        perguntas: [{ id: "a", tipo: "texto", titulo: "x", condicoes: [{ pergunta: "a", em: ["1"] }] }],
      })
    ).toThrow(/não é uma pergunta anterior/)
  })

  it("normaliza: rótulo ausente vira o valor, peso não-numérico some", () => {
    const s = parseFormSchema({
      perguntas: [
        {
          id: "a",
          tipo: "escolha",
          titulo: "x",
          opcoes: [
            { valor: "sim", peso: "10" },
            { valor: "nao", rotulo: "Não", peso: 5 },
          ],
        },
      ],
    })
    expect(s.perguntas[0]!.opcoes).toEqual([
      { valor: "sim", rotulo: "sim" },
      { valor: "nao", rotulo: "Não", peso: 5 },
    ])
  })

  it("rejeita campo_contato inexistente", () => {
    expect(() =>
      parseFormSchema({ perguntas: [{ id: "a", tipo: "texto", titulo: "x", campo_contato: "cpf" }] })
    ).toThrow(/campo_contato "cpf" não existe/)
  })

  it("formulário vazio é válido — é o estado inicial de um formulário novo", () => {
    expect(parseFormSchema({ perguntas: [] })).toEqual({ perguntas: [] })
  })
})

// ⛔ REGRESSÃO (@qa, gate 75-330) — sem campo de contato o formulário rodava
// inteiro e só falhava NO ENVIO, para o lead: campanha paga coletando zero,
// com o defeito visível apenas para quem clicou no anúncio.
describe("problemasParaPublicar", () => {
  const comContato = parseFormSchema({
    perguntas: [
      { id: "n", tipo: "texto", titulo: "Nome", campo_contato: "nome" },
      { id: "t", tipo: "telefone", titulo: "WhatsApp", campo_contato: "telefone" },
    ],
  })

  it("formulário com nome e telefone pode publicar", () => {
    expect(problemasParaPublicar(comContato)).toEqual([])
  })

  it("sem telefone, acusa — o lead não teria como ser criado", () => {
    const s = parseFormSchema({
      perguntas: [{ id: "n", tipo: "texto", titulo: "Nome", campo_contato: "nome" }],
    })
    expect(problemasParaPublicar(s)).toHaveLength(1)
    expect(problemasParaPublicar(s)[0]).toMatch(/telefone/)
  })

  it("sem nenhum campo de contato, acusa os dois", () => {
    const s = parseFormSchema({ perguntas: [{ id: "x", tipo: "texto", titulo: "Qualquer" }] })
    expect(problemasParaPublicar(s)[0]).toMatch(/nome.*telefone/)
  })

  it("formulário VAZIO passa — é rascunho recém-criado, não publicação", () => {
    expect(problemasParaPublicar({ perguntas: [] })).toEqual([])
  })
})
