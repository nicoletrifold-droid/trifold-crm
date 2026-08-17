import { describe, it, expect } from "vitest"
import { parseFormSchema } from "./schema"

// Story 75-331 — a agenda é configurada no MESMO jsonb das perguntas (sem
// migration). A regra que mais importa aqui é o default: agenda ausente ou
// malformada = DESLIGADA. Um erro de digitação no JSON não pode abrir a agenda
// do decorado sozinho.

describe("parseFormSchema — bloco agenda (75-331)", () => {
  const base = { perguntas: [{ id: "n", tipo: "texto", titulo: "Nome" }] }

  it("sem bloco agenda, o campo não existe (formulário termina na mensagem)", () => {
    expect(parseFormSchema(base).agenda).toBeUndefined()
  })

  it("agenda ativa com decorado fixo da campanha", () => {
    const s = parseFormSchema({ ...base, agenda: { ativa: true, local: "Decorado Vind" } })
    expect(s.agenda).toEqual({ ativa: true, local: "Decorado Vind" })
  })

  it("agenda ativa sem local — o lead escolhe entre os decorados", () => {
    expect(parseFormSchema({ ...base, agenda: { ativa: true } }).agenda).toEqual({ ativa: true })
  })

  it("ativa só é verdadeira com booleano true — string 'true' NÃO liga", () => {
    // Vem de JSON editado à mão: "true" é o erro de digitação mais provável, e
    // ligar a agenda por engano abre a grade do decorado para o mundo.
    expect(parseFormSchema({ ...base, agenda: { ativa: "true" } }).agenda).toEqual({ ativa: false })
    expect(parseFormSchema({ ...base, agenda: { ativa: 1 } }).agenda).toEqual({ ativa: false })
  })

  it("agenda malformada não quebra o parse — vira desligada", () => {
    expect(parseFormSchema({ ...base, agenda: "sim" }).agenda).toBeUndefined()
    expect(parseFormSchema({ ...base, agenda: null }).agenda).toBeUndefined()
  })

  it("local em branco some, em vez de virar decorado vazio", () => {
    expect(parseFormSchema({ ...base, agenda: { ativa: true, local: "   " } }).agenda).toEqual({
      ativa: true,
    })
  })
})
