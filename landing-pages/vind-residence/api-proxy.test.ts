/**
 * Story 86-11 (AC7, AC9, AC10) — os proxies serverless da landing.
 *
 * Estas duas funções são o ÚNICO ponto da cadeia que enxerga o IP e o
 * User-Agent REAIS do visitante: o browser as chama diretamente, enquanto o CRM
 * é chamado servidor-a-servidor a partir daqui e só veria o IP do datacenter da
 * Vercel. Se o repasse de `client_ip`/`client_ua` regredir, todo evento desta
 * landing sai com o IP errado — sem erro, sem log, com aparência de sucesso no
 * Events Manager (o análogo exato do defeito 86.9-QA-001).
 *
 * O arquivo mora fora de `api/` de propósito: tudo dentro de `api/` vira uma
 * função serverless no deploy. Também está no `.vercelignore`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createRequire } from "module"

const require_ = createRequire(import.meta.url)
/* eslint-disable @typescript-eslint/no-explicit-any */
const leadHandler = require_("./api/lead.js") as (req: any, res: any) => Promise<unknown>
const trackHandler = require_("./api/track.js") as (req: any, res: any) => Promise<unknown>
/* eslint-enable @typescript-eslint/no-explicit-any */

const SECRET = "segredo-do-webhook"

/** Corpos enviados ao CRM, já desserializados. */
let enviadosAoCrm: { url: string; body: Record<string, unknown> }[] = []
let respostaDoCrm = { ok: true, status: 200 }

function fakeRes() {
  const estado = { status: 0, body: undefined as unknown, headers: {} as Record<string, string> }
  const res = {
    setHeader: (k: string, v: string) => {
      estado.headers[k] = v
    },
    status(code: number) {
      estado.status = code
      return res
    },
    json(payload: unknown) {
      estado.body = payload
      return estado
    },
    end() {
      return estado
    },
  }
  return { res, estado }
}

function fakeReq(body: unknown, headers: Record<string, string> = {}) {
  return {
    method: "POST",
    headers: { origin: "https://trifold.eng.br", ...headers },
    body,
  }
}

/** Headers como o PROXY os vê: aqui o x-forwarded-for é o do visitante. */
const HEADERS_DO_VISITANTE = {
  "x-forwarded-for": "187.1.2.3, 10.0.0.1",
  "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)",
}

const TRACKING_DO_BROWSER = {
  event_id: "11111111-1111-4111-8111-111111111111",
  complete_registration_event_id: "22222222-2222-4222-8222-222222222222",
  visitor_id: "33333333-3333-4333-8333-333333333333",
  fbc: "fb.1.1700000000000.IwAR1",
  fbp: "fb.1.1700000000000.9876543210",
  fbclid: "IwAR1",
  page_url: "https://trifold.eng.br/vindresidence/",
}

const LEAD = { nome: "Maria Souza", whatsapp: "(44) 99734-4650", email: "maria@exemplo.com" }

beforeEach(() => {
  enviadosAoCrm = []
  respostaDoCrm = { ok: true, status: 200 }
  process.env.LANDING_PAGE_WEBHOOK_SECRET = SECRET
  vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
    enviadosAoCrm.push({ url, body: JSON.parse(init.body) })
    return respostaDoCrm as unknown as Response
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("api/lead.js — AC7", () => {
  it("repassa o bloco tracking do browser, que hoje era descartado", async () => {
    const { res, estado } = fakeRes()
    await leadHandler(fakeReq({ ...LEAD, tracking: TRACKING_DO_BROWSER }, HEADERS_DO_VISITANTE), res)

    expect(estado.status).toBe(200)
    const tracking = enviadosAoCrm[0]?.body.tracking as Record<string, unknown>
    expect(tracking.event_id).toBe(TRACKING_DO_BROWSER.event_id)
    expect(tracking.complete_registration_event_id).toBe(
      TRACKING_DO_BROWSER.complete_registration_event_id,
    )
    expect(tracking.visitor_id).toBe(TRACKING_DO_BROWSER.visitor_id)
    expect(tracking.fbc).toBe(TRACKING_DO_BROWSER.fbc)
    expect(tracking.fbp).toBe(TRACKING_DO_BROWSER.fbp)
    expect(tracking.page_url).toBe(TRACKING_DO_BROWSER.page_url)
    // Os campos do lead continuam exatamente como antes.
    expect(enviadosAoCrm[0]?.body.nome).toBe("Maria Souza")
    expect(enviadosAoCrm[0]?.body.page).toBe("vind-residence")
  })

  it("preenche client_ip/client_ua a partir dos headers do visitante", async () => {
    const { res } = fakeRes()
    await leadHandler(fakeReq({ ...LEAD, tracking: TRACKING_DO_BROWSER }, HEADERS_DO_VISITANTE), res)

    const tracking = enviadosAoCrm[0]?.body.tracking as Record<string, unknown>
    // Primeiro valor da lista = IP real do cliente na Vercel.
    expect(tracking.client_ip).toBe("187.1.2.3")
    expect(tracking.client_ua).toBe("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")
  })

  it("SOBRESCREVE client_ip/client_ua que o browser tenha tentado ditar", async () => {
    const { res } = fakeRes()
    await leadHandler(
      fakeReq(
        {
          ...LEAD,
          tracking: { ...TRACKING_DO_BROWSER, client_ip: "1.1.1.1", client_ua: "forjado" },
        },
        HEADERS_DO_VISITANTE,
      ),
      res,
    )

    const tracking = enviadosAoCrm[0]?.body.tracking as Record<string, unknown>
    expect(tracking.client_ip).toBe("187.1.2.3")
    expect(tracking.client_ua).not.toBe("forjado")
  })

  it("descarta chaves fora da allowlist — o proxy não é encaminhador cego", async () => {
    const { res } = fakeRes()
    await leadHandler(
      fakeReq(
        {
          ...LEAD,
          tracking: { ...TRACKING_DO_BROWSER, campo_arbitrario: "x", __proto__: { a: 1 } },
        },
        HEADERS_DO_VISITANTE,
      ),
      res,
    )

    const tracking = enviadosAoCrm[0]?.body.tracking as Record<string, unknown>
    expect(tracking.campo_arbitrario).toBeUndefined()
    expect(Object.keys(tracking).sort()).toEqual([
      "client_ip",
      "client_ua",
      "complete_registration_event_id",
      "event_id",
      "fbc",
      "fbclid",
      "fbp",
      "page_url",
      "visitor_id",
    ])
  })

  it("AC10: sem tracking no corpo, o payload é o de antes da story + IP/UA", async () => {
    const { res, estado } = fakeRes()
    await leadHandler(fakeReq(LEAD, HEADERS_DO_VISITANTE), res)

    expect(estado.status).toBe(200)
    const body = enviadosAoCrm[0]!.body
    expect(Object.keys(body).sort()).toEqual(["email", "nome", "page", "tracking", "whatsapp"])
    // O bloco existe só com IP/UA: é o que o CRM precisa para o "Visitou" mais
    // tarde. Sem event_id nenhum, o CRM não dispara evento algum (AC10).
    expect(body.tracking).toEqual({
      client_ip: "187.1.2.3",
      client_ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)",
    })
  })

  it("honeypot devolve 200 com tracked:false — bot não gera evento de browser", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { res, estado } = fakeRes()
    await leadHandler(fakeReq({ ...LEAD, empresa: "bot" }, HEADERS_DO_VISITANTE), res)

    // Status HTTP indistinguível de um envio real — é o que o bot observa.
    expect(estado.status).toBe(200)
    expect(estado.body).toEqual({ status: "ok", tracked: false })
    expect(enviadosAoCrm).toHaveLength(0)
    warn.mockRestore()
  })

  it("envio real devolve tracked:true, que libera o disparo no Pixel", async () => {
    const { res, estado } = fakeRes()
    await leadHandler(fakeReq({ ...LEAD, tracking: TRACKING_DO_BROWSER }), res)
    expect(estado.body).toEqual({ status: "ok", tracked: true })
  })

  it("AC9: não loga o corpo da requisição quando o upstream quebra", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.stubGlobal("fetch", async () => {
      throw new Error("ECONNRESET ao falar com o CRM")
    })

    const { res, estado } = fakeRes()
    await leadHandler(fakeReq({ ...LEAD, tracking: TRACKING_DO_BROWSER }, HEADERS_DO_VISITANTE), res)

    expect(estado.status).toBe(500)
    const logado = erro.mock.calls.map((c) => JSON.stringify(c)).join(" ")
    for (const segredo of ["Maria", "exemplo.com", "187.1.2.3", TRACKING_DO_BROWSER.fbp]) {
      expect(logado).not.toContain(segredo)
    }
    erro.mockRestore()
  })
})

describe("api/track.js — AC5, AC7", () => {
  const EVENTO = {
    event_name: "ViewContent",
    event_id: "44444444-4444-4444-8444-444444444444",
    visitor_id: TRACKING_DO_BROWSER.visitor_id,
    fbp: TRACKING_DO_BROWSER.fbp,
    page_url: TRACKING_DO_BROWSER.page_url,
  }

  it("repassa o evento ao CRM com o IP e o UA reais do visitante", async () => {
    const { res, estado } = fakeRes()
    await trackHandler(fakeReq(EVENTO, HEADERS_DO_VISITANTE), res)

    expect(estado.status).toBe(200)
    const body = enviadosAoCrm[0]!.body
    expect(body.event_name).toBe("ViewContent")
    expect(body.event_id).toBe(EVENTO.event_id)
    expect(body.client_ip).toBe("187.1.2.3")
    expect(body.client_ua).toBe("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")
    // O token vai na query string, nunca no corpo.
    expect(enviadosAoCrm[0]?.url).toContain(`token=${SECRET}`)
  })

  it("ignora client_ip/client_ua vindos do browser", async () => {
    const { res } = fakeRes()
    await trackHandler(
      fakeReq({ ...EVENTO, client_ip: "1.1.1.1", client_ua: "forjado" }, HEADERS_DO_VISITANTE),
      res,
    )
    expect(enviadosAoCrm[0]?.body.client_ip).toBe("187.1.2.3")
    expect(enviadosAoCrm[0]?.body.client_ua).not.toBe("forjado")
  })

  it("recusa corpo sem event_name ou sem event_id", async () => {
    const a = fakeRes()
    await trackHandler(fakeReq({ event_id: EVENTO.event_id }), a.res)
    const b = fakeRes()
    await trackHandler(fakeReq({ event_name: "ViewContent" }), b.res)

    expect(a.estado.status).toBe(400)
    expect(b.estado.status).toBe(400)
    expect(enviadosAoCrm).toHaveLength(0)
  })

  it("responde 503 sem o segredo configurado, sem chamar o CRM", async () => {
    delete process.env.LANDING_PAGE_WEBHOOK_SECRET
    const erro = vi.spyOn(console, "error").mockImplementation(() => {})
    const { res, estado } = fakeRes()
    await trackHandler(fakeReq(EVENTO), res)

    expect(estado.status).toBe(503)
    expect(enviadosAoCrm).toHaveLength(0)
    erro.mockRestore()
  })

  it("responde 502 quando o CRM devolve erro, sem derrubar a página", async () => {
    respostaDoCrm = { ok: false, status: 500 }
    const erro = vi.spyOn(console, "error").mockImplementation(() => {})
    const { res, estado } = fakeRes()
    await trackHandler(fakeReq(EVENTO, HEADERS_DO_VISITANTE), res)

    expect(estado.status).toBe(502)
    erro.mockRestore()
  })

  it("só ecoa a origem quando ela está na allowlist", async () => {
    const permitida = fakeRes()
    await trackHandler(fakeReq(EVENTO, { origin: "https://trifold.eng.br" }), permitida.res)
    const negada = fakeRes()
    await trackHandler(fakeReq(EVENTO, { origin: "https://site-malicioso.com" }), negada.res)

    expect(permitida.estado.headers["Access-Control-Allow-Origin"]).toBe(
      "https://trifold.eng.br",
    )
    expect(negada.estado.headers["Access-Control-Allow-Origin"]).not.toContain(
      "site-malicioso",
    )
  })
})
