/**
 * Story 75-66 — Coalescing anti-flood de notifyClientes.
 *
 * Cobre o curto-circuito do dispatcher:
 *  1. claim_obra_notif retorna false (coalescido) → NÃO consulta usuários nem envia nada
 *  2. PORTAL_NOTIF_PAUSED=1 → retorna antes do claim (pausa tem prioridade)
 *  3. claim retorna true → segue para as queries (não curto-circuita no claim)
 *  4. RPC falha → fallback seguro: NÃO bloqueia, segue para as queries
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// --- mocks dos canais de envio (não devem ser chamados nos casos de pausa/coalescing) ---
const sendEmail = vi.fn((...a: unknown[]) => { void a; return Promise.resolve() })
const sendPushToUser = vi.fn((...a: unknown[]) => { void a; return Promise.resolve() })
vi.mock("@web/lib/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }))
vi.mock("@web/lib/server/push-service", () => ({
  sendPushToUser: (...a: unknown[]) => sendPushToUser(...a),
}))
vi.mock("@web/lib/whatsapp/log-send", () => ({ logWhatsappSend: vi.fn() }))

// --- mock do admin client: rpc configurável + from rastreável (impl. sobrescrevível) ---
let rpcResult: { data: unknown; error: unknown } = { data: true, error: null }
const throwingFrom = () => {
  throw new Error("admin.from não deveria ser chamado neste caso (curto-circuito esperado)")
}
let fromImpl: (table: string) => unknown = throwingFrom
const fromSpy = vi.fn((table: string) => fromImpl(table))
const rpcSpy = vi.fn(async () => rpcResult)
vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: rpcSpy, from: fromSpy }),
}))

import { notifyClientes, notifyBoletoLembrete, type BoletoLembreteMarco } from "./notificacoes"

beforeEach(() => {
  sendEmail.mockClear()
  sendPushToUser.mockClear()
  fromSpy.mockClear()
  rpcSpy.mockClear()
  fromImpl = throwingFrom
  delete process.env.PORTAL_NOTIF_PAUSED
  rpcResult = { data: true, error: null }
})
afterEach(() => {
  delete process.env.PORTAL_NOTIF_PAUSED
})

describe("notifyClientes — coalescing (Story 75-66)", () => {
  it("AC1: claim=false (coalescido) → não consulta usuários nem envia", async () => {
    rpcResult = { data: null, error: null } // não reivindicou o slot
    await notifyClientes("obra-1", "nova_foto", "Vind Residence")
    expect(rpcSpy).toHaveBeenCalledOnce()
    expect(fromSpy).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
    expect(sendPushToUser).not.toHaveBeenCalled()
  })

  it("AC4: PORTAL_NOTIF_PAUSED=1 → retorna antes do claim (pausa tem prioridade)", async () => {
    process.env.PORTAL_NOTIF_PAUSED = "1"
    await notifyClientes("obra-1", "nova_foto", "Vind Residence")
    expect(rpcSpy).not.toHaveBeenCalled()
    expect(fromSpy).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("claim=true → NÃO curto-circuita no claim (segue para as queries)", async () => {
    rpcResult = { data: true, error: null }
    // from lança de propósito → prova que o fluxo PASSOU do claim e tentou consultar usuários.
    await notifyClientes("obra-1", "nova_foto", "Vind Residence")
    expect(rpcSpy).toHaveBeenCalledOnce()
    expect(fromSpy).toHaveBeenCalled()
  })

  it("fallback: claim com erro → não bloqueia, segue para as queries", async () => {
    rpcResult = { data: null, error: { message: "function does not exist" } }
    await notifyClientes("obra-1", "nova_foto", "Vind Residence")
    expect(fromSpy).toHaveBeenCalled() // seguiu (degradou seguro)
  })

  // Story 75-77 — agrupamento de tipos + janela ampliada
  it("agrupamento: foto/progresso usam 'atualizacao_obra'; documento tem slot próprio 'novo_documento' (Story 75-79)", async () => {
    rpcResult = { data: null, error: null } // coalescido → curto-circuita, suficiente p/ inspecionar o claim
    const esperado = {
      nova_foto: "atualizacao_obra",
      progresso: "atualizacao_obra",
      novo_documento: "novo_documento",
    } as const
    for (const [evento, grupo] of Object.entries(esperado)) {
      rpcSpy.mockClear()
      await notifyClientes("obra-1", evento as keyof typeof esperado, "Vind Residence")
      expect(rpcSpy).toHaveBeenCalledWith(
        "claim_obra_notif",
        expect.objectContaining({ p_obra_id: "obra-1", p_evento: grupo })
      )
    }
  })

  it("nova_mensagem: nunca coalesce → pula o claim e segue direto para as queries", async () => {
    // from lança de propósito → prova que o fluxo seguiu sem passar pelo claim.
    await notifyClientes("obra-1", "nova_mensagem", "Vind Residence")
    expect(rpcSpy).not.toHaveBeenCalled()
    expect(fromSpy).toHaveBeenCalled()
  })
})

// Story 75-141 — notifyBoletoLembrete: pausa, toggles por canal, template por marco,
// e falha graciosa do WhatsApp (não lança, não impede e-mail/push).
describe("notifyBoletoLembrete (Story 75-141)", () => {
  const fetchMock = vi.fn()
  // Prefs por canal (linha ausente → DEFAULT_PREFS; aqui explicitamos p/ os toggles).
  let prefRow: Record<string, unknown> | null

  // `from` funcional: obra_notificacao_prefs (.maybeSingle) + whatsapp_config (.single).
  function workingFrom() {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => ({ data: prefRow, error: null }),
      single: async () => ({ data: { phone_number_id: "PN", access_token: "TK" }, error: null }),
    }
    return builder
  }

  const flush = () => new Promise((r) => setTimeout(r, 0))

  const params = (marco: BoletoLembreteMarco) => ({
    orgId: "org-1",
    userId: "user-1",
    nome: "Albert",
    email: "a@ex.com",
    phone: "5544999999999",
    obraId: "obra-1",
    obraName: "Yarden",
    vencimento: "10/07/2026",
    marco,
  })

  beforeEach(() => {
    fromImpl = workingFrom
    prefRow = { email_enabled: true, whatsapp_enabled: true, push_enabled: true }
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: "wamid.1" }] }),
      text: async () => "",
    })
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function templateEnviado(): string | undefined {
    const call = fetchMock.mock.calls[0]
    if (!call) return undefined
    const body = JSON.parse((call[1] as { body: string }).body)
    return body.template?.name
  }

  it("AC7: PORTAL_NOTIF_PAUSED → nada é enviado", async () => {
    process.env.PORTAL_NOTIF_PAUSED = "1"
    await notifyBoletoLembrete(params("venc_hoje"))
    await flush()
    expect(sendEmail).not.toHaveBeenCalled()
    expect(sendPushToUser).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("AC7: whatsapp_enabled=false → omite WhatsApp; e-mail e push seguem", async () => {
    prefRow = { email_enabled: true, whatsapp_enabled: false, push_enabled: true }
    await notifyBoletoLembrete(params("venc_hoje"))
    await flush()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(sendPushToUser).toHaveBeenCalledTimes(1)
  })

  it("AC7: email_enabled=false → omite e-mail; push_enabled=false → omite push", async () => {
    prefRow = { email_enabled: false, whatsapp_enabled: true, push_enabled: false }
    await notifyBoletoLembrete(params("atraso5"))
    await flush()
    expect(sendEmail).not.toHaveBeenCalled()
    expect(sendPushToUser).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("template por marco: venc_hoje → boleto_vence_hoje; atraso5/atraso15 → boleto_em_atraso", async () => {
    await notifyBoletoLembrete(params("venc_hoje"))
    await flush()
    expect(templateEnviado()).toBe("boleto_vence_hoje")

    fetchMock.mockClear()
    await notifyBoletoLembrete(params("atraso5"))
    await flush()
    expect(templateEnviado()).toBe("boleto_em_atraso")

    fetchMock.mockClear()
    await notifyBoletoLembrete(params("atraso15"))
    await flush()
    expect(templateEnviado()).toBe("boleto_em_atraso")
  })

  it("AC8: falha do template WhatsApp (Graph API erro) não lança e não impede e-mail/push", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({}),
      text: async () => JSON.stringify({ error: { code: 132001 } }),
    })
    await expect(notifyBoletoLembrete(params("venc_hoje"))).resolves.toBeUndefined()
    await flush()
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(sendPushToUser).toHaveBeenCalledTimes(1)
  })
})
