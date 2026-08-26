/**
 * Story 75-340 — a ORIGEM do lead passa a ser a do último contato.
 *
 * O caso que motivou a story: "Lucas Teste" já existia na base com
 * `source=website` + `utm_content="LP Vind Residence"`. Ele preencheu o
 * formulário novo e a ficha continuou mostrando a campanha antiga como origem —
 * o corretor lia origem errada. Aqui o alvo é exatamente esse ramo (lead que já
 * existe), com filtros aplicados de verdade no fake.
 *
 * O POST usado é o PARCIAL de propósito: o lead nasce/atualiza assim que há nome
 * + telefone, e assim o teste não precisa arrastar score, LGPD e a leitura por IA
 * (que têm cobertura própria).
 */
import { describe, it, expect, beforeEach, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@web/lib/leads/default-stage", () => ({
  getDefaultStageId: async () => "stage-novo",
}))

// `after()` só existe dentro do contexto de request da Vercel. No teste, roda na hora.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (fn: () => unknown) => {
    void fn()
  },
}))

/** Eventos que chegariam à Conversions API. O teste não fala com o Meta. */
const eventosCapi: Record<string, unknown>[] = []
vi.mock("@web/lib/meta/form-capi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@web/lib/meta/form-capi")>()),
  enviarEventoFormulario: async (input: Record<string, unknown>) => {
    eventosCapi.push(input)
    return true
  },
}))

type Row = Record<string, unknown>
type Db = { lead_forms: Row[]; leads: Row[]; lead_form_responses: Row[]; activities: Row[] }
let db: Db

function query(table: keyof Db) {
  const preds: ((r: Row) => boolean)[] = []
  let payload: Row | null = null
  let mode: "select" | "insert" | "update" = "select"

  const api: Record<string, unknown> = {
    select: () => api,
    eq: (c: string, v: unknown) => {
      preds.push((r) => String(r[c]) === String(v))
      return api
    },
    limit: () => api,
    insert: (p: Row) => {
      mode = "insert"
      payload = p
      return api
    },
    update: (p: Row) => {
      mode = "update"
      payload = p
      return api
    },
    maybeSingle: async () => {
      const rows = db[table].filter((r) => preds.every((p) => p(r)))
      return { data: rows[0] ?? null, error: null }
    },
    single: async () => {
      if (mode === "insert") {
        const row = { id: `${table}-${db[table].length + 1}`, ...(payload as Row) }
        db[table] = [...db[table], row]
        return { data: row, error: null }
      }
      const rows = db[table].filter((r) => preds.every((p) => p(r)))
      return { data: rows[0] ?? null, error: null }
    },
    then: (resolve: (v: { data: unknown; error: null }) => unknown) => {
      if (mode === "insert") {
        db[table] = [...db[table], { id: `${table}-${db[table].length + 1}`, ...(payload as Row) }]
        return resolve({ data: null, error: null })
      }
      if (mode === "update") {
        db[table] = db[table].map((r) => (preds.every((p) => p(r)) ? { ...r, ...(payload as Row) } : r))
        return resolve({ data: null, error: null })
      }
      return resolve({ data: db[table].filter((r) => preds.every((p) => p(r))), error: null })
    },
  }
  return api
}

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (t: string) => query(t as keyof Db) }),
}))

const TOKEN = "11111111-1111-4111-8111-111111111111"

function estadoBase() {
  db = {
    lead_forms: [
      {
        id: "form-1",
        org_id: "org-1",
        nome: "Investimento Maringá — Agosto",
        is_active: true,
        token: TOKEN,
        schema: {
          perguntas: [
            { id: "n", tipo: "texto", titulo: "Seu nome", campo_contato: "nome" },
            { id: "t", tipo: "telefone", titulo: "Seu WhatsApp", campo_contato: "telefone" },
            { id: "q", tipo: "texto", titulo: "O que te atrai?", obrigatoria: true },
          ],
        },
      },
    ],
    // O lead do caso real: veio de campanha antiga, source=website.
    leads: [
      {
        id: "lead-1",
        org_id: "org-1",
        name: "Lucas Teste",
        phone: "+5544988447212",
        phone_normalized: "5544988447212",
        email: null,
        source: "website",
        utm_content: "LP Vind Residence",
        metadata: { raw_fields: { form_name: "LP Vind Residence" } },
      },
    ],
    lead_form_responses: [],
    activities: [],
  }
}

async function post(body: Record<string, unknown>) {
  const { POST } = await import("./route")
  const req = new Request("http://x/api/formulario/x", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "x-forwarded-for": `10.0.0.${Math.floor(db.activities.length + 1)}` },
  })
  return POST(req as never, { params: Promise.resolve({ token: TOKEN }) })
}

/** Igual a `post()`, mas com controle dos headers da requisição. */
async function postComHeaders(body: Record<string, unknown>, headers: Record<string, string>) {
  const { POST } = await import("./route")
  const req = new Request("http://x/api/formulario/x", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
  })
  return POST(req as never, { params: Promise.resolve({ token: TOKEN }) })
}

const respostasContato = { n: "Lucas Teste", t: "44988447212" }

beforeEach(() => {
  estadoBase()
  eventosCapi.length = 0
  vi.resetModules()
})

describe("POST /api/formulario/[token] — origem do lead que já existia", () => {
  it("passa a origem para o formulário e guarda a anterior", async () => {
    const res = await post({ respostas: respostasContato })
    expect(res.status).toBe(200)

    const lead = db.leads[0]!
    expect(lead.source).toBe("form_qualificacao")

    const meta = lead.metadata as Row
    expect(meta.form_nome).toBe("Investimento Maringá — Agosto")
    expect(meta.raw_fields).toEqual({ form_name: "LP Vind Residence" }) // nada foi perdido
    expect((meta.origem_anterior as Row).source).toBe("website")
    expect((meta.origem_anterior as Row).utm_content).toBe("LP Vind Residence")

    const troca = db.activities.find((a) => a.type === "lead_source_updated")
    expect(troca).toBeDefined()
    expect((troca!.metadata as Row).source_anterior).toBe("website")
  })

  it("link sem UTM não apaga a atribuição que já existia", async () => {
    await post({ respostas: respostasContato })
    expect(db.leads[0]!.utm_content).toBe("LP Vind Residence")
  })

  it("UTM desta visita sobrescreve a anterior", async () => {
    await post({
      respostas: respostasContato,
      utm: { utm_source: "facebook", utm_content: "Criativo Agosto" },
    })
    const lead = db.leads[0]!
    expect(lead.utm_source).toBe("facebook")
    expect(lead.utm_content).toBe("Criativo Agosto")
  })

  it("segundo preenchimento do MESMO formulário não repete a activity de origem", async () => {
    await post({ respostas: respostasContato })
    db.lead_form_responses = [] // sessão nova, mesmo lead
    await post({ respostas: respostasContato })

    expect(db.activities.filter((a) => a.type === "lead_source_updated")).toHaveLength(1)
  })

  it("lead novo continua nascendo com a origem do formulário", async () => {
    db.leads = []
    await post({ respostas: { n: "Maria Nova", t: "44999998888" } })

    const lead = db.leads[0]!
    expect(lead.source).toBe("form_qualificacao")
    expect(lead.stage_id).toBe("stage-novo") // nunca stage null (75-218)
    expect(db.activities.filter((a) => a.type === "lead_source_updated")).toHaveLength(0)
  })
})

describe("SEGURANÇA 86.11-QA-001 — o corpo não dita IP/UA do evento CAPI", () => {
  // 🔴 Esta rota é um link PÚBLICO: quem monta o corpo é o próprio visitante.
  // A Story 86-11 deu precedência a `client_ip`/`client_ua` do corpo sobre os
  // headers em `extrairSinais` — necessário lá, onde existe um proxy
  // servidor-a-servidor no meio, mas a função é compartilhada com esta rota, que
  // já estava em produção pela 86-9. A precedência virou opt-in e AQUI ela não é
  // pedida; o header é a única fonte que o visitante não escolhe.
  const EVENT_ID = "44444444-4444-4444-8444-444444444444"

  it("client_ip/client_ua forjados em `tracking` são IGNORADOS — vale o IP real da request", async () => {
    await postComHeaders(
      {
        respostas: respostasContato,
        event_ids: { lead: EVENT_ID },
        tracking: {
          visitor_id: "visitante-1",
          fbp: "fb.1.1.p",
          client_ip: "1.2.3.4",
          client_ua: "UA-forjado-pelo-visitante",
        },
      },
      { "x-forwarded-for": "187.1.2.3, 10.0.0.1", "user-agent": "Mozilla/5.0 (iPhone)" },
    )

    expect(eventosCapi).toHaveLength(1)
    const sinais = eventosCapi[0]!.sinais as Record<string, string>
    expect(sinais.clientIp).toBe("187.1.2.3")
    expect(sinais.clientUa).toBe("Mozilla/5.0 (iPhone)")
    // Os sinais legítimos do corpo continuam passando — a trava é só de IP/UA.
    expect(sinais.fbp).toBe("fb.1.1.p")
    // O valor forjado não sobrevive em canto nenhum do que vai à CAPI.
    expect(JSON.stringify(eventosCapi)).not.toContain("1.2.3.4")
    expect(JSON.stringify(eventosCapi)).not.toContain("UA-forjado-pelo-visitante")
  })

  it("NÃO-REGRESSÃO 86-9: sem nada forjado, IP/UA seguem vindo dos headers", async () => {
    await postComHeaders(
      {
        respostas: respostasContato,
        event_ids: { lead: EVENT_ID },
        tracking: { visitor_id: "visitante-1" },
      },
      { "x-forwarded-for": "187.9.9.9, 10.0.0.1", "user-agent": "Mozilla/5.0" },
    )

    const sinais = eventosCapi[0]!.sinais as Record<string, string>
    expect(sinais.clientIp).toBe("187.9.9.9")
    expect(sinais.clientUa).toBe("Mozilla/5.0")
  })
})
