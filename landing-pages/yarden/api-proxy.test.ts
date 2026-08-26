/**
 * Story 86-12 (AC8, AC10, AC11) — os proxies serverless da landing do Yarden.
 *
 * Estas duas funções são o ÚNICO ponto da cadeia que enxerga o IP e o
 * User-Agent REAIS do visitante: o browser as chama diretamente, enquanto o CRM
 * é chamado servidor-a-servidor a partir daqui e só veria o IP do datacenter da
 * Vercel. Se o repasse de `client_ip`/`client_ua` regredir, todo evento desta
 * landing sai com o IP errado — sem erro, sem log, com aparência de sucesso no
 * Events Manager (o análogo exato do defeito 86.9-QA-001).
 *
 * Além disso, este arquivo é clone de um proxy que já existe para OUTRO
 * empreendimento. As duas classes de erro que um clone comete em silêncio, e que
 * nenhum teste de CAPI pegaria, têm caso dedicado aqui:
 *
 * 1. `page` continuar `"vind-residence"` → todo lead do Yarden entra no CRM
 *    rotulado como Vind Residence (`webhook_logs.payload.page`,
 *    `leads.metadata.landing_page`, `leads.metadata.page`, descrição da activity).
 * 2. `landing` ausente → o CRM cai no default `vind_residence` e todo evento
 *    CAPI sai com `content_category: "landing_vind_residence"`.
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
  page_url: "https://trifold.eng.br/yarden/",
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

describe("api/lead.js — identidade da landing (AC8)", () => {
  it("manda page:'yarden' — o literal do clone é o erro que ninguém veria", async () => {
    const { res, estado } = fakeRes()
    await leadHandler(fakeReq({ ...LEAD, tracking: TRACKING_DO_BROWSER }, HEADERS_DO_VISITANTE), res)

    expect(estado.status).toBe(200)
    const payload = enviadosAoCrm[0]!.body
    // Assert POSITIVO, não só `not.toBe("vind-residence")`: é este campo que o
    // CRM persiste em leads.metadata.landing_page / .page e na activity.
    expect(payload.page).toBe("yarden")
  })

  it("manda tracking.landing:'yarden' — é o que segmenta o content_category", async () => {
    const { res } = fakeRes()
    await leadHandler(fakeReq({ ...LEAD, tracking: TRACKING_DO_BROWSER }, HEADERS_DO_VISITANTE), res)

    const tracking = enviadosAoCrm[0]?.body.tracking as Record<string, unknown>
    expect(tracking.landing).toBe("yarden")
  })

  it("IGNORA um landing forjado pelo browser — a fonte é o proxy, não o corpo", async () => {
    const { res } = fakeRes()
    await leadHandler(
      fakeReq(
        { ...LEAD, tracking: { ...TRACKING_DO_BROWSER, landing: "vind_residence" } },
        HEADERS_DO_VISITANTE,
      ),
      res,
    )

    const tracking = enviadosAoCrm[0]?.body.tracking as Record<string, unknown>
    // Sem isso, qualquer chamador com o token gravaria eventos sob a categoria
    // de outro empreendimento — mesmo risco de client_ip/client_ua (86.11-QA-001).
    expect(tracking.landing).toBe("yarden")
  })

  it("manda landing mesmo quando o browser não mandou tracking nenhum", async () => {
    const { res } = fakeRes()
    await leadHandler(fakeReq(LEAD, HEADERS_DO_VISITANTE), res)

    const tracking = enviadosAoCrm[0]?.body.tracking as Record<string, unknown>
    expect(tracking.landing).toBe("yarden")
    // Sem event_id o CRM não dispara evento algum — o bloco existir não fabrica
    // conversão (86-11 AC10).
    expect(tracking.event_id).toBeUndefined()
  })
})

describe("api/lead.js — repasse de tracking (AC8, herdado da 86-11)", () => {
  it("repassa o bloco tracking do browser", async () => {
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
    expect(enviadosAoCrm[0]?.body.nome).toBe("Maria Souza")
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
      "landing",
      "page_url",
      "visitor_id",
    ])
  })

  it("payload sem tracking do browser: campos do lead + landing + IP/UA", async () => {
    const { res, estado } = fakeRes()
    await leadHandler(fakeReq(LEAD, HEADERS_DO_VISITANTE), res)

    expect(estado.status).toBe(200)
    const body = enviadosAoCrm[0]!.body
    expect(Object.keys(body).sort()).toEqual(["email", "nome", "page", "tracking", "whatsapp"])
    expect(body.tracking).toEqual({
      client_ip: "187.1.2.3",
      client_ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)",
      landing: "yarden",
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

  it("recusa submissão totalmente vazia sem chamar o CRM", async () => {
    const { res, estado } = fakeRes()
    await leadHandler(fakeReq({}, HEADERS_DO_VISITANTE), res)
    expect(estado.status).toBe(400)
    expect(enviadosAoCrm).toHaveLength(0)
  })

  it("AC10: não loga o corpo da requisição quando o upstream quebra", async () => {
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

  it("só ecoa a origem quando ela está na allowlist do Yarden", async () => {
    const permitida = fakeRes()
    await leadHandler(fakeReq(LEAD, { origin: "https://yarden.vercel.app" }), permitida.res)
    const negada = fakeRes()
    await leadHandler(fakeReq(LEAD, { origin: "https://site-malicioso.com" }), negada.res)

    expect(permitida.estado.headers["Access-Control-Allow-Origin"]).toBe(
      "https://yarden.vercel.app",
    )
    expect(negada.estado.headers["Access-Control-Allow-Origin"]).not.toContain("site-malicioso")
    // O fallback é a origem do próprio projeto, nunca a de outra landing.
    expect(negada.estado.headers["Access-Control-Allow-Origin"]).not.toContain("vind-residence")
  })
})

describe("api/track.js — AC5, AC8", () => {
  const EVENTO = {
    event_name: "ViewContent",
    event_id: "44444444-4444-4444-8444-444444444444",
    visitor_id: TRACKING_DO_BROWSER.visitor_id,
    fbp: TRACKING_DO_BROWSER.fbp,
    page_url: TRACKING_DO_BROWSER.page_url,
  }

  it("repassa o evento ao CRM com landing, IP e UA reais do visitante", async () => {
    const { res, estado } = fakeRes()
    await trackHandler(fakeReq(EVENTO, HEADERS_DO_VISITANTE), res)

    expect(estado.status).toBe(200)
    const body = enviadosAoCrm[0]!.body
    expect(body.event_name).toBe("ViewContent")
    expect(body.event_id).toBe(EVENTO.event_id)
    // O corpo desta rota já É o bloco de tracking — `landing` vai na raiz.
    expect(body.landing).toBe("yarden")
    expect(body.client_ip).toBe("187.1.2.3")
    expect(body.client_ua).toBe("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")
    // O token vai na query string, nunca no corpo.
    expect(enviadosAoCrm[0]?.url).toContain(`token=${SECRET}`)
    // `page` é exclusivo do lead.js: a rota /track não grava nada no CRM.
    expect(body.page).toBeUndefined()
  })

  it("ignora landing/client_ip/client_ua vindos do browser", async () => {
    const { res } = fakeRes()
    await trackHandler(
      fakeReq(
        { ...EVENTO, landing: "vind_residence", client_ip: "1.1.1.1", client_ua: "forjado" },
        HEADERS_DO_VISITANTE,
      ),
      res,
    )
    expect(enviadosAoCrm[0]?.body.landing).toBe("yarden")
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

    expect(permitida.estado.headers["Access-Control-Allow-Origin"]).toBe("https://trifold.eng.br")
    expect(negada.estado.headers["Access-Control-Allow-Origin"]).not.toContain("site-malicioso")
  })

  it("responde CORS preflight sem exigir corpo nem token", async () => {
    const { res, estado } = fakeRes()
    await trackHandler({ method: "OPTIONS", headers: { origin: "https://trifold.eng.br" } }, res)
    expect(estado.status).toBe(204)
    expect(estado.headers["Access-Control-Allow-Methods"]).toContain("POST")
  })
})
