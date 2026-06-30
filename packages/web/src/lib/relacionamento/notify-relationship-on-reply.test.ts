/**
 * Story 75-86 — push ao(s) gerente(s) de relacionamento quando o cliente responde.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const pushSpy = vi.fn(async (..._a: unknown[]) => { void _a })
vi.mock("@web/lib/server/push-service", () => ({ sendPushToUser: (...a: unknown[]) => pushSpy(...a) }))

import { notifyRelationshipOnReply, buildRelationshipPushPayload } from "./notify-relationship-on-reply"

let managers: Array<{ id: string }> = [{ id: "samara-1" }]
// Stub do admin client: from("users").select().eq().eq().eq() é aguardado direto (thenable).
function adminStub() {
  const b: Record<string, unknown> = {
    select: () => b,
    eq: () => b,
    then: (resolve: (v: { data: unknown; error: null }) => unknown) => resolve({ data: managers, error: null }),
  }
  return { from: () => b } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  managers = [{ id: "samara-1" }]
  process.env.NEXT_PUBLIC_APP_URL = "https://crm.trifold.eng.br"
})

describe("buildRelationshipPushPayload", () => {
  it("title com nome + deep-link p/ a conversa + fallback de body", () => {
    const p = buildRelationshipPushPayload({ contactName: "Diego", messageExcerpt: "", appUrl: "https://x", conversationId: "c1" })
    expect(p.title).toBe("Diego respondeu")
    expect(p.url).toBe("https://x/dashboard/chat/c1")
    expect(p.body).toBe("Nova mensagem no relacionamento.")
  })
  it("usa o excerpt quando há texto", () => {
    const p = buildRelationshipPushPayload({ contactName: null, messageExcerpt: "Qual a senha?", appUrl: "https://x", conversationId: "c2" })
    expect(p.title).toBe("Cliente respondeu")
    expect(p.body).toBe("Qual a senha?")
  })
})

describe("notifyRelationshipOnReply", () => {
  it("envia push a cada gerente de relacionamento, com deep-link da conversa", async () => {
    managers = [{ id: "samara-1" }, { id: "sup-2" }]
    await notifyRelationshipOnReply({ supabase: adminStub(), conversationId: "conv-9", orgId: "org-1", contactName: "Diego", messageExcerpt: "oi" })
    expect(pushSpy).toHaveBeenCalledTimes(2)
    const [, , payload] = pushSpy.mock.calls[0]!
    expect((payload as { url: string }).url).toBe("https://crm.trifold.eng.br/dashboard/chat/conv-9")
  })
  it("sem gerentes → não envia", async () => {
    managers = []
    await notifyRelationshipOnReply({ supabase: adminStub(), conversationId: "c", orgId: "org-1", contactName: "X", messageExcerpt: "" })
    expect(pushSpy).not.toHaveBeenCalled()
  })
})
