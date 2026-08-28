/**
 * Story 900-22b — AC-A4 e AC-A7 do endpoint de reenvio.
 *
 * O que este arquivo protege, em ordem de gravidade: (1) a rota não pode ficar sem guard de
 * platform admin — ela cria conta no Supabase Auth e dispara e-mail para o admin de um cliente;
 * (2) a mensagem do erro de Auth tem que chegar ao operador, porque o caso mais provável no
 * primeiro uso real ("e-mail já registrado", unicidade global) é indistinguível de rede caída
 * quando engolido.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"

vi.mock("server-only", () => ({}))

let platformAdmin: { userId: string; email: string; name: string | null } | null = {
  userId: "pa-1",
  email: "trifold@trifold.com.br",
  name: "Trifold",
}

/** Resultado de `platformQuery("organizations", ...).eq(...).maybeSingle()`. */
let orgRow: unknown = { id: "org-1", admin_invite_email: "admin@acme.com" }
/** Resultado de `platformQuery("users", ...)....limit(1)`. */
let adminRows: unknown = []

let resultadoConvite: unknown = { status: "invited" }
let chamadasConvite: Array<[string, string]> = []

vi.mock("@web/lib/tenancy/platform-guard", () => ({
  getPlatformAdmin: async () => platformAdmin,
}))

vi.mock("@web/lib/tenancy/platform-query", () => ({
  platformQuery: (tabela: string) => {
    const builder: Record<string, unknown> = {
      eq: () => builder,
      order: () => builder,
      limit: async () => ({ data: adminRows, error: null }),
      maybeSingle: async () => ({ data: orgRow, error: null }),
    }
    if (tabela !== "organizations" && tabela !== "users") {
      throw new Error(`platformQuery: "${tabela}" fora de PLATFORM_READABLE_TABLES`)
    }
    return builder
  },
}))

vi.mock("@web/lib/tenancy/admin-invite", () => ({
  ensureAdminInvited: async (orgId: string, email: string) => {
    chamadasConvite.push([orgId, email])
    return resultadoConvite
  },
}))

import { POST } from "./route"

function chamar(id: string) {
  return POST(new Request("http://localhost", { method: "POST" }), {
    params: Promise.resolve({ id }),
  })
}

beforeEach(() => {
  platformAdmin = { userId: "pa-1", email: "trifold@trifold.com.br", name: "Trifold" }
  orgRow = { id: "org-1", admin_invite_email: "admin@acme.com" }
  adminRows = []
  resultadoConvite = { status: "invited" }
  chamadasConvite = []
})

describe("POST resend-admin-invite — guard (AC-A4)", () => {
  it("sem platform admin devolve 403", async () => {
    platformAdmin = null
    const res = await chamar("org-1")
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: "FORBIDDEN" })
  })

  it("sem platform admin não chega a convidar ninguém", async () => {
    platformAdmin = null
    await chamar("org-1")
    expect(chamadasConvite).toEqual([])
  })
})

describe("POST resend-admin-invite — org inexistente (AC-A4)", () => {
  it("devolve 404 quando a org não existe", async () => {
    orgRow = null
    const res = await chamar("org-fantasma")
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "ORG_NOT_FOUND" })
  })
})

describe("POST resend-admin-invite — nada pendente (AC-A4)", () => {
  it("sem e-mail guardado e sem admin sem conta → 400 NO_PENDING_INVITE", async () => {
    orgRow = { id: "org-1", admin_invite_email: null }
    adminRows = []
    const res = await chamar("org-1")
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "NO_PENDING_INVITE" })
    expect(chamadasConvite).toEqual([])
  })

  it("admin já com auth_id e sem e-mail guardado também é NO_PENDING_INVITE", async () => {
    orgRow = { id: "org-1", admin_invite_email: null }
    adminRows = [{ id: "u1", auth_id: "auth-1", email: "admin@acme.com" }]
    const res = await chamar("org-1")
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "NO_PENDING_INVITE" })
  })

  it("linha de admin SEM auth_id é pendência mesmo sem e-mail guardado", async () => {
    orgRow = { id: "org-1", admin_invite_email: null }
    adminRows = [{ id: "u1", auth_id: null, email: "admin@acme.com" }]
    const res = await chamar("org-1")
    expect(res.status).toBe(200)
    expect(chamadasConvite).toEqual([["org-1", "admin@acme.com"]])
  })
})

describe("POST resend-admin-invite — org sempre do parâmetro de rota (AC-A6)", () => {
  it("passa o [id] da rota para ensureAdminInvited", async () => {
    await chamar("org-da-rota")
    expect(chamadasConvite).toEqual([["org-da-rota", "admin@acme.com"]])
  })

  it("o e-mail pendente na org vence o da linha de users", async () => {
    orgRow = { id: "org-1", admin_invite_email: "novo@acme.com" }
    adminRows = [{ id: "u1", auth_id: null, email: "antigo@acme.com" }]
    await chamar("org-1")
    expect(chamadasConvite).toEqual([["org-1", "novo@acme.com"]])
  })
})

describe("POST resend-admin-invite — propagação do resultado (AC-A7)", () => {
  it("falha do Auth vira 400 ADMIN_INVITE_FAILED com a mensagem preservada", async () => {
    const MENSAGEM = "A user with this email address has already been registered"
    resultadoConvite = { status: "failed", message: MENSAGEM }

    const res = await chamar("org-1")

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "ADMIN_INVITE_FAILED", message: MENSAGEM })
  })

  it("sucesso devolve 200 com o status invited", async () => {
    const res = await chamar("org-1")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ adminInvite: { status: "invited" } })
  })

  it("admin já ativo propaga already_active e emailIgnored para a UI", async () => {
    resultadoConvite = { status: "already_active", emailIgnored: true }
    const res = await chamar("org-1")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      adminInvite: { status: "already_active", emailIgnored: true },
    })
  })
})
