/**
 * Story 86-11 — os ADAPTs em `form-capi.ts`, o módulo que a Story 86-9 já tem em
 * produção.
 *
 * Cada teste aqui trava um comportamento que, se revertido por engano, degradaria
 * a atribuição EM SILÊNCIO: os eventos continuariam chegando ao Meta, nenhum erro
 * apareceria, e só semanas depois a nota de correspondência cairia no painel.
 * Metade dos casos é não-regressão da 86-9 — o chamador `/formulario/[token]`
 * não pode mudar de comportamento por causa desta story.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("server-only", () => ({}))

/** Batches que chegariam à Conversions API. Um item = uma chamada HTTP. */
const batches: { eventos: Record<string, unknown>[]; opcoes?: { testEventCode?: string } }[] = []
let resultadoEnvio = { success: true, eventsReceived: 1 }

vi.mock("@trifold/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@trifold/shared")>()),
  sendCapiEvents: async (
    eventos: Record<string, unknown>[],
    opcoes?: { testEventCode?: string },
  ) => {
    batches.push({ eventos, opcoes })
    return resultadoEnvio
  },
}))

const {
  extrairSinais,
  enviarEventoFormulario,
  enviarEventosFormulario,
  comMetaAd,
} = await import("./form-capi")

function requestCom(headers: Record<string, string>) {
  return new Request("https://crm.trifold.eng.br/api/webhooks/landing-page", {
    method: "POST",
    headers,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any
}

const SINAIS_BASE = { pageUrl: "https://trifold.eng.br/vindresidence/" }

beforeEach(() => {
  batches.length = 0
  resultadoEnvio = { success: true, eventsReceived: 1 }
  delete process.env.META_CAPI_TEST_EVENT_CODE
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("AC7 — IP/UA do CORPO vencem os da request (só com opt-in)", () => {
  // 🔴 O caso que motiva este bloco: entre o browser e o CRM existe o proxy
  // `api/lead.js`, hospedado em outro projeto Vercel. O `x-forwarded-for` que o
  // CRM enxerga é o do datacenter, não o do visitante. Reusar `extrairSinais`
  // sem esta precedência mandaria TODO evento desta landing com o IP errado —
  // sem erro, sem log, com aparência de sucesso no Events Manager (o análogo
  // exato do defeito 86.9-QA-001).
  const HEADERS_DO_PROXY = {
    "x-forwarded-for": "76.76.21.21, 10.0.0.1",
    "user-agent": "node-fetch/1.0 (+https://vercel.com)",
  }

  it("usa o IP e o UA do visitante que o proxy repassou no corpo", () => {
    const sinais = extrairSinais(
      requestCom(HEADERS_DO_PROXY),
      { client_ip: "187.1.2.3", client_ua: "Mozilla/5.0 (iPhone)" },
      { confiarEmClientIpDoCorpo: true },
    )

    expect(sinais.clientIp).toBe("187.1.2.3")
    expect(sinais.clientUa).toBe("Mozilla/5.0 (iPhone)")
    // O IP do datacenter não pode sobreviver em lugar nenhum do resultado.
    expect(JSON.stringify(sinais)).not.toContain("76.76.21.21")
  })

  it("ignora string vazia no corpo e cai no header (corpo malformado)", () => {
    const sinais = extrairSinais(
      requestCom(HEADERS_DO_PROXY),
      { client_ip: "   ", client_ua: "" },
      { confiarEmClientIpDoCorpo: true },
    )
    expect(sinais.clientIp).toBe("76.76.21.21")
    expect(sinais.clientUa).toBe("node-fetch/1.0 (+https://vercel.com)")
  })

  it("SEGURANÇA 86.11-QA-001: sem o opt-in, IP/UA do corpo são IGNORADOS", () => {
    // O default é o comportamento anterior à 86-11: o corpo não tem como
    // influenciar IP/UA. É o que protege as rotas chamadas direto pelo browser,
    // onde quem monta o corpo é o próprio visitante.
    const sinais = extrairSinais(
      requestCom({ "x-forwarded-for": "187.9.9.9, 10.0.0.1", "user-agent": "Mozilla/5.0" }),
      { client_ip: "1.2.3.4", client_ua: "forjado" },
    )

    expect(sinais.clientIp).toBe("187.9.9.9")
    expect(sinais.clientUa).toBe("Mozilla/5.0")
    expect(JSON.stringify(sinais)).not.toContain("1.2.3.4")
    expect(JSON.stringify(sinais)).not.toContain("forjado")
  })

  it("SEGURANÇA 86.11-QA-001: `confiarEmClientIpDoCorpo: false` explícito também ignora", () => {
    const sinais = extrairSinais(
      requestCom({ "x-forwarded-for": "187.9.9.9", "user-agent": "Mozilla/5.0" }),
      { client_ip: "1.2.3.4", client_ua: "forjado" },
      { confiarEmClientIpDoCorpo: false },
    )
    expect(sinais.clientIp).toBe("187.9.9.9")
    expect(sinais.clientUa).toBe("Mozilla/5.0")
  })

  it("NÃO-REGRESSÃO 86-9: sem os campos no corpo, segue lendo dos headers", () => {
    // `/formulario/[token]` é chamado direto pelo browser e nunca envia
    // client_ip/client_ua — ali o header É o IP real do visitante.
    const sinais = extrairSinais(
      requestCom({ "x-forwarded-for": "187.9.9.9, 10.0.0.1", "user-agent": "Mozilla/5.0" }),
      { visitor_id: "v-1", fbp: "fb.1.1.p" },
    )
    expect(sinais.clientIp).toBe("187.9.9.9")
    expect(sinais.clientUa).toBe("Mozilla/5.0")
    expect(sinais.fbp).toBe("fb.1.1.p")
  })

  it("NÃO-REGRESSÃO 86-9: segue derivando fbc do fbclid quando o cookie falta", () => {
    const sinais = extrairSinais(requestCom({}), { fbclid: "IwAR123" })
    expect(sinais.fbc).toMatch(/^fb\.1\.\d+\.IwAR123$/)
  })
})

describe("AC6 — batch de N eventos em UMA chamada", () => {
  it("envia Lead + CompleteRegistration num único POST, com ids distintos", async () => {
    const ok = await enviarEventosFormulario([
      {
        evento: "Lead",
        eventId: "id-lead",
        sinais: SINAIS_BASE,
        lead: { leadId: "lead-1" },
        contentName: "Landing Vind Residence",
        urlPadrao: "https://trifold.eng.br/vindresidence/",
      },
      {
        evento: "CompleteRegistration",
        eventId: "id-cadastro",
        sinais: SINAIS_BASE,
        lead: { leadId: "lead-1" },
        contentName: "Landing Vind Residence",
        urlPadrao: "https://trifold.eng.br/vindresidence/",
      },
    ])

    expect(ok).toBe(true)
    // Dois POSTs seriam duas chances de falha de rede para um único fato.
    expect(batches).toHaveLength(1)
    expect(batches[0]?.eventos).toHaveLength(2)
    expect(batches[0]?.eventos.map((e) => e.event_name)).toEqual([
      "Lead",
      "CompleteRegistration",
    ])
    expect(batches[0]?.eventos.map((e) => e.event_id)).toEqual(["id-lead", "id-cadastro"])
  })

  it("não chama a CAPI com lista vazia", async () => {
    expect(await enviarEventosFormulario([])).toBe(true)
    expect(batches).toHaveLength(0)
  })

  it("NÃO-REGRESSÃO 86-9: enviarEventoFormulario segue mandando 1 evento", async () => {
    await enviarEventoFormulario({
      evento: "ViewContent",
      eventId: "e-1",
      sinais: SINAIS_BASE,
      contentName: "Investimento Maringá",
      urlPadrao: "https://crm.trifold.eng.br/formulario/x",
    })
    expect(batches).toHaveLength(1)
    expect(batches[0]?.eventos).toHaveLength(1)
  })
})

describe("AC6 — contentCategory repassado ao builder", () => {
  it("usa a categoria pedida pelo chamador", async () => {
    await enviarEventoFormulario({
      evento: "Lead",
      eventId: "e-1",
      sinais: SINAIS_BASE,
      contentName: "Landing Vind Residence",
      contentCategory: "landing_vind_residence",
      urlPadrao: "https://trifold.eng.br/vindresidence/",
    })
    const custom = batches[0]?.eventos[0]?.custom_data as Record<string, unknown>
    expect(custom.content_category).toBe("landing_vind_residence")
  })

  it("NÃO-REGRESSÃO 86-9: sem categoria, continua form_qualificacao", async () => {
    await enviarEventoFormulario({
      evento: "Lead",
      eventId: "e-1",
      sinais: SINAIS_BASE,
      contentName: "Investimento Maringá",
      urlPadrao: "https://crm.trifold.eng.br/formulario/x",
    })
    const custom = batches[0]?.eventos[0]?.custom_data as Record<string, unknown>
    expect(custom.content_category).toBe("form_qualificacao")
  })
})

describe("AC6 — derivação de UF opcional", () => {
  const lead = { leadId: "lead-1", telefone: "+5544997344650" }

  it("NÃO-REGRESSÃO 86-9: por default deriva st a partir do DDD", async () => {
    await enviarEventoFormulario({
      evento: "Lead",
      eventId: "e-1",
      sinais: SINAIS_BASE,
      lead,
      contentName: "Investimento Maringá",
      urlPadrao: "https://crm.trifold.eng.br/formulario/x",
    })
    const userData = batches[0]?.eventos[0]?.user_data as Record<string, unknown>
    expect(userData.st).toBeDefined()
  })

  it("omite st quando o chamador desliga (st/ct fora do escopo da 86-11)", async () => {
    await enviarEventoFormulario({
      evento: "Lead",
      eventId: "e-1",
      sinais: SINAIS_BASE,
      lead,
      derivarUf: false,
      contentName: "Landing Vind Residence",
      urlPadrao: "https://trifold.eng.br/vindresidence/",
    })
    const userData = batches[0]?.eventos[0]?.user_data as Record<string, unknown>
    expect(userData.st).toBeUndefined()
    // O telefone segue hasheado em `ph` — desligar a UF não desliga o match.
    expect(userData.ph).toBeDefined()
  })
})

describe("AC9/AC10 — segredo, PII e degradação", () => {
  it("repassa META_CAPI_TEST_EVENT_CODE quando configurado (AC11)", async () => {
    process.env.META_CAPI_TEST_EVENT_CODE = "TEST123"
    await enviarEventoFormulario({
      evento: "Lead",
      eventId: "e-1",
      sinais: SINAIS_BASE,
      contentName: "x",
      urlPadrao: "https://x/y",
    })
    expect(batches[0]?.opcoes).toEqual({ testEventCode: "TEST123" })
  })

  it("mantém fbc/fbp/IP/UA em texto puro e hasheia a PII", async () => {
    await enviarEventosFormulario([
      {
        evento: "Lead",
        eventId: "e-1",
        sinais: {
          ...SINAIS_BASE,
          visitorId: "visitante-1",
          fbc: "fb.1.1700000000000.abc",
          fbp: "fb.1.1700000000000.987",
          clientIp: "187.1.2.3",
          clientUa: "Mozilla/5.0 (iPhone)",
        },
        lead: {
          leadId: "lead-1",
          nome: "Maria Souza",
          email: "maria@exemplo.com",
          telefone: "+5544997344650",
        },
        derivarUf: false,
        contentName: "Landing Vind Residence",
        contentCategory: "landing_vind_residence",
        urlPadrao: "https://trifold.eng.br/vindresidence/",
      },
    ])

    const userData = batches[0]?.eventos[0]?.user_data as Record<string, unknown>
    expect(userData.fbc).toBe("fb.1.1700000000000.abc")
    expect(userData.fbp).toBe("fb.1.1700000000000.987")
    expect(userData.client_ip_address).toBe("187.1.2.3")
    expect(userData.client_user_agent).toBe("Mozilla/5.0 (iPhone)")
    // Nada legível: nome, e-mail e telefone só existem hasheados.
    const serializado = JSON.stringify(userData)
    expect(serializado).not.toContain("Maria")
    expect(serializado).not.toContain("exemplo.com")
    expect(serializado).not.toContain("997344650")
    // `external_id` costura visitor_id + leadId.
    expect(userData.external_id).toHaveLength(2)
  })

  it("nunca lança e não vaza user_data no log quando a CAPI falha", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {})
    resultadoEnvio = { success: false, eventsReceived: 0 } as never

    const ok = await enviarEventosFormulario([
      {
        evento: "Lead",
        eventId: "e-1",
        sinais: { ...SINAIS_BASE, clientIp: "187.1.2.3", fbp: "fb.1.1.p" },
        lead: { leadId: "lead-1", nome: "Maria Souza", email: "maria@exemplo.com" },
        contentName: "x",
        urlPadrao: "https://x/y",
      },
    ])

    expect(ok).toBe(false)
    const logado = erro.mock.calls.map((c) => JSON.stringify(c)).join(" ")
    for (const segredo of ["Maria", "exemplo.com", "187.1.2.3", "fb.1.1.p"]) {
      expect(logado).not.toContain(segredo)
    }
  })
})

describe("comMetaAd — reusado sem alteração pela 86-11 (AC6)", () => {
  it("preserva as demais chaves do JSONB e escreve só sob meta_ad", () => {
    const metadata = comMetaAd(
      { landing_page: "vind-residence", raw_fields: { nome: "Maria" } },
      {
        fbc: "fb.1.1.c",
        fbp: "fb.1.1.p",
        fbclid: "IwAR1",
        clientIp: "187.1.2.3",
        clientUa: "Mozilla/5.0",
        visitorId: "visitante-1",
      },
    )

    expect(metadata.landing_page).toBe("vind-residence")
    expect(metadata.raw_fields).toEqual({ nome: "Maria" })
    // Formato exato da Story 86-9 AC5 — é o que o cron "Visitou" (86-2/86-4) lê.
    expect(metadata.meta_ad).toMatchObject({
      fbc: "fb.1.1.c",
      fbp: "fb.1.1.p",
      fbclid: "IwAR1",
      client_ip: "187.1.2.3",
      client_ua: "Mozilla/5.0",
      visitor_id: "visitante-1",
    })
    expect((metadata.meta_ad as Record<string, unknown>).captured_at).toBeTypeOf("string")
  })
})
