/**
 * Story 86-9 — a rota pública de eventos de funil.
 *
 * O alvo aqui é a JUNÇÃO, não a função pura: o evento chega à CAPI com o mesmo
 * `event_id` que o browser usou? um endpoint público consegue forjar um `Lead`?
 * um bloqueador de anúncios que apaga os cookies derruba a rota?
 *
 * O envio à CAPI é interceptado — o teste não fala com o Meta.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

// `after()` só existe dentro do contexto de request da Vercel. No teste, roda na hora.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (fn: () => unknown) => {
    void fn()
  },
}))

/** Eventos que chegariam à Conversions API. */
const enviados: Record<string, unknown>[] = []
vi.mock("@web/lib/meta/form-capi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@web/lib/meta/form-capi")>()),
  enviarEventoFormulario: async (input: Record<string, unknown>) => {
    enviados.push(input)
    return true
  },
}))

type Row = Record<string, unknown>
let formularios: Row[] = []

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const preds: ((r: Row) => boolean)[] = []
      const api: Record<string, unknown> = {
        select: () => api,
        eq: (c: string, v: unknown) => {
          preds.push((r) => String(r[c]) === String(v))
          return api
        },
        maybeSingle: async () => ({
          data: formularios.filter((r) => preds.every((p) => p(r)))[0] ?? null,
          error: null,
        }),
      }
      return api
    },
  }),
}))

const { POST } = await import("./route")

const TOKEN = "11111111-1111-4111-8111-111111111111"
const EVENT_ID = "33333333-3333-4333-8333-333333333333"

function requisicao(body: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://crm.trifold.eng.br/api/formulario/${TOKEN}/tracking`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any
}

const params = { params: Promise.resolve({ token: TOKEN }) }

beforeEach(() => {
  enviados.length = 0
  formularios = [{ token: TOKEN, is_active: true, nome: "Investimento Maringá" }]
})

describe("eventos aceitos", () => {
  it("envia ViewContent à CAPI com o MESMO event_id do browser", async () => {
    const res = await POST(
      requisicao({
        evento: "ViewContent",
        event_id: EVENT_ID,
        visitor_id: "visitante-1",
        fbp: "fb.1.1700000000000.123",
        fbc: "fb.1.1700000000000.abc",
        page_url: "https://crm.trifold.eng.br/formulario/x?fbclid=abc",
      }),
      params,
    )

    expect(res.status).toBe(200)
    expect(enviados).toHaveLength(1)
    // Ids divergentes = o Meta conta duas conversões em vez de deduplicar uma.
    expect(enviados[0]?.eventId).toBe(EVENT_ID)
    expect(enviados[0]?.evento).toBe("ViewContent")
    expect(enviados[0]?.contentName).toBe("Investimento Maringá")
  })

  it("aceita InitiateCheckout", async () => {
    const res = await POST(
      requisicao({ evento: "InitiateCheckout", event_id: EVENT_ID }),
      params,
    )
    expect(res.status).toBe(200)
    expect(enviados[0]?.evento).toBe("InitiateCheckout")
  })

  it("repassa fbp/fbc em texto puro e captura IP e User-Agent dos headers", async () => {
    await POST(
      requisicao(
        { evento: "ViewContent", event_id: EVENT_ID, fbp: "fb.1.1.p", fbc: "fb.1.1.c" },
        { "x-forwarded-for": "187.1.2.3, 10.0.0.1", "user-agent": "Mozilla/5.0 (iPhone)" },
      ),
      params,
    )

    const sinais = enviados[0]?.sinais as Record<string, string>
    expect(sinais.fbp).toBe("fb.1.1.p")
    expect(sinais.fbc).toBe("fb.1.1.c")
    // Primeiro valor da lista = IP real do cliente na Vercel.
    expect(sinais.clientIp).toBe("187.1.2.3")
    expect(sinais.clientUa).toBe("Mozilla/5.0 (iPhone)")
  })

  it("SEGURANÇA 86.11-QA-001: client_ip/client_ua forjados no corpo são IGNORADOS", async () => {
    // 🔴 Esta rota é pública e o corpo é o JSON BRUTO do visitante, apenas
    // *castado* para `CorpoPost extends CorpoTracking` — uma interface do
    // TypeScript não filtra chave nenhuma em runtime. Quando a Story 86-11 deu
    // precedência a `client_ip`/`client_ua` do corpo (para o proxy da landing do
    // Vind Residence), qualquer visitante passou a poder forjar a geografia e o
    // dispositivo no dataset do Meta. A precedência virou opt-in; aqui ela NÃO é
    // pedida, então o header — a única fonte que o visitante não escolhe — vence.
    await POST(
      requisicao(
        {
          evento: "ViewContent",
          event_id: EVENT_ID,
          client_ip: "1.2.3.4",
          client_ua: "UA-forjado-pelo-visitante",
        },
        { "x-forwarded-for": "187.1.2.3, 10.0.0.1", "user-agent": "Mozilla/5.0 (iPhone)" },
      ),
      params,
    )

    const sinais = enviados[0]?.sinais as Record<string, string>
    expect(sinais.clientIp).toBe("187.1.2.3")
    expect(sinais.clientUa).toBe("Mozilla/5.0 (iPhone)")
    // O valor forjado não pode sobreviver em canto nenhum do que vai à CAPI.
    expect(JSON.stringify(enviados)).not.toContain("1.2.3.4")
    expect(JSON.stringify(enviados)).not.toContain("UA-forjado-pelo-visitante")
  })

  it("deriva o fbc do fbclid quando o cookie _fbc ainda não existe", async () => {
    await POST(
      requisicao({ evento: "ViewContent", event_id: EVENT_ID, fbclid: "IwAR123" }),
      params,
    )
    // Sem essa derivação, o clique pago chega ao Meta desligado do anúncio.
    expect(enviados[0] && (enviados[0].sinais as Record<string, string>).fbc).toMatch(
      /^fb\.1\.\d+\.IwAR123$/,
    )
  })
})

describe("o que a rota recusa", () => {
  it("NÃO aceita Lead — senão qualquer um inflaria conversão de graça", async () => {
    const res = await POST(requisicao({ evento: "Lead", event_id: EVENT_ID }), params)
    expect(res.status).toBe(400)
    expect(enviados).toHaveLength(0)
  })

  it("NÃO aceita CompleteRegistration pelo mesmo motivo", async () => {
    const res = await POST(
      requisicao({ evento: "CompleteRegistration", event_id: EVENT_ID }),
      params,
    )
    expect(res.status).toBe(400)
    expect(enviados).toHaveLength(0)
  })

  it("recusa event_id ausente ou fora do formato — sem id não há deduplicação", async () => {
    expect((await POST(requisicao({ evento: "ViewContent" }), params)).status).toBe(400)
    expect(
      (await POST(requisicao({ evento: "ViewContent", event_id: "abc" }), params)).status,
    ).toBe(400)
    expect(enviados).toHaveLength(0)
  })

  it("responde 404 igual para token inexistente e para formulário inativo", async () => {
    formularios = [{ token: TOKEN, is_active: false, nome: "Desativado" }]
    const inativo = await POST(requisicao({ evento: "ViewContent", event_id: EVENT_ID }), params)

    formularios = []
    const inexistente = await POST(
      requisicao({ evento: "ViewContent", event_id: EVENT_ID }),
      params,
    )

    expect(inativo.status).toBe(404)
    expect(inexistente.status).toBe(404)
    expect(await inativo.json()).toEqual(await inexistente.json())
    expect(enviados).toHaveLength(0)
  })

  it("recusa token mal formado sem sequer consultar o banco", async () => {
    const res = await POST(requisicao({ evento: "ViewContent", event_id: EVENT_ID }), {
      params: Promise.resolve({ token: "nao-e-uuid" }),
    })
    expect(res.status).toBe(404)
  })

  it("recusa corpo que não é JSON", async () => {
    const req = new Request("https://x/y", { method: "POST", body: "isto não é json" })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any, params)
    expect(res.status).toBe(400)
  })
})

describe("AC10 — degradação graciosa", () => {
  it("envia mesmo sem fbp/fbc/visitor_id (bloqueador de anúncios, aba anônima)", async () => {
    // Um browser real sempre manda User-Agent; o que o bloqueador remove são os
    // cookies do Pixel. É exatamente esse cenário que este teste reproduz.
    const res = await POST(
      requisicao({ evento: "ViewContent", event_id: EVENT_ID }, { "user-agent": "Mozilla/5.0" }),
      params,
    )

    expect(res.status).toBe(200)
    expect(enviados).toHaveLength(1)
    const sinais = enviados[0]?.sinais as Record<string, string | undefined>
    expect(sinais.fbp).toBeUndefined()
    expect(sinais.fbc).toBeUndefined()
    // IP e User-Agent seguem presentes — nenhum bloqueador os remove.
    expect(sinais.clientUa).toBeDefined()
  })

  it("cai na URL padrão da rota quando o browser não manda page_url", async () => {
    await POST(requisicao({ evento: "ViewContent", event_id: EVENT_ID }), params)
    expect(enviados[0]?.urlPadrao).toBe(
      `https://crm.trifold.eng.br/formulario/${TOKEN}`,
    )
  })
})
