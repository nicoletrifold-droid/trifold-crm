/**
 * Story 75-291 — o reenvio passa a aceitar a mensagem de TRANSIÇÃO (51-2,
 * `role='assistant'`), e só ela: follow-up automático da Nicole continua 409.
 *
 * O ponto delicado coberto aqui: a transição sai SEM assinatura no envio
 * original, então o reenvio não pode assiná-la — o lead receberia um texto
 * diferente do que o CRM mostra na conversa.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

// 75-310: gate = can("conversas.enviar_qualquer") — decide pelo SEED, variando pelo role.
vi.mock("@web/lib/permissions", async () => {
  const { CAPABILITY_SEED } = await vi.importActual<
    typeof import("@web/lib/capabilities")
  >("@web/lib/capabilities")
  return {
    can: async (_u: string, _o: string, capability: keyof typeof CAPABILITY_SEED) => {
      const r = "admin" // o teste usa sempre a conta admin do requireAuth mockado
      return r === "admin" || (CAPABILITY_SEED[capability] as readonly string[]).includes(r)
    },
  }
})
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server")
  return { ...actual, after: (fn: () => unknown) => void fn }
})

vi.mock("@web/lib/api-auth", () => ({
  requireAuth: async () => ({
    supabase: null,
    appUser: { id: "u-admin", org_id: "org-1", role: "admin", name: "Marcos" },
  }),
}))

const dispatchSpy = vi.fn(async (args: { message: string }) => {
  void args // o argumento existe para tipar `dispatchSpy.mock.calls[0][0].message`
  return { sent: true, error: null }
})
vi.mock("@web/lib/broker/dispatch-broker-message", () => ({
  dispatchBrokerMessage: (args: { message: string }) => dispatchSpy(args),
  resolveChannel: () => "whatsapp",
}))
vi.mock("@web/lib/broker/message-signature", () => ({
  buildSignedMessage: (assinante: string, texto: string) => `${texto}\n— ${assinante}`,
}))
vi.mock("@web/lib/meta/alert-credencial-morta", () => ({
  alertCredencialMorta: async () => null,
  isCredencialMorta: () => false,
}))

let messageRow: Record<string, unknown> | null
const updates: Record<string, unknown>[] = []

const fakeClient = () => ({
  from: (table: string) => {
    const b: Record<string, unknown> & { _update?: Record<string, unknown> } = {
      select: () => b,
      eq: () => b,
      order: () => b,
      update: (p: Record<string, unknown>) => {
        b._update = p
        return b
      },
      single: async () => ({
        data: table === "leads" ? { id: "L1", phone: "5544999", assigned_broker_id: "u-x" } : null,
        error: null,
      }),
      maybeSingle: async () => ({
        data:
          table === "conversations"
            ? { id: "C1", last_message_at: "2026-08-11T10:00:00Z" }
            : table === "messages"
              ? messageRow
              : table === "whatsapp_config"
                ? { phone_number_id: "PN1", access_token: "TK" }
                : null,
        error: null,
      }),
      then: (resolve: (v: { data: null; error: null }) => unknown) => {
        if (b._update) updates.push(b._update)
        return resolve({ data: null, error: null })
      },
    }
    return b
  },
})
vi.mock("@web/lib/supabase/admin", () => ({ createAdminClient: () => fakeClient() }))

import { POST } from "./route"

function call() {
  return POST(new Request("https://x", { method: "POST" }) as never, {
    params: Promise.resolve({ id: "L1", messageId: "M1" }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  updates.length = 0
  dispatchSpy.mockImplementation(async () => ({ sent: true, error: null }))
})

describe("POST resend — quem pode ser reenviado (75-291)", () => {
  it("transição que falhou é reenviada, e SEM assinatura de corretor", async () => {
    messageRow = {
      id: "M1",
      role: "assistant",
      content: "Oi Sueli! A partir de agora quem fala com você é o Odair.",
      metadata: { is_transition: true, send_error: "HTTP_401", broker_id: "u-x" },
      conversation_id: "C1",
    }
    const res = await call()
    expect(res.status).toBe(200)
    expect(dispatchSpy).toHaveBeenCalledTimes(1)
    // texto ORIGINAL, sem "— Nome" pendurado
    expect(dispatchSpy.mock.calls[0]![0].message).toBe(messageRow.content)
    // sucesso limpa o send_error (é o que faz a bolha voltar ao normal)
    expect(updates.at(-1)).toBeDefined()
    expect((updates.at(-1)!.metadata as Record<string, unknown>).send_error).toBeUndefined()
  })

  it("mensagem do corretor continua sendo assinada (75-289 intacta)", async () => {
    messageRow = {
      id: "M1",
      role: "broker",
      content: "Bom dia!",
      metadata: { send_error: "HTTP_401", signed_as: "Odair" },
      conversation_id: "C1",
    }
    expect((await call()).status).toBe(200)
    expect(dispatchSpy.mock.calls[0]![0].message).toBe("Bom dia!\n— Odair")
  })

  it("follow-up automático da Nicole NÃO é reenviável → 409", async () => {
    messageRow = {
      id: "M1",
      role: "assistant",
      content: "Passando para saber o que achou da visita!",
      metadata: { source: "followup_cron", sent: false },
      conversation_id: "C1",
    }
    const res = await call()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe("NOT_RESENDABLE")
    expect(dispatchSpy).not.toHaveBeenCalled()
  })

  it("transição SEM falha não é reenviável → 409 (não existe reenviar o que chegou)", async () => {
    messageRow = {
      id: "M1",
      role: "assistant",
      content: "oi",
      metadata: { is_transition: true, sent_via: "whatsapp" },
      conversation_id: "C1",
    }
    expect((await call()).status).toBe(409)
    expect(dispatchSpy).not.toHaveBeenCalled()
  })
})
