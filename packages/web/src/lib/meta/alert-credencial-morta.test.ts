/**
 * Story 75-289 (AC3) — credencial morta alerta o gestor, UMA vez por dia.
 *
 * O que estes testes protegem: o incidente de 10/08 falhou calado porque nada
 * observava o 401. Mas um alerta por mensagem falhada seria pior — 40 e-mails
 * ensinam o gestor a ignorar o aviso. O coalescing é a parte que não pode quebrar.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const logEventOnce = vi.fn(async (_params: Record<string, unknown>) => ({ inserted: true }))
vi.mock("@web/lib/logger", () => ({
  logEventOnce: (params: Record<string, unknown>) => logEventOnce(params),
  logEvent: vi.fn(),
}))

const sendEmail = vi.fn(async (_params: { to: string; html: string; subject: string }) => undefined)
vi.mock("@web/lib/email", () => ({
  sendEmail: (params: { to: string; html: string; subject: string }) => sendEmail(params),
}))

let usersResult: { data: unknown; error: unknown } = {
  data: [
    { name: "Marcos", email: "marcos@trifold.eng.br" },
    { name: "Samara", email: "samara@trifold.eng.br" },
  ],
  error: null,
}

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const b: Record<string, unknown> = {}
      for (const m of ["select", "eq", "in", "not"]) b[m] = vi.fn(() => b)
      b.then = (res: (r: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(usersResult).then(res, rej)
      return b
    },
  }),
}))

import { alertCredencialMorta, isCredencialMorta } from "./alert-credencial-morta"

beforeEach(() => {
  vi.clearAllMocks()
  logEventOnce.mockResolvedValue({ inserted: true })
  usersResult = {
    data: [
      { name: "Marcos", email: "marcos@trifold.eng.br" },
      { name: "Samara", email: "samara@trifold.eng.br" },
    ],
    error: null,
  }
})

describe("isCredencialMorta", () => {
  it("reconhece as DUAS formatações de 401 que os chamadores produzem", () => {
    // dispatch-broker-message / send-whatsapp-message
    expect(isCredencialMorta({ error: "HTTP_401" })).toBe(true)
    // download de mídia do webhook (com espaço) — o regex antigo deixava passar
    expect(isCredencialMorta({ error: "graph HTTP 401" })).toBe(true)
    expect(isCredencialMorta({ error: "arquivo HTTP 401" })).toBe(true)
  })

  it("reconhece code 190 e status cru", () => {
    expect(isCredencialMorta({ code: 190 })).toBe(true)
    expect(isCredencialMorta({ status: 401 })).toBe(true)
    expect(isCredencialMorta({ error: "OAuthException" })).toBe(true)
  })

  it("NÃO confunde com erros que trocar o token não resolve", () => {
    expect(isCredencialMorta({ error: "HTTP_403" })).toBe(false) // escopo/permissão
    expect(isCredencialMorta({ error: "HTTP_429" })).toBe(false) // rate limit
    expect(isCredencialMorta({ error: "TIMEOUT" })).toBe(false)
    expect(isCredencialMorta({ status: 500 })).toBe(false)
    expect(isCredencialMorta({ error: null })).toBe(false)
  })
})

describe("alertCredencialMorta", () => {
  it("primeiro 401 do dia: reivindica o evento e avisa TODOS os gestores", async () => {
    const r = await alertCredencialMorta({
      orgId: "org-1",
      credencial: "whatsapp_config",
      detalhe: "envio do corretor falhou: HTTP_401",
      diaISO: "2026-08-10",
    })

    expect(r).toEqual({ alerted: true, suppressed: false })
    expect(sendEmail).toHaveBeenCalledTimes(2)
    // O e-mail tem que dizer ONDE trocar — é a informação que resolve o incidente.
    const html = String(sendEmail.mock.calls[0]?.[0]?.html)
    expect(html).toContain("whatsapp_config.access_token")
  })

  it("coalescing: 401 repetido no MESMO dia não gera segundo e-mail", async () => {
    // O índice único do banco devolve 23505 → logEventOnce diz inserted:false.
    logEventOnce.mockResolvedValue({ inserted: false })

    const r = await alertCredencialMorta({
      orgId: "org-1",
      credencial: "whatsapp_config",
      detalhe: "envio do corretor falhou: HTTP_401",
      diaISO: "2026-08-10",
    })

    expect(r).toEqual({ alerted: false, suppressed: true })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("a chave de dedupe é credencial + dia (credencial diferente avisa em separado)", async () => {
    await alertCredencialMorta({
      orgId: "org-1",
      credencial: "whatsapp_config",
      detalhe: "x",
      diaISO: "2026-08-10",
    })
    await alertCredencialMorta({
      orgId: "org-1",
      credencial: "meta_page_access_token",
      detalhe: "y",
      diaISO: "2026-08-10",
    })

    const chaves = logEventOnce.mock.calls.map((c) => c[0]?.dedupe_key)
    expect(chaves).toEqual([
      "meta_credential_dead:whatsapp_config:2026-08-10",
      "meta_credential_dead:meta_page_access_token:2026-08-10",
    ])
  })

  it("nunca lança nem vaza o token: sem gestor com e-mail, só registra", async () => {
    usersResult = { data: [], error: null }

    const r = await alertCredencialMorta({
      orgId: "org-1",
      credencial: "meta_ad_accounts",
      detalhe: "sync falhou: HTTP_401",
      diaISO: "2026-08-10",
    })

    // Reivindicou o evento mas não tinha destinatário — não finge que avisou.
    expect(r).toEqual({ alerted: false, suppressed: false })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("erro inesperado não derruba o chamador (o alerta é best-effort)", async () => {
    logEventOnce.mockRejectedValue(new Error("banco fora"))

    await expect(
      alertCredencialMorta({ orgId: "org-1", credencial: "whatsapp_config", detalhe: "x" })
    ).resolves.toEqual({ alerted: false, suppressed: false })
  })
})
