/**
 * Story 900-22 — o slug é o que torna `provision_org` idempotente, então errá-lo significa
 * criar empresa duplicada em vez de retomar a existente.
 *
 * Story 900-22b — o POST passa a exigir o e-mail do admin e a convidá-lo. Este arquivo muda de
 * natureza aqui: antes só importava `slugify` (função pura, zero mocks); agora exercita o
 * handler, o que exige mockar `getPlatformAdmin` — sem ele o handler devolve `403` antes de
 * chegar em qualquer validação, e os testes ficariam verdes/vermelhos pelo motivo errado.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"

vi.mock("server-only", () => ({}))

interface Chamada {
  tabela?: string
  metodo: string
  args: unknown[]
}

let chamadas: Chamada[] = []
let platformAdmin: { userId: string; email: string; name: string | null } | null = {
  userId: "pa-1",
  email: "trifold@trifold.com.br",
  name: "Trifold",
}
let provisionResult: { data: unknown; error: { message: string } | null } = {
  data: "org-provisionada",
  error: null,
}
let usersSelect: { data: unknown; error: { message: string } | null } = { data: [], error: null }
let usersInsert: { data: unknown; error: { message: string } | null } = {
  data: { id: "u-novo", auth_id: null, email: "admin@acme.com", name: "admin" },
  error: null,
}
let orgSelect: { data: unknown; error: { message: string } | null } = {
  data: { admin_invite_email: null },
  error: null,
}
let createUserResult: { data: unknown; error: { message: string } | null } = {
  data: { user: { id: "auth-novo" } },
  error: null,
}
/** Quando setado, o convite lança — usado para provar a ORDEM da AC-A2. */
let conviteLanca: string | null = null

function criarBuilder(tabela: string) {
  let operacao: "select" | "insert" | "update" = "select"
  const builder: Record<string, unknown> = {
    select: (...args: unknown[]) => {
      chamadas.push({ tabela, metodo: "select", args })
      return builder
    },
    insert: (...args: unknown[]) => {
      operacao = "insert"
      chamadas.push({ tabela, metodo: "insert", args })
      return builder
    },
    update: (...args: unknown[]) => {
      operacao = "update"
      chamadas.push({ tabela, metodo: "update", args })
      return builder
    },
    eq: (...args: unknown[]) => {
      chamadas.push({ tabela, metodo: "eq", args })
      return builder
    },
    order: () => builder,
    limit: async () => usersSelect,
    single: async () => (operacao === "insert" ? usersInsert : usersSelect),
    maybeSingle: async () => orgSelect,
    then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }),
  }
  return builder
}

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      chamadas.push({ metodo: "rpc", args: [fn, args] })
      return provisionResult
    },
    from: (tabela: string) => criarBuilder(tabela),
    auth: {
      admin: {
        createUser: async (...args: unknown[]) => {
          chamadas.push({ metodo: "createUser", args })
          return createUserResult
        },
        generateLink: async () => ({ data: { properties: { hashed_token: "HT" } } }),
      },
    },
  }),
}))

vi.mock("@web/lib/tenancy/platform-guard", () => ({
  getPlatformAdmin: async () => platformAdmin,
}))

vi.mock("@web/lib/email", () => ({ sendEmail: async () => ({ id: "e1" }) }))
vi.mock("@web/lib/email-layout", () => ({
  renderPasswordActionEmail: () => ({ subject: "s", html: "h" }),
}))

/**
 * Envelope fino em volta do módulo REAL: registra a chamada (para a asserção de ordem da
 * AC-A2) e, por padrão, deixa a implementação de verdade rodar contra o fake do Supabase —
 * é o que permite a AC-A6 asseverar sobre o `insert` em `users`.
 */
vi.mock("@web/lib/tenancy/admin-invite", async (importOriginal) => {
  const real = await importOriginal<typeof import("@web/lib/tenancy/admin-invite")>()
  return {
    ...real,
    ensureAdminInvited: async (orgId: string, email: string) => {
      chamadas.push({ metodo: "ensureAdminInvited", args: [orgId, email] })
      if (conviteLanca) throw new Error(conviteLanca)
      return real.ensureAdminInvited(orgId, email)
    },
  }
})

import { POST, slugify } from "./route"

function requisicao(body: unknown) {
  return new Request("http://localhost/api/platform/orgs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  chamadas = []
  conviteLanca = null
  platformAdmin = { userId: "pa-1", email: "trifold@trifold.com.br", name: "Trifold" }
  provisionResult = { data: "org-provisionada", error: null }
  usersSelect = { data: [], error: null }
  usersInsert = {
    data: { id: "u-novo", auth_id: null, email: "admin@acme.com", name: "admin" },
    error: null,
  }
  orgSelect = { data: { admin_invite_email: null }, error: null }
  createUserResult = { data: { user: { id: "auth-novo" } }, error: null }
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("slugify", () => {
  it("normaliza nome comum", () => {
    expect(slugify("Acme Imóveis")).toBe("acme-imoveis")
  })

  it("remove acentos", () => {
    expect(slugify("Construções São João")).toBe("construcoes-sao-joao")
  })

  it("colapsa pontuação e espaços múltiplos", () => {
    expect(slugify("A & B   Imóveis, Ltda.")).toBe("a-b-imoveis-ltda")
  })

  it("não deixa hífen nas pontas", () => {
    expect(slugify("  -Acme-  ")).toBe("acme")
  })

  it("nome só com símbolos vira vazio (a rota rejeita)", () => {
    expect(slugify("!!!")).toBe("")
  })

  it("é estável — mesmo nome, mesmo slug (base da idempotência)", () => {
    expect(slugify("Acme Imóveis")).toBe(slugify("acme   imoveis"))
  })
})

describe("POST /api/platform/orgs — e-mail do admin obrigatório (AC-A1)", () => {
  it("sem adminEmail devolve 400 ADMIN_EMAIL_REQUIRED", async () => {
    const res = await POST(requisicao({ name: "Acme", slug: "acme" }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "ADMIN_EMAIL_REQUIRED" })
  })

  it("adminEmail só com espaços também é recusado", async () => {
    const res = await POST(requisicao({ name: "Acme", adminEmail: "   " }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "ADMIN_EMAIL_REQUIRED" })
  })

  it("recusa ANTES de provisionar — nenhuma org é criada por engano", async () => {
    await POST(requisicao({ name: "Acme" }))
    expect(chamadas.some((c) => c.metodo === "rpc")).toBe(false)
  })

  it("com adminEmail, provisiona e devolve 201", async () => {
    const res = await POST(requisicao({ name: "Acme", adminEmail: "admin@acme.com" }))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json).toMatchObject({
      orgId: "org-provisionada",
      name: "Acme",
      slug: "acme",
      adminInvite: { status: "invited" },
    })
  })

  it("sem sessão de plataforma continua 403 (o guard vem antes de tudo)", async () => {
    platformAdmin = null
    const res = await POST(requisicao({ name: "Acme" }))
    expect(res.status).toBe(403)
  })
})

describe("POST /api/platform/orgs — e-mail persiste antes do efeito externo (AC-A2)", () => {
  it("grava admin_invite_email ANTES de chamar ensureAdminInvited", async () => {
    conviteLanca = "convite explodiu"
    await POST(requisicao({ name: "Acme", adminEmail: "admin@acme.com" }))

    const iUpdate = chamadas.findIndex(
      (c) =>
        c.metodo === "update" &&
        c.tabela === "organizations" &&
        JSON.stringify(c.args[0]) === JSON.stringify({ admin_invite_email: "admin@acme.com" }),
    )
    const iConvite = chamadas.findIndex((c) => c.metodo === "ensureAdminInvited")

    expect(iUpdate).toBeGreaterThanOrEqual(0)
    expect(iConvite).toBeGreaterThanOrEqual(0)
    expect(iUpdate).toBeLessThan(iConvite)
  })

  it("mesmo com o convite explodindo, a org existe e a resposta é 201", async () => {
    conviteLanca = "convite explodiu"
    const res = await POST(requisicao({ name: "Acme", adminEmail: "admin@acme.com" }))
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({
      orgId: "org-provisionada",
      adminInvite: { status: "failed", message: "convite explodiu" },
    })
  })
})

describe("POST /api/platform/orgs — org_id nunca vem do cliente (AC-A6)", () => {
  it("ignora um orgId forjado no corpo e usa o que provision_org devolveu", async () => {
    await POST(
      requisicao({
        name: "Acme",
        adminEmail: "admin@acme.com",
        orgId: "00000000-0000-0000-0000-00000000dead",
      }),
    )

    const insert = chamadas.find((c) => c.metodo === "insert" && c.tabela === "users")
    expect(insert?.args[0]).toMatchObject({ org_id: "org-provisionada" })
  })
})

describe("POST /api/platform/orgs — convite falha sem derrubar a criação (AC-A7)", () => {
  it("createUser rejeitado → 201 com adminInvite.status failed e a mensagem", async () => {
    const MENSAGEM = "A user with this email address has already been registered"
    createUserResult = { data: null, error: { message: MENSAGEM } }

    const res = await POST(requisicao({ name: "Acme", adminEmail: "admin@acme.com" }))

    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({
      orgId: "org-provisionada",
      adminInvite: { status: "failed", message: MENSAGEM },
    })
  })
})
