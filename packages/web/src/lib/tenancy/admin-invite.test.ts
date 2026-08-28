/**
 * Story 900-22b — AC-A3, AC-A5 e AC-A7.
 *
 * Isolamento por `vi.mock("@web/lib/supabase/admin")`, o MESMO padrão que
 * `app/api/brokers/route.test.ts` já usa para este exato módulo. O fake registra as chamadas
 * porque várias ACs aqui são sobre ORDEM e sobre AUSÊNCIA de chamada ("não recriar a conta de
 * quem já aceitou"), e ausência não se verifica olhando o valor de retorno.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"

interface Chamada {
  tabela?: string
  metodo: string
  args: unknown[]
}

let chamadas: Chamada[] = []

/** Linhas que o `select` de `users` devolve. */
let usersSelect: { data: unknown; error: { message: string } | null } = { data: [], error: null }
/** Linha que o `insert(...).select(...).single()` de `users` devolve. */
let usersInsert: { data: unknown; error: { message: string } | null } = { data: null, error: null }
/** Linha que o `select(...).maybeSingle()` de `organizations` devolve. */
let orgSelect: { data: unknown; error: { message: string } | null } = { data: null, error: null }

let createUserResult: { data: unknown; error: { message: string } | null } = {
  data: { user: { id: "auth-novo" } },
  error: null,
}
let generateLinkResult: { data: unknown } = {
  data: { properties: { hashed_token: "HASHED_TOKEN" } },
}
let emailsEnviados: Array<Record<string, unknown>> = []

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
    order: (...args: unknown[]) => {
      chamadas.push({ tabela, metodo: "order", args })
      return builder
    },
    limit: async (...args: unknown[]) => {
      chamadas.push({ tabela, metodo: "limit", args })
      return usersSelect
    },
    single: async () => (operacao === "insert" ? usersInsert : usersSelect),
    maybeSingle: async () => orgSelect,
    // Cadeias de escrita (`update(...).eq(...)`) são aguardadas direto, sem terminal.
    then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }),
  }
  return builder
}

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => {
      chamadas.push({ tabela, metodo: "from", args: [tabela] })
      return criarBuilder(tabela)
    },
    auth: {
      admin: {
        createUser: async (...args: unknown[]) => {
          chamadas.push({ metodo: "createUser", args })
          return createUserResult
        },
        generateLink: async (...args: unknown[]) => {
          chamadas.push({ metodo: "generateLink", args })
          return generateLinkResult
        },
      },
    },
  }),
}))

vi.mock("@web/lib/email", () => ({
  sendEmail: async (params: Record<string, unknown>) => {
    emailsEnviados.push(params)
    return { id: "email-1" }
  },
}))

vi.mock("@web/lib/email-layout", () => ({
  renderPasswordActionEmail: () => ({ subject: "assunto", html: "<p>html</p>" }),
}))

import {
  deriveAdminInviteStatus,
  ensureAdminInvited,
  persistAdminInviteEmail,
} from "./admin-invite"

beforeEach(() => {
  chamadas = []
  emailsEnviados = []
  usersSelect = { data: [], error: null }
  usersInsert = { data: { id: "u-novo", auth_id: null, email: "a@acme.com", name: "a" }, error: null }
  orgSelect = { data: { admin_invite_email: null }, error: null }
  createUserResult = { data: { user: { id: "auth-novo" } }, error: null }
  generateLinkResult = { data: { properties: { hashed_token: "HASHED_TOKEN" } } }
  vi.spyOn(console, "error").mockImplementation(() => {})
})

// ─────────────────────────────────────────────────────────────────────────────
// AC-A5 — deriveAdminInviteStatus
// ─────────────────────────────────────────────────────────────────────────────

describe("deriveAdminInviteStatus (AC-A5)", () => {
  it('1. admin com authId → "active"', () => {
    expect(
      deriveAdminInviteStatus({
        adminInviteEmail: null,
        admin: { id: "u1", authId: "auth-1" },
      }),
    ).toBe("active")
  })

  it('2. linha existe, sem auth, com e-mail ainda persistido → "pending"', () => {
    expect(
      deriveAdminInviteStatus({
        adminInviteEmail: "x@acme.com",
        admin: { id: "u1", authId: null },
      }),
    ).toBe("pending")
  })

  it('3. linha existe, sem auth, SEM e-mail persistido → "pending" (só `admin` decide)', () => {
    // Este é o único caso em que o campo `admin` é o carrasco: remover `input.admin` do
    // segundo `if` deixaria os outros quatro verdes e derrubaria só este.
    expect(
      deriveAdminInviteStatus({
        adminInviteEmail: null,
        admin: { id: "u1", authId: null },
      }),
    ).toBe("pending")
  })

  it('4. linha ainda não existe, e-mail persistido → "pending" (janela entre AC-A2 e AC-A3.1)', () => {
    expect(
      deriveAdminInviteStatus({ adminInviteEmail: "x@acme.com", admin: null }),
    ).toBe("pending")
  })

  it('5. sem rastro nenhum → "none" (org legada)', () => {
    expect(deriveAdminInviteStatus({ adminInviteEmail: null, admin: null })).toBe("none")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AC-A3 / AC-A7 — ensureAdminInvited
// ─────────────────────────────────────────────────────────────────────────────

describe("ensureAdminInvited — caminho feliz (AC-A3.1 e AC-A3.3)", () => {
  it('cria a linha, cria a conta Auth e devolve "invited"', async () => {
    const r = await ensureAdminInvited("org-1", "admin@acme.com")
    expect(r).toEqual({ status: "invited" })
  })

  it("insere `users` com role admin, auth_id nulo e nome derivado do e-mail", async () => {
    await ensureAdminInvited("org-1", "admin@acme.com")
    const insert = chamadas.find((c) => c.metodo === "insert" && c.tabela === "users")
    expect(insert?.args[0]).toMatchObject({
      org_id: "org-1",
      auth_id: null,
      email: "admin@acme.com",
      name: "admin",
      role: "admin",
      is_active: true,
    })
  })

  it("cria a conta Auth com app_metadata.role (Story 75-205)", async () => {
    await ensureAdminInvited("org-1", "admin@acme.com")
    const criacao = chamadas.find((c) => c.metodo === "createUser")
    expect(criacao?.args[0]).toMatchObject({
      email: "admin@acme.com",
      email_confirm: true,
      app_metadata: { role: "admin" },
    })
  })

  it("grava o auth_id devolvido pelo Supabase Auth na linha de users", async () => {
    await ensureAdminInvited("org-1", "admin@acme.com")
    const update = chamadas.find(
      (c) => c.metodo === "update" && c.tabela === "users",
    )
    expect(update?.args[0]).toEqual({ auth_id: "auth-novo" })
  })

  it("manda o e-mail com a tag platform_admin_invite (não broker_invite)", async () => {
    await ensureAdminInvited("org-1", "admin@acme.com")
    expect(emailsEnviados).toHaveLength(1)
    expect(emailsEnviados[0]).toMatchObject({
      to: "admin@acme.com",
      orgId: "org-1",
      tags: [{ name: "type", value: "platform_admin_invite" }],
    })
  })

  it("limpa organizations.admin_invite_email ao concluir", async () => {
    await ensureAdminInvited("org-1", "admin@acme.com")
    const limpeza = chamadas.find(
      (c) => c.metodo === "update" && c.tabela === "organizations",
    )
    expect(limpeza?.args[0]).toEqual({ admin_invite_email: null })
  })

  it("SEC-002: a senha temporária vem de CSPRNG, nunca de Math.random", async () => {
    // Sem esta asserção, voltar para `Math.random()` (o idioma copiado de brokers/route.ts)
    // passaria despercebido: nenhum outro teste olha para a senha, que é descartada logo em
    // seguida pelo link de recovery. O titular aqui é o admin de uma empresa inteira.
    const csprng = vi.spyOn(globalThis.crypto, "randomUUID")
    const fraco = vi.spyOn(Math, "random")

    await ensureAdminInvited("org-1", "admin@acme.com")

    expect(csprng).toHaveBeenCalled()
    expect(fraco).not.toHaveBeenCalled()

    csprng.mockRestore()
    fraco.mockRestore()
  })

  it("não manda e-mail se o generateLink não devolver hashed_token", async () => {
    generateLinkResult = { data: { properties: {} } }
    const r = await ensureAdminInvited("org-1", "admin@acme.com")
    expect(r).toEqual({ status: "invited" })
    expect(emailsEnviados).toHaveLength(0)
  })
})

describe("ensureAdminInvited — createUser falha (AC-A3.4 e AC-A7)", () => {
  const MENSAGEM = "A user with this email address has already been registered"

  beforeEach(() => {
    createUserResult = { data: null, error: { message: MENSAGEM } }
  })

  it('devolve { status: "failed", message } com a mensagem do Supabase Auth', async () => {
    const r = await ensureAdminInvited("org-1", "admin@acme.com")
    expect(r).toEqual({ status: "failed", message: MENSAGEM })
  })

  it("preserva a linha em users com auth_id nulo — é ela que sustenta o convite pendente", async () => {
    await ensureAdminInvited("org-1", "admin@acme.com")
    const insert = chamadas.find((c) => c.metodo === "insert" && c.tabela === "users")
    expect(insert?.args[0]).toMatchObject({ auth_id: null })
    // Nenhum update de auth_id: a linha continua sem conta.
    expect(chamadas.some((c) => c.metodo === "update" && c.tabela === "users")).toBe(false)
  })

  it("não limpa o admin_invite_email — o convite continua pendente", async () => {
    await ensureAdminInvited("org-1", "admin@acme.com")
    expect(chamadas.some((c) => c.metodo === "update" && c.tabela === "organizations")).toBe(
      false,
    )
  })

  it("loga estruturado com orgId, adminEmail e a mensagem do erro", async () => {
    await ensureAdminInvited("org-1", "admin@acme.com")
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("convite do admin falhou"),
      { orgId: "org-1", adminEmail: "admin@acme.com", authError: MENSAGEM },
    )
  })
})

describe("ensureAdminInvited — idempotência (AC-A3.2)", () => {
  it("admin já ativo: NÃO chama createUser", async () => {
    usersSelect = {
      data: [{ id: "u1", auth_id: "auth-1", email: "admin@acme.com", name: "admin" }],
      error: null,
    }
    const r = await ensureAdminInvited("org-1", "admin@acme.com")
    expect(r).toEqual({ status: "already_active" })
    expect(chamadas.some((c) => c.metodo === "createUser")).toBe(false)
  })

  it("admin já ativo com e-mail novo pendente: limpa o campo e sinaliza emailIgnored (AC-A3.2b)", async () => {
    usersSelect = {
      data: [{ id: "u1", auth_id: "auth-1", email: "antigo@acme.com", name: "antigo" }],
      error: null,
    }
    orgSelect = { data: { admin_invite_email: "novo@acme.com" }, error: null }

    const r = await ensureAdminInvited("org-1", "novo@acme.com")

    expect(r).toEqual({ status: "already_active", emailIgnored: true })
    const limpeza = chamadas.find(
      (c) => c.metodo === "update" && c.tabela === "organizations",
    )
    expect(limpeza?.args[0]).toEqual({ admin_invite_email: null })
    expect(chamadas.some((c) => c.metodo === "createUser")).toBe(false)
  })

  it("linha existe SEM auth_id: prossegue para createUser (não confunde `id` com `auth_id`)", async () => {
    // A mutação perigosa da AC-A3: trocar `admin?.auth_id` por `admin?.id` marcaria esta
    // linha como já ativa, porque `id` é sempre truthy — e reportaria "convite aceito" para
    // quem nunca recebeu conta nenhuma.
    usersSelect = {
      data: [{ id: "u1", auth_id: null, email: "admin@acme.com", name: "admin" }],
      error: null,
    }
    const r = await ensureAdminInvited("org-1", "admin@acme.com")
    expect(r).toEqual({ status: "invited" })
    expect(chamadas.some((c) => c.metodo === "createUser")).toBe(true)
    // Reusa a linha existente em vez de inserir uma segunda.
    expect(chamadas.some((c) => c.metodo === "insert" && c.tabela === "users")).toBe(false)
  })

  it("desempata múltiplos admins por created_at ASC, limite 1", async () => {
    usersSelect = {
      data: [
        { id: "u-antigo", auth_id: "auth-antigo", email: "a@t.com", name: "a" },
        { id: "u-novo", auth_id: null, email: "b@t.com", name: "b" },
      ],
      error: null,
    }
    const r = await ensureAdminInvited("org-1", "admin@acme.com")

    // Pega a PRIMEIRA linha (a mais antiga) — que está ativa.
    expect(r).toEqual({ status: "already_active" })
    expect(chamadas).toContainEqual({
      tabela: "users",
      metodo: "order",
      args: ["created_at", { ascending: true }],
    })
    expect(chamadas).toContainEqual({ tabela: "users", metodo: "limit", args: [1] })
  })

  it("erro na busca do admin devolve failed sem tocar no Supabase Auth", async () => {
    usersSelect = { data: null, error: { message: "conexão caiu" } }
    const r = await ensureAdminInvited("org-1", "admin@acme.com")
    expect(r).toEqual({ status: "failed", message: "conexão caiu" })
    expect(chamadas.some((c) => c.metodo === "createUser")).toBe(false)
  })
})

describe("persistAdminInviteEmail (AC-A2)", () => {
  it("grava o e-mail na org informada, com trim", async () => {
    await persistAdminInviteEmail("org-1", "  admin@acme.com  ")
    expect(chamadas).toContainEqual({
      tabela: "organizations",
      metodo: "update",
      args: [{ admin_invite_email: "admin@acme.com" }],
    })
    expect(chamadas).toContainEqual({
      tabela: "organizations",
      metodo: "eq",
      args: ["id", "org-1"],
    })
  })
})
