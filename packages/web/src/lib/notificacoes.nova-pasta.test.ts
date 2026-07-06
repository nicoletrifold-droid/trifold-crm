/**
 * Story 75-146 — Graceful fallback da notificação de nova pasta (auto-cadastro).
 *
 * O caminho de maior risco (flag do @po): o template `nova_pasta_gestor` está PENDING na
 * Meta, então a Graph API falha. Isto NÃO pode derrubar nada — notifyNovaPastaGestor
 * precisa resolver sem lançar mesmo quando o fetch do WhatsApp falha e o e-mail não sai.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const sendEmailMock = vi.fn().mockResolvedValue({ id: null, error: "no key" })
vi.mock("@web/lib/email", () => ({
  sendEmail: (...a: unknown[]) => sendEmailMock(...a),
}))

// Admin mock: gestores (users) + whatsapp_config + log de envio.
vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "users") {
        const b: Record<string, unknown> = {
          select: () => b,
          eq: () => b,
          // .in() encerra a query (awaited direto).
          in: () => Promise.resolve({
            data: [{ id: "g1", name: "Gestora", email: "g@trifold.eng.br", phone: "5511999" }],
            error: null,
          }),
        }
        return b
      }
      if (table === "whatsapp_config") {
        const b: Record<string, unknown> = {
          select: () => b,
          eq: () => b,
          single: async () => ({ data: { phone_number_id: "pn", access_token: "tok" }, error: null }),
        }
        return b
      }
      // whatsapp_send_log.insert(...) — awaited direto.
      const b: Record<string, unknown> = { insert: () => Promise.resolve({ data: null, error: null }) }
      return b
    },
  }),
}))

import { notifyNovaPastaGestor } from "./notificacoes"

beforeEach(() => {
  sendEmailMock.mockClear()
  // Template PENDING → Graph API falha.
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: false,
    status: 500,
    text: async () => "template nova_pasta_gestor is PENDING",
  })) as unknown as typeof fetch)
})

describe("notifyNovaPastaGestor — graceful fallback", () => {
  it("resolve sem lançar mesmo com WhatsApp falhando (template PENDING)", async () => {
    await expect(
      notifyNovaPastaGestor({
        orgId: "org-1",
        pastaId: "pasta-1",
        compradorNome: "Fulano",
        imobiliaria: "Imob X",
      })
    ).resolves.toBeUndefined()
    // O e-mail ao gestor ainda é tentado (o outro canal não é bloqueado pelo WhatsApp).
    expect(sendEmailMock).toHaveBeenCalledOnce()
  })
})
