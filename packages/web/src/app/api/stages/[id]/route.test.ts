/**
 * Story 75-371 — DELETE /api/stages/[id] não pode excluir a etapa padrão.
 *
 * O DELETE é SOFT (`is_active = false`) e `getDefaultStageId`
 * (lib/leads/default-stage.ts) NÃO filtra `is_active`. Sem esta guarda, excluir a etapa
 * padrão deixa `is_default = true` numa etapa inativa e todo lead novo passa a nascer
 * numa etapa que o Pipeline e os filtros não mostram (ambos filtram is_active = true).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

let role = "admin"

vi.mock("@web/lib/api-auth", async () => {
  // Mesmo padrão de properties/route.test.ts: a decisão de permissão vem do SEED do
  // registro de capabilities, não de constante mockada.
  const { CAPABILITY_SEED } = await vi.importActual<
    typeof import("@web/lib/capabilities")
  >("@web/lib/capabilities")
  return {
    requireAuth: async () => ({
      supabase: fakeSupabase,
      appUser: { id: "u-1", name: "User", role, org_id: "org-1" },
    }),
    requireCapability: async (
      user: { role: string },
      capability: keyof typeof CAPABILITY_SEED
    ) =>
      user.role === "admin" ||
      (CAPABILITY_SEED[capability] as readonly string[]).includes(user.role)
        ? null
        : new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
  }
})

/** A etapa que o banco devolve na leitura da guarda. */
let stageNoBanco: { is_default: boolean } | null = { is_default: false }
/** Erro que a leitura da guarda devolve (QA-75-371-6: a guarda falha FECHADA). */
let erroDeLeitura: { message: string } | null = null
/** Virou true se o UPDATE (soft delete ou PATCH) chegou a ser executado. */
let updateExecutado = false
/** Payload do último UPDATE. */
let updatePayload: Record<string, unknown> | null = null

const fakeSupabase = {
  from() {
    return {
      select() {
        const chain = {
          eq: () => chain,
          maybeSingle: async () => ({ data: stageNoBanco, error: erroDeLeitura }),
          single: async () => ({ data: { id: "s-1", is_active: false }, error: null }),
        }
        return chain
      },
      update(payload: Record<string, unknown>) {
        updateExecutado = true
        updatePayload = payload
        const chain = {
          eq: () => chain,
          select: () => chain,
          single: async () => ({ data: { id: "s-1", ...payload }, error: null }),
        }
        return chain
      },
    }
  },
}

function pedidoPatch(body: Record<string, unknown>) {
  return { json: async () => body } as never
}

const params = Promise.resolve({ id: "s-1" })

describe("contrato do módulo mockado", () => {
  // O factory acima substitui `@web/lib/api-auth` INTEIRO e fabrica os dois símbolos. Se um
  // deles for renomeado ou removido, a rota quebra em produção e esta suíte segue verde —
  // o mock continuaria "funcionando" contra um módulo que não existe mais.
  it("`@web/lib/api-auth` exporta o que a rota importa", async () => {
    const real = await vi.importActual<typeof import("@web/lib/api-auth")>("@web/lib/api-auth")

    expect(typeof real.requireAuth).toBe("function")
    expect(typeof real.requireCapability).toBe("function")
  })
})

describe("DELETE /api/stages/[id] — guarda da etapa padrão", () => {
  beforeEach(() => {
    role = "admin"
    stageNoBanco = { is_default: false }
    erroDeLeitura = null
    updateExecutado = false
    updatePayload = null
  })

  it("recusa com 409 quando a etapa é a padrão, e NÃO executa o soft delete", async () => {
    stageNoBanco = { is_default: true }
    const { DELETE } = await import("./route")

    const res = await DELETE({} as never, { params })
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toMatch(/etapa padrão/i)
    expect(updateExecutado).toBe(false)
  })

  it("a mensagem do 409 diz o que fazer antes de excluir", async () => {
    stageNoBanco = { is_default: true }
    const { DELETE } = await import("./route")

    const body = await (await DELETE({} as never, { params })).json()

    expect(body.error).toMatch(/eleja outra etapa como padrão/i)
  })

  it("etapa comum continua sendo excluída", async () => {
    stageNoBanco = { is_default: false }
    const { DELETE } = await import("./route")

    const res = await DELETE({} as never, { params })

    expect(res.status).toBe(200)
    expect(updateExecutado).toBe(true)
  })

  it("gate de capability vem antes da guarda: broker leva 403 e nada é lido", async () => {
    role = "broker"
    stageNoBanco = { is_default: true }
    const { DELETE } = await import("./route")

    const res = await DELETE({} as never, { params })

    expect(res.status).toBe(403)
    expect(updateExecutado).toBe(false)
  })

  it("falha FECHADA: se a leitura da guarda erra, não exclui (QA-75-371-6)", async () => {
    // O caso em que a guarda mais importa é justamente o que passava batido quando o
    // erro era descartado e `alvo?.is_default` caía num null.
    stageNoBanco = null
    erroDeLeitura = { message: "connection reset" }
    const { DELETE } = await import("./route")

    const res = await DELETE({} as never, { params })

    expect(res.status).toBe(500)
    expect(updateExecutado).toBe(false)
  })
})

describe("PATCH /api/stages/[id] — a org não pode ficar sem etapa padrão", () => {
  beforeEach(() => {
    role = "admin"
    stageNoBanco = { is_default: false }
    erroDeLeitura = null
    updateExecutado = false
    updatePayload = null
  })

  it("recusa com 409 desmarcar a etapa que É a padrão (QA-75-371-5)", async () => {
    stageNoBanco = { is_default: true }
    const { PATCH } = await import("./route")

    const res = await PATCH(pedidoPatch({ is_default: false }), { params })
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toMatch(/precisa de uma etapa padrão/i)
    expect(updateExecutado).toBe(false)
  })

  it("desmarcar etapa que NÃO é a padrão passa (é no-op de negócio)", async () => {
    stageNoBanco = { is_default: false }
    const { PATCH } = await import("./route")

    const res = await PATCH(pedidoPatch({ is_default: false }), { params })

    expect(res.status).toBe(200)
    expect(updateExecutado).toBe(true)
  })

  it("MARCAR uma etapa como padrão passa — o trigger da mig 250 transfere o posto", async () => {
    stageNoBanco = { is_default: false }
    const { PATCH } = await import("./route")

    const res = await PATCH(pedidoPatch({ is_default: true }), { params })

    expect(res.status).toBe(200)
    expect(updatePayload).toMatchObject({ is_default: true })
  })

  it("PATCH que não mexe em is_default não passa pela guarda", async () => {
    stageNoBanco = { is_default: true }
    const { PATCH } = await import("./route")

    const res = await PATCH(pedidoPatch({ name: "Follow-up" }), { params })

    expect(res.status).toBe(200)
    expect(updatePayload).toMatchObject({ name: "Follow-up" })
  })
})
