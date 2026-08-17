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
      passo: [tel],
      rascunhos: { tel: "44999990000" },
      respostas: { nome: "Ana" },
      ultimaAssinatura: "",
    })
    expect(r).not.toBeNull()
    expect(r!.payload).toEqual({ nome: "Ana", tel: "44999990000" })
  })

  it("🔴 passo com DOIS campos salva os dois de uma vez", () => {
    // Story 75-336 juntou nome e telefone numa tela só. O rascunho tem de
    // guardar o BLOCO — salvar só um deixaria o outro a perder-se, que é
    // exatamente o que a AC5 existe para impedir.
    const nome: Pergunta = { id: "nome", tipo: "texto", titulo: "Nome", campo_contato: "nome" }
    const r = prepararSalvamentoDeRascunho({
      passo: [nome, tel],
      rascunhos: { nome: "Ana", tel: "+55 (44) 99999-4444" },
      respostas: {},
      ultimaAssinatura: "",
    })
    expect(r!.payload).toEqual({ nome: "Ana", tel: "+55 (44) 99999-4444" })
  })

  it("no passo de dois, o campo já preenchido é salvo mesmo com o outro vazio", () => {
    // Quem digita o nome, hesita no telefone e fecha a aba não pode sumir.
    const nome: Pergunta = { id: "nome", tipo: "texto", titulo: "Nome", campo_contato: "nome" }
    const r = prepararSalvamentoDeRascunho({
      passo: [nome, tel],
      rascunhos: { nome: "Ana", tel: "" },
      respostas: {},
      ultimaAssinatura: "",
    })
    expect(r!.payload).toEqual({ nome: "Ana" })
  })

  it("rascunho vazio não vira requisição", () => {
    expect(
      prepararSalvamentoDeRascunho({ passo: [tel], rascunhos: { tel: "" }, respostas: {}, ultimaAssinatura: "" })
    ).toBeNull()
    expect(
      prepararSalvamentoDeRascunho({ passo: [tel], rascunhos: { tel: "   " }, respostas: {}, ultimaAssinatura: "" })
    ).toBeNull()
  })

  it("formulário terminado (sem pergunta na tela) não salva rascunho", () => {
    expect(
      prepararSalvamentoDeRascunho({ passo: [], rascunhos: { tel: "x" }, respostas: {}, ultimaAssinatura: "" })
    ).toBeNull()
  })

  it("DEDUPE — payload idêntico não reenvia", () => {
    // Sem isto, blur a cada correção queimaria os 30 req/min por IP do endpoint
    // público e o próprio lead veria 429 no meio do preenchimento.
    const primeiro = prepararSalvamentoDeRascunho({
      passo: [tel],
      rascunhos: { tel: "44999990000" },
      respostas: { nome: "Ana" },
      ultimaAssinatura: "",
    })!
    const segundo = prepararSalvamentoDeRascunho({
      passo: [tel],
      rascunhos: { tel: "44999990000" },
      respostas: { nome: "Ana" },
      ultimaAssinatura: primeiro.assinatura,
    })
    expect(segundo).toBeNull()
  })

  it("mas uma CORREÇÃO real reenvia", () => {
    const primeiro = prepararSalvamentoDeRascunho({
      passo: [tel],
      rascunhos: { tel: "4499999000" },
      respostas: {},
      ultimaAssinatura: "",
    })!
    const corrigido = prepararSalvamentoDeRascunho({
      passo: [tel],
      rascunhos: { tel: "44999990000" }, // um dígito a mais
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
      prepararSalvamentoDeRascunho({ passo: [multipla], rascunhos: { m: [] }, respostas: {}, ultimaAssinatura: "" })
    ).toBeNull()
    const r = prepararSalvamentoDeRascunho({
      passo: [multipla],
      rascunhos: { m: ["morar"] },
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
      passo: [tel],
      rascunhos: { tel: "4499" },
      respostas: { pagamento: "vista", banco: "Itaú" }, // "banco" seria podado
      ultimaAssinatura: "",
    })
    expect(r!.payload).toEqual({ pagamento: "vista", banco: "Itaú", tel: "4499" })
  })
})
