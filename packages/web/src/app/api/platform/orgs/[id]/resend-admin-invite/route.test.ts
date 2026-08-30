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

import { criarFakeSupabase, type Linha } from "@web/lib/tenancy/__fixtures__/fake-supabase-postgrest"

/** "Banco" do fake — linhas reais, filtradas e ordenadas de verdade pelo builder. */
let orgRows: Linha[] = [{ id: "org-1", admin_invite_email: "admin@acme.com" }]
let usersRows: Linha[] = []

let resultadoConvite: unknown = { status: "invited" }
let chamadasConvite: Array<[string, string]> = []

vi.mock("@web/lib/tenancy/platform-guard", () => ({
  getPlatformAdmin: async () => platformAdmin,
}))

/**
 * O fake HONRA `.eq()`, `.order()` e `.limit()`.
 *
 * Um duplo que devolvesse a lista fixa ignorando os filtros deixaria VERDE a remoção do
 * `.eq("org_id", …)` — ou seja, o teste ficaria cego justamente para a invariante de
 * isolamento de tenant que o Epic 900 inteiro existe para garantir. O mesmo vale para o
 * `.order("created_at")`: sem ordenação real, "pega o admin mais antigo" seria uma alegação
 * sobre uma lista que o próprio teste já entregou na ordem conveniente.
 *
 * ## Story 900-25 · AC2 (`TEST-004`) — o molde local saiu daqui
 *
 * O duplo que vivia neste arquivo honrava filtro, ordem e limite, mas mentia no terminal:
 * `maybeSingle` colapsava o resultado no primeiro elemento de `selecionadas()`, com coalescência
 * para nulo, e `error` nunca chegava. É a mesma mentira de `admin-invite.test.ts` escrita com
 * outro NOME de variável — foi por isso que o grep de fechamento da AC2 precisou ancorar no índice
 * `[0]` em vez do identificador `linhas`, que só existe no outro arquivo. (A forma literal não é
 * citada aqui: é o que a régua procura.) Medido contra o corpo de `legacyResolveActiveConfig`
 * (`webhook/whatsapp/route.ts`) com 2 linhas `status='active'`: sob este molde o legado PROCESSA
 * `org-A`; sob `criarFakeSupabase` ele DESCARTA, como o `postgrest-js` de verdade (`PGRST116`/406).
 *
 * O fake é criado A CADA chamada de propósito: `orgRows`/`usersRows` são reatribuídos dentro dos
 * testes, e um fake construído uma vez no factory do `vi.mock` congelaria os arrays do primeiro
 * `beforeEach`. Diferente de `admin-invite.test.ts`, aqui só existe **um** terminal singular
 * (`.maybeSingle()`) — não há `.single()` nesta rota.
 */
vi.mock("@web/lib/tenancy/platform-query", () => ({
  platformQuery: (tabela: string, colunas?: string) => {
    if (tabela !== "organizations" && tabela !== "users") {
      throw new Error(`platformQuery: "${tabela}" fora de PLATFORM_READABLE_TABLES`)
    }
    const fake = criarFakeSupabase({ tabelas: { organizations: orgRows, users: usersRows } })
    return (fake.from(tabela) as { select: (c?: string) => unknown }).select(colunas)
  },
}))

vi.mock("@web/lib/tenancy/admin-invite", () => ({
  ensureAdminInvited: async (orgId: string, email: string) => {
    chamadasConvite.push([orgId, email])
    return resultadoConvite
  },
}))

import { POST } from "./route"

/** Linha de admin completa — org, papel e data, porque o fake filtra e ordena de verdade. */
function linhaAdmin(over: Linha = {}): Linha {
  return {
    id: "u1",
    org_id: "org-1",
    role: "admin",
    auth_id: null,
    email: "admin@acme.com",
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  }
}

function chamar(id: string) {
  return POST(new Request("http://localhost", { method: "POST" }), {
    params: Promise.resolve({ id }),
  })
}

beforeEach(() => {
  platformAdmin = { userId: "pa-1", email: "trifold@trifold.com.br", name: "Trifold" }
  orgRows = [{ id: "org-1", admin_invite_email: "admin@acme.com" }]
  usersRows = []
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
    orgRows = []
    const res = await chamar("org-fantasma")
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "ORG_NOT_FOUND" })
  })
})

describe("POST resend-admin-invite — nada pendente (AC-A4)", () => {
  it("sem e-mail guardado e sem admin sem conta → 400 NO_PENDING_INVITE", async () => {
    orgRows = [{ id: "org-1", admin_invite_email: null }]
    usersRows = []
    const res = await chamar("org-1")
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "NO_PENDING_INVITE" })
    expect(chamadasConvite).toEqual([])
  })

  it("admin já com auth_id e sem e-mail guardado também é NO_PENDING_INVITE", async () => {
    orgRows = [{ id: "org-1", admin_invite_email: null }]
    usersRows = [linhaAdmin({ auth_id: "auth-1" })]
    const res = await chamar("org-1")
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "NO_PENDING_INVITE" })
  })

  it("linha de admin SEM auth_id é pendência mesmo sem e-mail guardado", async () => {
    orgRows = [{ id: "org-1", admin_invite_email: null }]
    usersRows = [linhaAdmin()]
    const res = await chamar("org-1")
    expect(res.status).toBe(200)
    expect(chamadasConvite).toEqual([["org-1", "admin@acme.com"]])
  })
})

describe("POST resend-admin-invite — org sempre do parâmetro de rota (AC-A6)", () => {
  it("passa o [id] da rota para ensureAdminInvited", async () => {
    // A org precisa EXISTIR com esse id: com o fake honrando `.eq("id", …)`, um id que não
    // está no banco vira 404 antes de qualquer convite. (Este teste passava antes por engano,
    // porque o duplo antigo devolvia a org fixa ignorando o filtro — CodeRabbit #522.)
    orgRows = [{ id: "org-da-rota", admin_invite_email: "admin@acme.com" }]
    await chamar("org-da-rota")
    expect(chamadasConvite).toEqual([["org-da-rota", "admin@acme.com"]])
  })

  it("o e-mail pendente na org vence o da linha de users", async () => {
    orgRows = [{ id: "org-1", admin_invite_email: "novo@acme.com" }]
    usersRows = [linhaAdmin({ email: "antigo@acme.com" })]
    await chamar("org-1")
    expect(chamadasConvite).toEqual([["org-1", "novo@acme.com"]])
  })
})

describe("POST resend-admin-invite — o fake filtra e ordena de verdade (CodeRabbit #522)", () => {
  it("não enxerga a org de outro tenant: [id] inexistente é 404 mesmo com outra org no banco", async () => {
    // Se o `.eq("id", orgId)` da consulta de organizations sumisse, o fake devolveria a
    // primeira org que existe e a rota responderia 200 para um id que não existe.
    orgRows = [{ id: "org-outra", admin_invite_email: "x@acme.com" }]
    const res = await chamar("org-1")
    expect(res.status).toBe(404)
    expect(chamadasConvite).toEqual([])
  })

  it("não enxerga o admin de OUTRA org (filtro de tenant é medido, não presumido)", async () => {
    // A pendência só existe na org-2. Sem o `.eq("org_id", …)`, esta linha seria contada como
    // pendência da org-1 e a rota dispararia convite para o tenant errado.
    orgRows = [{ id: "org-1", admin_invite_email: null }]
    usersRows = [linhaAdmin({ id: "u-alheio", org_id: "org-2" })]

    const res = await chamar("org-1")

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "NO_PENDING_INVITE" })
    expect(chamadasConvite).toEqual([])
  })

  it("não confunde admin com usuário de outro papel na mesma org", async () => {
    // Sem o `.eq("role", "admin")`, este corretor sem conta viraria "convite pendente".
    orgRows = [{ id: "org-1", admin_invite_email: null }]
    usersRows = [linhaAdmin({ id: "u-corretor", role: "broker" })]

    const res = await chamar("org-1")

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "NO_PENDING_INVITE" })
  })

  it("desempata pegando o admin MAIS ANTIGO (created_at ASC)", async () => {
    // O mais antigo está ativo e vem por ÚLTIMO no array de propósito: sem o `.order`, o fake
    // devolveria o pendente primeiro e a rota acharia que há convite a reenviar.
    orgRows = [{ id: "org-1", admin_invite_email: null }]
    usersRows = [
      linhaAdmin({ id: "u-novo", auth_id: null, created_at: "2026-06-01T00:00:00Z" }),
      linhaAdmin({ id: "u-antigo", auth_id: "auth-antigo", created_at: "2020-01-01T00:00:00Z" }),
    ]

    const res = await chamar("org-1")

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "NO_PENDING_INVITE" })
    expect(chamadasConvite).toEqual([])
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
