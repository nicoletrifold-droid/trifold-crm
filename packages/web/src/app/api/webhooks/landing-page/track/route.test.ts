/**
 * Story 86-11 (AC5) — a rota de eventos de TOPO de funil da landing.
 *
 * Dois riscos guiam estes testes: (1) um endpoint público que aceitasse
 * "me manda um Lead" seria um canal aberto para inflar conversão paga;
 * (2) o IP que esta rota enxerga é o do proxy Vercel, não o do visitante — usá-lo
 * degradaria a atribuição sem erro nenhum aparecer.
 *
 * O envio à CAPI é interceptado — o teste não fala com o Meta.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const pendentes: Promise<unknown>[] = []
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (fn: () => unknown) => {
    pendentes.push(Promise.resolve().then(fn))
  },
}))

const batches: Record<string, unknown>[][] = []
vi.mock("@trifold/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@trifold/shared")>()),
  sendCapiEvents: async (eventos: Record<string, unknown>[]) => {
    batches.push(eventos)
    return { success: true, eventsReceived: eventos.length }
  },
}))

/** Se esta rota tocar no banco, o mock explode — e é essa a intenção. */
const acessosAoBanco: string[] = []
vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      acessosAoBanco.push(table)
      throw new Error(`rota de telemetria não deve tocar em ${table}`)
    },
  }),
}))

const { NextRequest } = await import("next/server")
const { POST, OPTIONS } = await import("./route")

const SECRET = "segredo-do-webhook"
const URL_BASE = "https://crm.trifold.eng.br/api/webhooks/landing-page/track"
const EVENT_ID = "44444444-4444-4444-8444-444444444444"

/** Headers como o CRM os vê: quem chama é o proxy `api/track.js`. */
const HEADERS_DO_PROXY = {
  "x-forwarded-for": "76.76.21.21, 10.0.0.1",
  "user-agent": "node-fetch/1.0 (+https://vercel.com)",
}

function post(body: unknown, headers: Record<string, string> = {}, token = SECRET) {
  return new NextRequest(`${URL_BASE}?token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

const CORPO = {
  event_name: "ViewContent",
  event_id: EVENT_ID,
  visitor_id: "33333333-3333-4333-8333-333333333333",
  fbp: "fb.1.1700000000000.9876543210",
  client_ip: "187.1.2.3",
  client_ua: "Mozilla/5.0 (iPhone)",
  page_url: "https://trifold.eng.br/vindresidence/",
}

async function flush() {
  await Promise.all(pendentes)
  pendentes.length = 0
}

beforeEach(() => {
  batches.length = 0
  pendentes.length = 0
  acessosAoBanco.length = 0
  process.env.LANDING_PAGE_WEBHOOK_SECRET = SECRET
  delete process.env.META_CAPI_TEST_EVENT_CODE
})

describe("eventos aceitos", () => {
  it("envia ViewContent com o MESMO event_id do browser e categoria própria", async () => {
    const res = await POST(post(CORPO, HEADERS_DO_PROXY))
    await flush()

    expect(res.status).toBe(200)
    expect(batches).toHaveLength(1)
    const evento = batches[0]![0]!
    expect(evento.event_name).toBe("ViewContent")
    // Ids divergentes = o Meta conta dois eventos em vez de deduplicar um.
    expect(evento.event_id).toBe(EVENT_ID)
    expect(evento.action_source).toBe("website")
    expect(evento.event_source_url).toBe(CORPO.page_url)
    expect((evento.custom_data as Record<string, unknown>).content_category).toBe(
      "landing_vind_residence",
    )
  })

  // --- Story 86-12 (AC6) — discriminador multi-landing ---
  it("com landing:'yarden' o evento sai na categoria do Yarden", async () => {
    const res = await POST(post({ ...CORPO, landing: "yarden" }, HEADERS_DO_PROXY))
    await flush()

    expect(res.status).toBe(200)
    const custom = batches[0]![0]!.custom_data as Record<string, unknown>
    expect(custom.content_category).toBe("landing_yarden")
    expect(custom.content_name).toBe("Landing Yarden")
  })

  it("landing desconhecido cai no Vind Residence em vez de quebrar o evento", async () => {
    await POST(post({ ...CORPO, landing: "empreendimento-inexistente" }, HEADERS_DO_PROXY))
    await flush()

    expect((batches[0]![0]!.custom_data as Record<string, unknown>).content_category).toBe(
      "landing_vind_residence",
    )
  })

  it("aceita InitiateCheckout", async () => {
    const res = await POST(post({ ...CORPO, event_name: "InitiateCheckout" }))
    await flush()
    expect(res.status).toBe(200)
    expect(batches[0]![0]?.event_name).toBe("InitiateCheckout")
  })

  it("usa só o visitor_id como external_id — ainda não existe lead", async () => {
    await POST(post(CORPO, HEADERS_DO_PROXY))
    await flush()

    const userData = batches[0]![0]!.user_data as Record<string, unknown>
    expect(userData.external_id).toHaveLength(1)
    expect(userData.em).toBeUndefined()
    expect(userData.ph).toBeUndefined()
    expect(userData.st).toBeUndefined()
    // fbp em texto puro — hashear quebraria a correspondência.
    expect(userData.fbp).toBe(CORPO.fbp)
  })

  it("não grava nada em leads nem em webhook_logs", async () => {
    await POST(post(CORPO, HEADERS_DO_PROXY))
    await flush()
    expect(acessosAoBanco).toEqual([])
  })
})

describe("AC7 — IP/UA do corpo vencem os do proxy", () => {
  it("manda o IP e o UA do visitante, não os do datacenter Vercel", async () => {
    await POST(post(CORPO, HEADERS_DO_PROXY))
    await flush()

    const userData = batches[0]![0]!.user_data as Record<string, unknown>
    expect(userData.client_ip_address).toBe("187.1.2.3")
    expect(userData.client_user_agent).toBe("Mozilla/5.0 (iPhone)")
    expect(JSON.stringify(batches)).not.toContain("76.76.21.21")
  })

  it("cai no header quando o proxy não mandou os campos", async () => {
    const semIp = { ...CORPO } as Record<string, unknown>
    delete semIp.client_ip
    delete semIp.client_ua

    await POST(post(semIp, HEADERS_DO_PROXY))
    await flush()

    const userData = batches[0]![0]!.user_data as Record<string, unknown>
    expect(userData.client_ip_address).toBe("76.76.21.21")
  })
})

describe("o que a rota recusa", () => {
  it("NÃO aceita Lead — senão qualquer um inflaria conversão de graça", async () => {
    const res = await POST(post({ ...CORPO, event_name: "Lead" }))
    await flush()
    expect(res.status).toBe(400)
    expect(batches).toHaveLength(0)
  })

  it("NÃO aceita CompleteRegistration pelo mesmo motivo", async () => {
    const res = await POST(post({ ...CORPO, event_name: "CompleteRegistration" }))
    await flush()
    expect(res.status).toBe(400)
    expect(batches).toHaveLength(0)
  })

  it("recusa evento fora da allowlist em vez de ignorar em silêncio", async () => {
    const res = await POST(post({ ...CORPO, event_name: "Purchase" }))
    await flush()
    expect(res.status).toBe(400)
    // Descarte silencioso esconderia um funil pela metade.
    expect(await res.json()).toEqual({ error: "Event not accepted" })
  })

  it("recusa event_id ausente ou fora do formato — sem id não há dedup", async () => {
    const semId = { ...CORPO } as Record<string, unknown>
    delete semId.event_id

    expect((await POST(post(semId))).status).toBe(400)
    expect((await POST(post({ ...CORPO, event_id: "curto" }))).status).toBe(400)
    await flush()
    expect(batches).toHaveLength(0)
  })

  it("aceita o event_id de fallback do helper vanilla (navegador sem randomUUID)", async () => {
    // `e-<base36>-<base36>`: exigir UUID estrito descartaria em silêncio os
    // eventos justamente dos navegadores mais frágeis.
    const res = await POST(post({ ...CORPO, event_id: "e-m3k9x1p-a7f2b9c1" }))
    await flush()
    expect(res.status).toBe(200)
    expect(batches[0]![0]?.event_id).toBe("e-m3k9x1p-a7f2b9c1")
  })

  it("recusa token inválido e token ausente", async () => {
    expect((await POST(post(CORPO, {}, "errado"))).status).toBe(401)
    const semToken = new NextRequest(URL_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(CORPO),
    })
    expect((await POST(semToken)).status).toBe(401)
    await flush()
    expect(batches).toHaveLength(0)
  })

  it("aceita o token por Authorization: Bearer", async () => {
    const req = new NextRequest(URL_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json", authorization: `Bearer ${SECRET}` },
      body: JSON.stringify(CORPO),
    })
    expect((await POST(req)).status).toBe(200)
    await flush()
    expect(batches).toHaveLength(1)
  })

  it("responde 503 sem o segredo configurado, sem chamar a CAPI", async () => {
    delete process.env.LANDING_PAGE_WEBHOOK_SECRET
    const erro = vi.spyOn(console, "error").mockImplementation(() => {})
    expect((await POST(post(CORPO))).status).toBe(503)
    await flush()
    expect(batches).toHaveLength(0)
    erro.mockRestore()
  })

  it("recusa corpo que não é JSON", async () => {
    const res = await POST(post("isto não é json"))
    expect(res.status).toBe(400)
  })
})

describe("AC10 — degradação graciosa", () => {
  it("envia mesmo sem fbp/fbc/visitor_id (bloqueador de anúncios)", async () => {
    const res = await POST(
      post({ event_name: "ViewContent", event_id: EVENT_ID }, HEADERS_DO_PROXY),
    )
    await flush()

    expect(res.status).toBe(200)
    const userData = batches[0]![0]!.user_data as Record<string, unknown>
    expect(userData.fbp).toBeUndefined()
    expect(userData.fbc).toBeUndefined()
    // IP e UA seguem presentes — nenhum bloqueador os remove.
    expect(userData.client_ip_address).toBeDefined()
  })

  it("cai na URL padrão da landing quando o browser não mandou page_url", async () => {
    const semUrl = { ...CORPO } as Record<string, unknown>
    delete semUrl.page_url

    await POST(post(semUrl, HEADERS_DO_PROXY))
    await flush()
    expect(batches[0]![0]?.event_source_url).toBe("https://trifold.eng.br/vindresidence/")
  })

  it("a URL padrão acompanha a landing quando o browser não mandou page_url", async () => {
    const semUrl = { ...CORPO, landing: "yarden" } as Record<string, unknown>
    delete semUrl.page_url

    await POST(post(semUrl, HEADERS_DO_PROXY))
    await flush()
    expect(batches[0]![0]?.event_source_url).toBe("https://trifold.eng.br/yarden/")
  })

  it("responde CORS preflight sem exigir token", async () => {
    const res = await OPTIONS()
    expect(res.status).toBe(204)
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST")
  })
})
