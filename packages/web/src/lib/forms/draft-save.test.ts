import { describe, it, expect } from "vitest"
import { prepararSalvamentoDeRascunho } from "./draft-save"
import type { Pergunta } from "./schema"

// Story 75-333 — AC5. O pedido do Marcos em uma frase: "quando um lead não
// termina o cadastro eu não posso perder estas informações".
//
// Até esta story o salvamento só rodava no clique em "Continuar". Estes testes
// exercitam o caminho NOVO — o do digitado-sem-confirmar. Um teste do caminho
// do "Continuar" não valeria nada aqui: é justamente o que já funcionava.

const tel: Pergunta = { id: "tel", tipo: "telefone", titulo: "WhatsApp", campo_contato: "telefone" }

describe("prepararSalvamentoDeRascunho", () => {
  it("🔴 salva o telefone digitado e NÃO confirmado", () => {
    // O caso que motivou a story: a pessoa digita o telefone, hesita e fecha a
    // aba. Este é o dado que torna a oferta ativa possível.
    const r = prepararSalvamentoDeRascunho({
      pergunta: tel,
      rascunho: "44999990000",
      respostas: { nome: "Ana" },
      ultimaAssinatura: "",
    })
    expect(r).not.toBeNull()
    expect(r!.payload).toEqual({ nome: "Ana", tel: "44999990000" })
  })

  it("rascunho vazio não vira requisição", () => {
    expect(
      prepararSalvamentoDeRascunho({ pergunta: tel, rascunho: "", respostas: {}, ultimaAssinatura: "" })
    ).toBeNull()
    expect(
      prepararSalvamentoDeRascunho({ pergunta: tel, rascunho: "   ", respostas: {}, ultimaAssinatura: "" })
    ).toBeNull()
  })

  it("formulário terminado (sem pergunta na tela) não salva rascunho", () => {
    expect(
      prepararSalvamentoDeRascunho({ pergunta: null, rascunho: "x", respostas: {}, ultimaAssinatura: "" })
    ).toBeNull()
  })

  it("DEDUPE — payload idêntico não reenvia", () => {
    // Sem isto, blur a cada correção queimaria os 30 req/min por IP do endpoint
    // público e o próprio lead veria 429 no meio do preenchimento.
    const primeiro = prepararSalvamentoDeRascunho({
      pergunta: tel,
      rascunho: "44999990000",
      respostas: { nome: "Ana" },
      ultimaAssinatura: "",
    })!
    const segundo = prepararSalvamentoDeRascunho({
      pergunta: tel,
      rascunho: "44999990000",
      respostas: { nome: "Ana" },
      ultimaAssinatura: primeiro.assinatura,
    })
    expect(segundo).toBeNull()
  })

  it("mas uma CORREÇÃO real reenvia", () => {
    const primeiro = prepararSalvamentoDeRascunho({
      pergunta: tel,
      rascunho: "4499999000",
      respostas: {},
      ultimaAssinatura: "",
    })!
    const corrigido = prepararSalvamentoDeRascunho({
      pergunta: tel,
      rascunho: "44999990000", // um dígito a mais
      respostas: {},
      ultimaAssinatura: primeiro.assinatura,
    })
    expect(corrigido).not.toBeNull()
    expect(corrigido!.payload.tel).toBe("44999990000")
  })

  it("múltipla escolha sem nada marcado não salva; com marcação, salva", () => {
    const multipla: Pergunta = {
      id: "m",
      tipo: "multipla",
      titulo: "O que busca?",
      opcoes: [{ valor: "morar", rotulo: "Morar" }],
    }
    expect(
      prepararSalvamentoDeRascunho({ pergunta: multipla, rascunho: [], respostas: {}, ultimaAssinatura: "" })
    ).toBeNull()
    const r = prepararSalvamentoDeRascunho({
      pergunta: multipla,
      rascunho: ["morar"],
      respostas: {},
      ultimaAssinatura: "",
    })
    expect(r!.payload.m).toEqual(["morar"])
  })

  it("NÃO poda o ramo com base numa resposta ainda não confirmada", () => {
    // `limparRespostas` descartaria respostas de ramo abandonado — mas aqui a
    // pessoa ainda não confirmou nada. Podar agora apagaria justamente o que se
    // quer salvar.
    const r = prepararSalvamentoDeRascunho({
      pergunta: tel,
      rascunho: "4499",
      respostas: { pagamento: "vista", banco: "Itaú" }, // "banco" seria podado
      ultimaAssinatura: "",
    })
    expect(r!.payload).toEqual({ pagamento: "vista", banco: "Itaú", tel: "4499" })
  })
})
