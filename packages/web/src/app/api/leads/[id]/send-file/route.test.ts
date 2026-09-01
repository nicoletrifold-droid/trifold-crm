/**
 * `send-file` — as duas coisas que a rota de TEXTO já fazia e a de MÍDIA não.
 *
 * Medido em produção em 01/09/2026 (conversa `121ae078-86ed-4504-9b85-72252fd0213a`):
 * o corretor mandou áudio às 15:16 e a Nicole continuou respondendo às 15:20 e 15:21.
 * Só parou às 15:22, e pela trava de loop da Story 87-20 — não pelo handoff. Um
 * corretor que atende por áudio nunca desligava a IA. No mesmo registro, as três
 * mensagens de áudio ficaram sem `metadata.sent_by`, então as telas de conversa
 * rotulavam a bolha com o literal "Equipe" em vez do nome de quem falou.
 *
 * Os dois testes negativos no fim são o que impede a correção de ser desfeita em
 * silêncio: eles reprovam se o `select` parar de projetar `is_ai_active` (o defeito
 * gêmeo — `undefined` é falsy, o `if` não entra e o handoff vira no-op sem erro).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

vi.mock("@web/lib/permissions", () => ({ can: async () => true }))

vi.mock("@web/lib/api-auth", () => ({
  requireAuth: async () => ({
    supabase: null,
    appUser: { id: "u-corretor", org_id: "org-1", role: "admin", name: "Marcos" },
  }),
}))

vi.mock("@web/lib/broker/dispatch-broker-message", () => ({
  resolveChannel: () => "whatsapp",
  isWithinWhatsAppWindow: () => true,
  WHATSAPP_WINDOW_MS: 24 * 3600 * 1000,
}))

/** Estado do fake, reconfigurado por teste. */
let conversationRow: Record<string, unknown> | null
/** UPDATEs aplicados em `conversations` — é aqui que o handoff aparece (ou não). */
let conversationUpdates: Record<string, unknown>[]
/** Payload do INSERT em `messages` — é aqui que `metadata.sent_by` aparece (ou não). */
let insertedMessage: Record<string, unknown> | null

const fakeClient = () => ({
  storage: {
    from: () => ({
      upload: async () => ({ error: null }),
      getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.test/${p}` } }),
    }),
  },
  from: (table: string) => {
    const b: Record<string, unknown> & { _update?: Record<string, unknown> } = {
      select: () => b,
      eq: () => b,
      order: () => b,
      insert: (payload: Record<string, unknown>) => {
        if (table === "messages") insertedMessage = payload
        return b
      },
      update: (payload: Record<string, unknown>) => {
        b._update = payload
        return b
      },
      single: async () => ({
        data:
          table === "leads"
            ? { id: "L1", phone: "5544999999999", assigned_broker_id: "u-corretor" }
            : table === "messages"
              ? { id: "M1" }
              : table === "conversations"
                ? conversationRow
                : null,
        error: null,
      }),
      maybeSingle: async () => ({
        data:
          table === "conversations"
            ? conversationRow
            : table === "whatsapp_config"
              ? { phone_number_id: "PN1", access_token: "TK" }
              : null,
        error: null,
      }),
      then: (resolve: (v: { data: null; error: null }) => unknown) => {
        if (b._update && table === "conversations") conversationUpdates.push(b._update)
        return resolve({ data: null, error: null })
      },
    }
    return b
  },
})

vi.mock("@web/lib/supabase/admin", () => ({ createAdminClient: () => fakeClient() }))

const { POST } = await import("./route")

/** Requisição multipart com um áudio, que é o caminho do incidente real. */
function requisicaoComAudio() {
  const form = new FormData()
  form.append("file", new File([new Uint8Array([1, 2, 3])], "audio.ogg", { type: "audio/ogg" }))
  return {
    formData: async () => form,
  } as unknown as Parameters<typeof POST>[0]
}

const params = { params: Promise.resolve({ id: "L1" }) }

beforeEach(() => {
  conversationUpdates = []
  insertedMessage = null
  conversationRow = { id: "C1", last_message_at: new Date().toISOString(), is_ai_active: true }
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 200 }))
  )
})

describe("send-file — handoff ao corretor responder (Story 63-13, AC1)", () => {
  it("desliga a Nicole quando ela ainda estava ativa — o defeito de 01/09", async () => {
    const res = await POST(requisicaoComAudio(), params)
    expect(res.status).toBe(200)

    expect(conversationUpdates).toHaveLength(1)
    expect(conversationUpdates[0]).toMatchObject({
      is_ai_active: false,
      handoff_reason: "broker_reply",
    })
    expect(typeof conversationUpdates[0]!.handoff_at).toBe("string")
  })

  it("é idempotente: com a Nicole já desligada NÃO faz UPDATE nenhum", async () => {
    conversationRow = { id: "C1", last_message_at: new Date().toISOString(), is_ai_active: false }

    await POST(requisicaoComAudio(), params)

    // Sem o guard, cada áudio de um corretor que já assumiu reescreveria `handoff_at`
    // e o relógio do handoff nunca marcaria quando ele realmente entrou.
    expect(conversationUpdates).toHaveLength(0)
  })

  it("`is_ai_active` AUSENTE na linha não pode ser lido como 'já desligada'", async () => {
    // Este é o defeito gêmeo, e o motivo de o `select` ter de projetar a coluna: se ela
    // não vier, `undefined` é falsy, o `if` não entra e o handoff some SEM erro nenhum.
    // O teste falha se alguém remover `is_ai_active` do `.select()` — e falhar aqui é
    // muito melhor que descobrir de novo em produção.
    conversationRow = { id: "C1", last_message_at: new Date().toISOString() }

    await POST(requisicaoComAudio(), params)

    expect(conversationUpdates).toHaveLength(0) // documenta o comportamento…
    // …e esta é a asserção que reprova a regressão de verdade:
    const fonte = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("./route.ts", import.meta.url), "utf8")
    )
    expect(fonte).toMatch(/\.select\("id, last_message_at, is_ai_active"\)/)
  })
})

describe("send-file — autoria da mensagem (Story 75-165)", () => {
  it("grava `metadata.sent_by` com quem enviou, senão a bolha sai como 'Equipe'", async () => {
    await POST(requisicaoComAudio(), params)

    expect(insertedMessage).not.toBeNull()
    expect(insertedMessage!.role).toBe("broker")
    expect(insertedMessage!.metadata).toMatchObject({
      sent_by: "u-corretor",
      source: "broker_upload",
      media_type: "audio",
    })
  })
})
