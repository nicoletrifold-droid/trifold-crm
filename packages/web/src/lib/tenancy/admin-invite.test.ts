/**
 * Story 900-22b — AC-A3, AC-A5 e AC-A7, mais as correções do CodeRabbit no PR #522.
 *
 * Isolamento por `vi.mock("@web/lib/supabase/admin")`, o MESMO padrão que
 * `app/api/brokers/route.test.ts` já usa para este exato módulo. O fake registra as chamadas
 * porque várias ACs aqui são sobre ORDEM e sobre AUSÊNCIA de chamada ("não recriar a conta de
 * quem já aceitou"), e ausência não se verifica olhando o valor de retorno.
 *
 * O FAKE HONRA `.eq()`, `.order()` E `.limit()` — e isso não é capricho. Um fake que devolve
 * uma lista fixa independentemente dos filtros deixa VERDE a remoção do filtro de org: o teste
 * passaria a não medir a única invariante que o Epic 900 inteiro existe para garantir. O mesmo
 * vale para o desempate `created_at ASC`: sem ordenação real, o "pega o admin mais antigo" é
 * uma alegação sobre uma lista que o teste já entregou na ordem certa.
 *
 * ## Story 900-25 · AC2 (`TEST-004`) — de onde vem o fake agora
 *
 * O molde local que este arquivo carregava honrava filtro, ordem e limite, mas MENTIA nos dois
 * terminais singulares: `single`/`maybeSingle` colapsavam o resultado em `linhas[0]`, com
 * coalescência para nulo — ou seja "achei a primeira" com 2+ linhas, e `error` sempre nulo.
 * (A forma literal não é citada aqui de propósito: é ela que o grep de fechamento da AC2 procura,
 * e um comentário que a repete deixa a régua vermelha para sempre.) Medido contra o corpo de
 * `legacyResolveActiveConfig` (`webhook/whatsapp/route.ts`) com 2 configs `status='active'`: sob
 * este molde o legado PROCESSA `org-A`; sob o `postgrest-js` de verdade ele DESCARTA
 * (`PGRST116`/406). Ou seja, o defeito central da Onda 2 era **insatisfazível** como asserção
 * enquanto este molde existisse — e ele já tinha sido copiado duas vezes.
 *
 * A troca é para `criarFakeSupabase` de `__fixtures__/fake-supabase-postgrest.ts`, que espelha
 * `data` **e** `error`. Nenhuma asserção deste arquivo foi reescrita para acomodar o fixture.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"

import {
  criarFakeSupabase,
  type ChamadaRegistrada,
  type ErroPostgrest,
  type Linha,
} from "./__fixtures__/fake-supabase-postgrest"

let chamadas: ChamadaRegistrada[] = []

/** "Banco" do fake: linhas reais, filtradas de verdade pelo builder. */
let usersRows: Linha[] = []
let orgRows: Linha[] = []

/** Erro injetável na LEITURA de `users`. */
let selectErro: ErroPostgrest | null = null
/**
 * Erro injetável por ESCRITA, decidido por tabela + payload + OPERAÇÃO.
 *
 * A operação entrou na assinatura na migração da AC2 (900-25) e não é decoração: o molde antigo
 * só consultava este hook nas cadeias `update(...).eq(...)` — `insert(...).select().single()`
 * tinha uma porta própria (`usersInsert`) que o ignorava. Com um fake que trata as duas escritas
 * igual, `"auth_id" in payload` passou a casar TAMBÉM com o insert de `{ …, auth_id: null }`, e o
 * teste do vínculo mediu o ramo errado. É o único vermelho que a migração produziu.
 */
let updateErro:
  | ((tabela: string, payload: Linha, operacao: "insert" | "update") => ErroPostgrest | null)
  | null = null

/**
 * Atalho para o formato de erro do PostgREST — o fixture exige `code`/`details` porque o código
 * de produção do Epic 900 desempata por `code` (`PGRST116`) em mais de um lugar. As asserções
 * herdadas só olham para `message`, e nenhuma delas mudou por causa disto.
 */
function erroDb(message: string, code = "P0001"): ErroPostgrest {
  return { code, message, details: message, hint: null }
}

let createUserResult: { data: unknown; error: { message: string } | null } = {
  data: { user: { id: "auth-novo" } },
  error: null,
}
let generateLinkResult: { data: unknown; error: { message: string } | null } = {
  data: { properties: { hashed_token: "HASHED_TOKEN" } },
  error: null,
}
let sendEmailResult: { id: string | null; error?: string } = { id: "email-1" }
let emailsEnviados: Array<Record<string, unknown>> = []

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => {
    const fake = criarFakeSupabase({
      tabelas: { users: usersRows, organizations: orgRows },
      erroPorTabela: selectErro ? { users: selectErro } : undefined,
      erroPorEscrita: updateErro ?? undefined,
      chamadas,
    })
    return {
      from: fake.from,
      auth: {
        admin: {
          // `tabela: "auth"` é sentinela: o log de chamadas é UM só porque várias asserções aqui
          // são sobre ORDEM entre banco e Auth ("reconcilia ANTES de criar a conta").
          createUser: async (...args: unknown[]) => {
            chamadas.push({ tabela: "auth", metodo: "createUser", args })
            return createUserResult
          },
          generateLink: async (...args: unknown[]) => {
            chamadas.push({ tabela: "auth", metodo: "generateLink", args })
            return generateLinkResult
          },
        },
      },
    }
  },
}))

vi.mock("@web/lib/email", () => ({
  sendEmail: async (params: Record<string, unknown>) => {
    emailsEnviados.push(params)
    return sendEmailResult
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

/** Linha de admin completa — org, papel e data, porque o fake filtra e ordena de verdade. */
function adminRow(over: Linha = {}): Linha {
  return {
    id: "u1",
    org_id: "org-1",
    role: "admin",
    auth_id: null,
    email: "admin@acme.com",
    name: "admin",
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  }
}

beforeEach(() => {
  chamadas = []
  emailsEnviados = []
  usersRows = []
  orgRows = [{ id: "org-1", admin_invite_email: null }]
  selectErro = null
  updateErro = null
  createUserResult = { data: { user: { id: "auth-novo" } }, error: null }
  generateLinkResult = { data: { properties: { hashed_token: "HASHED_TOKEN" } }, error: null }
  sendEmailResult = { id: "email-1" }
  vi.spyOn(console, "error").mockImplementation(() => {})
})

// ─────────────────────────────────────────────────────────────────────────────
// AC-A5 — deriveAdminInviteStatus
// ─────────────────────────────────────────────────────────────────────────────

describe("deriveAdminInviteStatus (AC-A5)", () => {
  it('1. admin com authId → "active"', () => {
    expect(
      deriveAdminInviteStatus({ adminInviteEmail: null, admin: { id: "u1", authId: "auth-1" } }),
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
    // Único caso em que o campo `admin` é o carrasco: remover `input.admin` do segundo `if`
    // deixaria os outros quatro verdes e derrubaria só este.
    expect(
      deriveAdminInviteStatus({ adminInviteEmail: null, admin: { id: "u1", authId: null } }),
    ).toBe("pending")
  })

  it('4. linha ainda não existe, e-mail persistido → "pending" (janela entre AC-A2 e AC-A3.1)', () => {
    expect(deriveAdminInviteStatus({ adminInviteEmail: "x@acme.com", admin: null })).toBe("pending")
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
    expect(await ensureAdminInvited("org-1", "admin@acme.com")).toEqual({ status: "invited" })
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
    expect(chamadas.find((c) => c.metodo === "createUser")?.args[0]).toMatchObject({
      email: "admin@acme.com",
      email_confirm: true,
      app_metadata: { role: "admin" },
    })
  })

  it("grava o auth_id devolvido pelo Supabase Auth na linha de users", async () => {
    await ensureAdminInvited("org-1", "admin@acme.com")
    const update = chamadas.find((c) => c.metodo === "update" && c.tabela === "users")
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
    const limpeza = chamadas.find((c) => c.metodo === "update" && c.tabela === "organizations")
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
})

describe("ensureAdminInvited — createUser falha (AC-A3.4 e AC-A7)", () => {
  const MENSAGEM = "A user with this email address has already been registered"

  beforeEach(() => {
    createUserResult = { data: null, error: { message: MENSAGEM } }
  })

  it('devolve { status: "failed", message } com a mensagem do Supabase Auth', async () => {
    expect(await ensureAdminInvited("org-1", "admin@acme.com")).toEqual({
      status: "failed",
      message: MENSAGEM,
    })
  })

  it("preserva a linha em users com auth_id nulo — é ela que sustenta o convite pendente", async () => {
    await ensureAdminInvited("org-1", "admin@acme.com")
    const insert = chamadas.find((c) => c.metodo === "insert" && c.tabela === "users")
    expect(insert?.args[0]).toMatchObject({ auth_id: null })
    expect(chamadas.some((c) => c.metodo === "update" && c.tabela === "users")).toBe(false)
  })

  it("não limpa o admin_invite_email — o convite continua pendente", async () => {
    await ensureAdminInvited("org-1", "admin@acme.com")
    expect(chamadas.some((c) => c.metodo === "update" && c.tabela === "organizations")).toBe(false)
  })

  it("loga estruturado com orgId, adminEmail e a mensagem do erro", async () => {
    await ensureAdminInvited("org-1", "admin@acme.com")
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("convite do admin falhou"),
      { orgId: "org-1", adminEmail: "admin@acme.com", authError: MENSAGEM },
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// CodeRabbit #522 — o status tem que ser VERDADEIRO depois do createUser
// ─────────────────────────────────────────────────────────────────────────────

describe("ensureAdminInvited — falhas DEPOIS do createUser não podem virar “invited”", () => {
  it("vínculo do auth_id falha → failed, com a mensagem, e sem limpar o convite pendente", async () => {
    updateErro = (tabela, payload, operacao) =>
      tabela === "users" && operacao === "update" && "auth_id" in payload
        ? erroDb("deadlock")
        : null

    const r = await ensureAdminInvited("org-1", "admin@acme.com")

    expect(r).toEqual({
      status: "failed",
      message: expect.stringContaining("não foi possível vinculá-la") as unknown as string,
    })
    // O campo continua preenchido: é ele que mantém o "Reenviar" disponível na tela.
    expect(chamadas.some((c) => c.metodo === "update" && c.tabela === "organizations")).toBe(false)
    // E não chegou a mandar e-mail nenhum.
    expect(emailsEnviados).toHaveLength(0)
  })

  it("generateLink devolve erro → failed", async () => {
    generateLinkResult = { data: null, error: { message: "rate limited" } }
    const r = await ensureAdminInvited("org-1", "admin@acme.com")
    expect(r).toEqual({ status: "failed", message: "rate limited" })
    expect(emailsEnviados).toHaveLength(0)
  })

  it("generateLink sem hashed_token → failed (era o furo que devolvia “invited”)", async () => {
    generateLinkResult = { data: { properties: {} }, error: null }
    const r = await ensureAdminInvited("org-1", "admin@acme.com")
    expect(r.status).toBe("failed")
    expect(emailsEnviados).toHaveLength(0)
    expect(chamadas.some((c) => c.metodo === "update" && c.tabela === "organizations")).toBe(false)
  })

  it("sendEmail devolve error (não lança) → failed", async () => {
    sendEmailResult = { id: null, error: "RESEND_API_KEY not configured" }
    const r = await ensureAdminInvited("org-1", "admin@acme.com")
    expect(r).toEqual({
      status: "failed",
      message: expect.stringContaining("RESEND_API_KEY not configured") as unknown as string,
    })
    expect(chamadas.some((c) => c.metodo === "update" && c.tabela === "organizations")).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// CodeRabbit #522 — e-mail divergente entre a linha pendente e o convite
// ─────────────────────────────────────────────────────────────────────────────

describe("ensureAdminInvited — reconciliação de e-mail da linha pendente", () => {
  beforeEach(() => {
    usersRows = [adminRow({ email: "antigo@acme.com", name: "antigo" })]
  })

  it("atualiza users.email para o endereço do convite", async () => {
    await ensureAdminInvited("org-1", "novo@acme.com")
    const update = chamadas.find(
      (c) => c.metodo === "update" && c.tabela === "users" && "email" in (c.args[0] as Linha),
    )
    expect(update?.args[0]).toEqual({ email: "novo@acme.com", name: "novo" })
  })

  it("reconcilia ANTES de criar a conta Auth", async () => {
    await ensureAdminInvited("org-1", "novo@acme.com")
    const iEmail = chamadas.findIndex(
      (c) => c.metodo === "update" && c.tabela === "users" && "email" in (c.args[0] as Linha),
    )
    const iAuth = chamadas.findIndex((c) => c.metodo === "createUser")
    expect(iEmail).toBeGreaterThanOrEqual(0)
    expect(iEmail).toBeLessThan(iAuth)
  })

  it("não reescreve nada quando o e-mail já é o mesmo", async () => {
    usersRows = [adminRow({ email: "admin@acme.com" })]
    await ensureAdminInvited("org-1", "admin@acme.com")
    expect(
      chamadas.some(
        (c) => c.metodo === "update" && c.tabela === "users" && "email" in (c.args[0] as Linha),
      ),
    ).toBe(false)
  })

  it("falha na reconciliação → failed, sem criar conta Auth órfã", async () => {
    updateErro = (tabela, payload, operacao) =>
      tabela === "users" && operacao === "update" && "email" in payload
        ? erroDb("constraint")
        : null
    const r = await ensureAdminInvited("org-1", "novo@acme.com")
    expect(r.status).toBe("failed")
    expect(chamadas.some((c) => c.metodo === "createUser")).toBe(false)
  })
})

describe("ensureAdminInvited — idempotência (AC-A3.2)", () => {
  it("admin já ativo: NÃO chama createUser", async () => {
    usersRows = [adminRow({ auth_id: "auth-1" })]
    expect(await ensureAdminInvited("org-1", "admin@acme.com")).toEqual({
      status: "already_active",
    })
    expect(chamadas.some((c) => c.metodo === "createUser")).toBe(false)
  })

  it("admin já ativo com e-mail novo pendente: limpa o campo e sinaliza emailIgnored (AC-A3.2b)", async () => {
    usersRows = [adminRow({ auth_id: "auth-1", email: "antigo@acme.com" })]
    orgRows = [{ id: "org-1", admin_invite_email: "novo@acme.com" }]

    const r = await ensureAdminInvited("org-1", "novo@acme.com")

    expect(r).toEqual({ status: "already_active", emailIgnored: true })
    const limpeza = chamadas.find((c) => c.metodo === "update" && c.tabela === "organizations")
    expect(limpeza?.args[0]).toEqual({ admin_invite_email: null })
    expect(chamadas.some((c) => c.metodo === "createUser")).toBe(false)
  })

  it("linha existe SEM auth_id: prossegue para createUser (não confunde `id` com `auth_id`)", async () => {
    // A mutação perigosa da AC-A3: trocar `admin?.auth_id` por `admin?.id` marcaria esta linha
    // como já ativa, porque `id` é sempre truthy — e reportaria "convite aceito" para quem
    // nunca recebeu conta nenhuma.
    usersRows = [adminRow()]
    expect(await ensureAdminInvited("org-1", "admin@acme.com")).toEqual({ status: "invited" })
    expect(chamadas.some((c) => c.metodo === "createUser")).toBe(true)
    expect(chamadas.some((c) => c.metodo === "insert" && c.tabela === "users")).toBe(false)
  })
})

describe("ensureAdminInvited — o fake filtra e ordena de verdade (CodeRabbit #522)", () => {
  it("desempata múltiplos admins pegando o MAIS ANTIGO (created_at ASC, limite 1)", async () => {
    // A linha mais antiga está ATIVA e vem por último no array de propósito: se o código
    // deixasse de ordenar, o fake devolveria `u-novo` primeiro e o resultado seria "invited".
    usersRows = [
      adminRow({ id: "u-novo", auth_id: null, created_at: "2026-06-01T00:00:00Z" }),
      adminRow({ id: "u-antigo", auth_id: "auth-antigo", created_at: "2020-01-01T00:00:00Z" }),
    ]

    expect(await ensureAdminInvited("org-1", "admin@acme.com")).toEqual({
      status: "already_active",
    })
    expect(chamadas.some((c) => c.metodo === "createUser")).toBe(false)
  })

  it("não enxerga o admin de OUTRA org (filtro de tenant é medido, não presumido)", async () => {
    // Só existe admin na org-2. Se o `.eq("org_id", …)` sumisse, esta linha seria escolhida e
    // a função devolveria "already_active" em vez de criar a linha da org-1.
    usersRows = [adminRow({ id: "u-alheio", org_id: "org-2", auth_id: "auth-alheio" })]

    expect(await ensureAdminInvited("org-1", "admin@acme.com")).toEqual({ status: "invited" })
    const insert = chamadas.find((c) => c.metodo === "insert" && c.tabela === "users")
    expect(insert?.args[0]).toMatchObject({ org_id: "org-1" })
  })

  it("não confunde admin com usuário de outro papel na mesma org", async () => {
    // Se o `.eq("role", "admin")` sumisse, este corretor seria tratado como o admin da org.
    usersRows = [adminRow({ id: "u-corretor", role: "broker", auth_id: "auth-corretor" })]

    expect(await ensureAdminInvited("org-1", "admin@acme.com")).toEqual({ status: "invited" })
    expect(chamadas.some((c) => c.metodo === "insert" && c.tabela === "users")).toBe(true)
  })

  it("erro na busca do admin devolve failed sem tocar no Supabase Auth", async () => {
    selectErro = erroDb("conexão caiu")
    expect(await ensureAdminInvited("org-1", "admin@acme.com")).toEqual({
      status: "failed",
      message: "conexão caiu",
    })
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

  it("loga quando o UPDATE falha — a perda do endereço não pode ser silenciosa", async () => {
    updateErro = (tabela) => (tabela === "organizations" ? erroDb("coluna ausente") : null)
    await persistAdminInviteEmail("org-1", "admin@acme.com")
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("falha ao persistir admin_invite_email"),
      { orgId: "org-1", adminEmail: "admin@acme.com", dbError: "coluna ausente" },
    )
  })
})
