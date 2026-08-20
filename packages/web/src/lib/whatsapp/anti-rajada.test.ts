import { describe, it, expect } from "vitest"
import {
  deveAbortarPorMensagemMaisNova,
  janelaAntiRajadaMs,
  JANELA_ANTI_RAJADA_MS_PADRAO,
  JANELA_ANTI_RAJADA_MS_MAX,
} from "./anti-rajada"

describe("75-359 — quem responde é a execução da mensagem mais nova", () => {
  it("o caso de produção: 'Qual é esse empreendimento' + '?' a 0,79s", () => {
    const primeira = "2026-08-20T14:02:04.210085Z"
    const segunda = "2026-08-20T14:02:04.991832Z"
    // A execução da PRIMEIRA aborta...
    expect(deveAbortarPorMensagemMaisNova(primeira, [segunda])).toBe(true)
    // ...e a da SEGUNDA responde (nada mais novo que ela).
    expect(deveAbortarPorMensagemMaisNova(segunda, [])).toBe(false)
  })

  it("mensagem única não aborta", () => {
    expect(deveAbortarPorMensagemMaisNova("2026-08-20T14:02:04Z", [])).toBe(false)
    expect(deveAbortarPorMensagemMaisNova("2026-08-20T14:02:04Z", null)).toBe(false)
    expect(deveAbortarPorMensagemMaisNova("2026-08-20T14:02:04Z", undefined)).toBe(false)
  })

  it("rajada de três: só a última responde (caso Melquiades)", () => {
    const a = "2026-08-20T14:01:21.878Z" // "Faz tempo"
    const b = "2026-08-20T14:01:24.274Z" // "Já comprei"
    const c = "2026-08-20T14:01:26.715Z" // "Obrigado"
    expect(deveAbortarPorMensagemMaisNova(a, [b, c])).toBe(true)
    expect(deveAbortarPorMensagemMaisNova(b, [c])).toBe(true)
    expect(deveAbortarPorMensagemMaisNova(c, [])).toBe(false)
  })

  it("mensagem ANTERIOR à minha não me aborta", () => {
    // O route já filtra com `.gt()`, mas a função não depende disso para acertar.
    expect(
      deveAbortarPorMensagemMaisNova("2026-08-20T14:02:04Z", ["2026-08-20T14:01:00Z"])
    ).toBe(false)
  })

  it("empate exato não aborta (só o que é ESTRITAMENTE mais novo manda)", () => {
    const t = "2026-08-20T14:02:04.210085Z"
    expect(deveAbortarPorMensagemMaisNova(t, [t])).toBe(false)
  })

  it("sem referência de tempo confiável a guarda se cala", () => {
    // Lead sem resposta é pior que resposta duplicada.
    expect(deveAbortarPorMensagemMaisNova(null, ["2026-08-20T14:02:05Z"])).toBe(false)
    expect(deveAbortarPorMensagemMaisNova("nao-e-data", ["2026-08-20T14:02:05Z"])).toBe(false)
    expect(deveAbortarPorMensagemMaisNova("2026-08-20T14:02:04Z", [null, "lixo"])).toBe(false)
  })

  it("aceita Date além de string", () => {
    expect(
      deveAbortarPorMensagemMaisNova(
        new Date("2026-08-20T14:02:04Z"),
        [new Date("2026-08-20T14:02:05Z")]
      )
    ).toBe(true)
  })
})

describe("75-359 — janela lida do ambiente", () => {
  it("sem env → padrão", () => {
    expect(janelaAntiRajadaMs({})).toBe(JANELA_ANTI_RAJADA_MS_PADRAO)
    expect(janelaAntiRajadaMs({ NICOLE_ANTI_RAJADA_MS: "" })).toBe(JANELA_ANTI_RAJADA_MS_PADRAO)
    expect(janelaAntiRajadaMs({ NICOLE_ANTI_RAJADA_MS: "   " })).toBe(JANELA_ANTI_RAJADA_MS_PADRAO)
  })

  it("0 DESLIGA a guarda (volta ao comportamento anterior sem deploy)", () => {
    expect(janelaAntiRajadaMs({ NICOLE_ANTI_RAJADA_MS: "0" })).toBe(0)
  })

  it("valor válido é respeitado, com teto", () => {
    expect(janelaAntiRajadaMs({ NICOLE_ANTI_RAJADA_MS: "3000" })).toBe(3000)
    expect(janelaAntiRajadaMs({ NICOLE_ANTI_RAJADA_MS: "999999" })).toBe(JANELA_ANTI_RAJADA_MS_MAX)
  })

  it("valor inválido cai no padrão, NUNCA em 0", () => {
    // `vercel env add` por pipe já gravou valor vazio duas vezes neste projeto
    // (VAPID, PORTAL_NOTIF_PAUSED). Env ilegível não pode desligar a guarda calado.
    expect(janelaAntiRajadaMs({ NICOLE_ANTI_RAJADA_MS: "abc" })).toBe(JANELA_ANTI_RAJADA_MS_PADRAO)
    expect(janelaAntiRajadaMs({ NICOLE_ANTI_RAJADA_MS: "-5" })).toBe(JANELA_ANTI_RAJADA_MS_PADRAO)
  })
})
