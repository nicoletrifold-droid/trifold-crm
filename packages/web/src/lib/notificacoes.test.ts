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
const sendEmail = vi.fn()
const sendPushToUser = vi.fn()
vi.mock("@web/lib/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }))
vi.mock("@web/lib/server/push-service", () => ({
  sendPushToUser: (...a: unknown[]) => sendPushToUser(...a),
}))
vi.mock("@web/lib/whatsapp/log-send", () => ({ logWhatsappSend: vi.fn() }))

// --- mock do admin client: rpc configurável + from rastreável ---
let rpcResult: { data: unknown; error: unknown } = { data: true, error: null }
const fromSpy = vi.fn(() => {
  throw new Error("admin.from não deveria ser chamado neste caso (curto-circuito esperado)")
})
const rpcSpy = vi.fn(async () => rpcResult)
vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: rpcSpy, from: fromSpy }),
}))

import { notifyClientes } from "./notificacoes"

beforeEach(() => {
  sendEmail.mockClear()
  sendPushToUser.mockClear()
  fromSpy.mockClear()
  rpcSpy.mockClear()
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
