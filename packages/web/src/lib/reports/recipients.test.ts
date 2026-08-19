/**
 * Story 75-345 — a lista de quem recebe o relatório diário.
 *
 * O defeito que mais dói aqui é silencioso e chega no WhatsApp de gente de fora do
 * time: mensagem duplicada (o telefone do Alexandre está na env E no cadastro
 * dele), ou alguém que saiu da empresa continuar recebendo o resumo comercial do
 * dia. Por isso a regra é pura e testada, e não um `map` dentro do cron.
 */
import { describe, it, expect } from "vitest"
import { mergeRecipients, parseIdsSelecionados, SETTINGS_KEY } from "./recipients"

const ALEXANDRE = {
  id: "u-alex",
  name: "Alexandre Guimaraes Nicolau",
  phone: "5544984070700",
  role: "admin",
  is_active: true,
}
const JOABE = {
  id: "u-joabe",
  name: "Joabe Albuquerque Silva",
  phone: "5544988441602",
  role: "gerente-comercial",
  is_active: true,
}

describe("mergeRecipients", () => {
  it("o caso da story: Alexandre (env + usuário) e Joabe recebem UMA vez cada", () => {
    const out = mergeRecipients([ALEXANDRE, JOABE], ["5544984070700"])
    expect(out.map((d) => d.telefone)).toEqual(["5544984070700", "5544988441602"])
    // O nome vem do usuário, não da env — log legível.
    expect(out[0]!.nome).toBe("Alexandre Guimaraes Nicolau")
  })

  it("dedup vale para o MESMO número escrito diferente", () => {
    const out = mergeRecipients([JOABE], ["+55 (44) 98844-1602"])
    expect(out).toHaveLength(1)
  })

  it("lista vazia = só a env (o comportamento de antes do deploy)", () => {
    expect(mergeRecipients([], ["5544984070700"]).map((d) => d.telefone)).toEqual(["5544984070700"])
    expect(mergeRecipients([], []).map((d) => d.telefone)).toEqual([])
  })

  it("usuário inativo não recebe, mesmo selecionado", () => {
    const out = mergeRecipients([{ ...JOABE, is_active: false }], [])
    expect(out).toEqual([])
  })

  it("usuário sem telefone não recebe (e não quebra o envio dos outros)", () => {
    const out = mergeRecipients([{ ...JOABE, phone: null }, ALEXANDRE], [])
    expect(out.map((d) => d.nome)).toEqual(["Alexandre Guimaraes Nicolau"])
  })

  it("número inválido é descartado em vez de ir para a Cloud API", () => {
    // A Graph API responderia 400 por destinatário; melhor nem tentar.
    expect(mergeRecipients([{ ...JOABE, phone: "1234" }], ["abc"])).toEqual([])
  })

  it("preserva a ordem: usuários escolhidos primeiro, env depois", () => {
    const out = mergeRecipients([JOABE], ["5544984070700"])
    expect(out.map((d) => d.telefone)).toEqual(["5544988441602", "5544984070700"])
  })
})

describe("parseIdsSelecionados", () => {
  it("lê a lista da chave certa", () => {
    expect(parseIdsSelecionados({ [SETTINGS_KEY]: ["a", "b"] })).toEqual(["a", "b"])
  })

  it("settings sem a chave, nulo ou com formato inesperado devolve lista vazia", () => {
    // jsonb é jsonb: a tela grava, mas nada impede uma escrita manual torta.
    expect(parseIdsSelecionados({ materiais_url: "https://x" })).toEqual([])
    expect(parseIdsSelecionados(null)).toEqual([])
    expect(parseIdsSelecionados({ [SETTINGS_KEY]: "u-alex" })).toEqual([])
    expect(parseIdsSelecionados({ [SETTINGS_KEY]: [1, "", "ok"] })).toEqual(["ok"])
  })
})
