/**
 * Story 900-56 (defeito da porta de entrada) — METADE A da régua: **para onde o login manda**.
 *
 * O dono do produto logou com a conta de plataforma e caiu no CRM de uma empresa vazia. A causa
 * medida: `login()` tinha ramo para `broker`, `cliente`, `obras`/`gerente-relacionamento` e um
 * `else` que varria todo o resto para `/dashboard` — nenhum ramo lia `is_platform_admin`.
 *
 * ## Por que o teste mede `login()` e não um helper extraído
 *
 * Extrair `resolverDestino()` e testar o helper deixaria VERDE a mutação que importa mais: mudar
 * o **argumento** no call site (ler a coluna errada, ou não ler nenhuma). A suíte do helper
 * continuaria 100% verde e o platform admin continuaria caindo no CRM. Quem decide é o call
 * site, então é o call site que está sob teste — com o `redirect()` do Next instrumentado, que é
 * a única saída observável da função.
 *
 * ## As duas metades, e por que os conjuntos de morte precisam ser DISJUNTOS
 *
 *   • **metade 1** — quem é platform admin vai para `/platform`.
 *   • **metade 2** — quem NÃO é continua indo exatamente para onde ia.
 *
 * Uma régua com a metade 1 sozinha fica verde sob "manda todo mundo para `/platform`", que é o
 * defeito inverso e pior (o CRM some para 113 pessoas). Uma com a metade 2 sozinha fica verde
 * sob "ninguém vai para `/platform`", que é o defeito de hoje. As mutações estão nomeadas no
 * Dev Agent Record da story: cada uma mata UMA das metades, e a inversão mata as duas.
 *
 * ## O fake
 *
 * `criarFakeSupabase` (`lib/tenancy/__fixtures__`) — reúso, não cópia. Ele **projeta** as colunas
 * do `.select()`, e é isso que dá carrasco à mutação "tirei `is_platform_admin` do select": sem a
 * coluna na projeção o campo chega `undefined` e a metade 1 fica vermelha. Um fake que devolvesse
 * a linha inteira aprovaria essa mutação.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  criarFakeSupabase,
  type ChamadaRegistrada,
  type Linha,
} from "@web/lib/tenancy/__fixtures__/fake-supabase-postgrest"

/** Erro que o `redirect()` instrumentado lança, carregando o destino. */
class RedirecionouPara extends Error {
  constructor(public readonly destino: string) {
    super(`redirect(${destino})`)
  }
}

vi.mock("next/cache", () => ({ revalidatePath: () => {} }))
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new RedirecionouPara(destino)
  },
}))
vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }))
vi.mock("@web/lib/email", () => ({ sendEmail: async () => ({ error: null }) }))
vi.mock("@web/lib/email-layout", () => ({
  renderPasswordActionEmail: () => ({ subject: "", html: "" }),
}))
vi.mock("@web/lib/auth/password-reset-throttle", () => ({
  isPasswordResetThrottled: async () => false,
  recordPasswordResetAttempt: async () => {},
}))
vi.mock("@web/lib/audit", () => ({ logAudit: async () => {} }))
vi.mock("@web/lib/supabase/admin", () => ({ createAdminClient: () => clienteAtual() }))
vi.mock("@web/lib/supabase/server", () => ({ createClient: async () => clienteAtual() }))

const AUTH_ID = "auth-0001"
const USER_ID = "user-0001"
const ORG_ID = "org-0001"

let clienteFake: ReturnType<typeof montarCliente> | null = null
let chamadas: ChamadaRegistrada[] = []
function clienteAtual() {
  if (!clienteFake) throw new Error("nenhum cliente fake montado para este teste")
  return clienteFake
}

/** Erro de credencial, quando o teste quer o caminho de falha em vez do de sucesso. */
interface Cenario {
  users: Linha[]
  cliente_obras?: Linha[]
  erroDeCredencial?: boolean
  /** `null` = `auth.getUser()` não devolve usuário nenhum. */
  authId?: string | null
}

function montarCliente(cenario: Cenario) {
  const base = criarFakeSupabase({
    tabelas: {
      users: cenario.users,
      cliente_obras: cenario.cliente_obras ?? [],
    },
    chamadas,
  })
  const authId = cenario.authId === undefined ? AUTH_ID : cenario.authId
  return {
    ...base,
    auth: {
      signInWithPassword: async () =>
        cenario.erroDeCredencial
          ? { data: null, error: { message: "Invalid login credentials" } }
          : { data: {}, error: null },
      getUser: async () => ({ data: { user: authId === null ? null : { id: authId } } }),
    },
  }
}

function formulario(): FormData {
  const fd = new FormData()
  fd.set("email", "quem@exemplo.com")
  fd.set("password", "senha-qualquer")
  return fd
}

/**
 * Roda `login()` e devolve o destino do `redirect()`, ou `{ erro }` quando a função retorna em
 * vez de redirecionar. Nunca inventa um destino: se `login()` terminar sem redirect e sem erro,
 * a promessa rejeita — um "não fez nada" não pode virar um destino aprovado.
 */
async function destinoDoLogin(cenario: Cenario): Promise<string | { erro: string }> {
  clienteFake = montarCliente(cenario)
  const { login } = await import("./actions")
  try {
    const resultado = await login(formulario())
    if (resultado && typeof resultado === "object" && "error" in resultado) {
      return { erro: String(resultado.error) }
    }
    throw new Error("login() terminou sem redirect e sem erro")
  } catch (e) {
    if (e instanceof RedirecionouPara) return e.destino
    throw e
  }
}

/** A linha de `users` que o `.eq("auth_id", …)` do `login()` encontra. */
function usuario(campos: Linha): Linha {
  return {
    id: USER_ID,
    auth_id: AUTH_ID,
    name: "Quem Entrou",
    org_id: ORG_ID,
    is_platform_admin: false,
    ...campos,
  }
}

beforeEach(() => {
  clienteFake = null
  chamadas = []
})

describe("login() — vivacidade do instrumento", () => {
  it("credencial inválida RETORNA erro e não redireciona", async () => {
    // Sem este controle, "sempre redireciona" seria indistinguível de "o instrumento sempre
    // lança": as asserções de destino ficariam verdes por construção do harness.
    expect(await destinoDoLogin({ users: [usuario({})], erroDeCredencial: true })).toEqual({
      erro: "Email ou senha incorretos",
    })
  })

  it("sessão sem usuário RETORNA erro e não redireciona", async () => {
    expect(await destinoDoLogin({ users: [usuario({})], authId: null })).toEqual({
      erro: "Erro ao autenticar",
    })
  })

  it("a consulta de `users` de fato aconteceu (o fake não está mudo)", async () => {
    await destinoDoLogin({ users: [usuario({})] })
    expect(chamadas.filter((c) => c.tabela === "users").length).toBeGreaterThan(0)
  })
})

describe("METADE 1 — quem é platform admin vai para o console", () => {
  it("platform admin com role `admin` → /platform", async () => {
    expect(await destinoDoLogin({ users: [usuario({ is_platform_admin: true, role: "admin" })] })).toBe(
      "/platform"
    )
  })

  it("platform admin que TAMBÉM é `broker` → /platform (precedência declarada)", async () => {
    // `is_platform_admin` é ortogonal a `role`. Este caso não existe em nenhum dos dois bancos
    // hoje (medido: 0 colisões em teste e em produção), e é justamente por isso que o desfecho
    // precisa estar escrito antes de existir.
    expect(
      await destinoDoLogin({ users: [usuario({ is_platform_admin: true, role: "broker" })] })
    ).toBe("/platform")
  })

  it("platform admin que TAMBÉM é `cliente` → /platform, e a obra do cliente nem é consultada", async () => {
    const destino = await destinoDoLogin({
      users: [usuario({ is_platform_admin: true, role: "cliente" })],
      cliente_obras: [{ user_id: USER_ID, obra_id: "obra-77", is_primary: true }],
    })
    expect(destino).toBe("/platform")
    // A precedência mora num lugar só: se ela vazasse para o call site, a consulta de
    // `cliente_obras` continuaria acontecendo mesmo com o destino já decidido.
    expect(chamadas.filter((c) => c.tabela === "cliente_obras")).toEqual([])
  })

  it("platform admin que TAMBÉM é `obras` → /platform", async () => {
    expect(
      await destinoDoLogin({ users: [usuario({ is_platform_admin: true, role: "obras" })] })
    ).toBe("/platform")
  })
})

describe("METADE 2 — quem NÃO é platform admin continua indo para onde ia", () => {
  it("admin comum → /dashboard", async () => {
    expect(
      await destinoDoLogin({ users: [usuario({ is_platform_admin: false, role: "admin" })] })
    ).toBe("/dashboard")
  })

  it("coluna NULA (usuário legado) → /dashboard, não /platform", async () => {
    // Fail-closed: o default da migration 228 é `false`, mas uma linha legada com `null` não
    // pode virar acesso de plataforma por causa de um `!= false` mal escrito.
    expect(
      await destinoDoLogin({ users: [usuario({ is_platform_admin: null, role: "admin" })] })
    ).toBe("/dashboard")
  })

  it("coluna AUSENTE da projeção → /dashboard, não /platform", async () => {
    // O caso "o `.select()` não pediu a coluna". O rótulo é a ausência de verdade — passar
    // `undefined` explicitamente seria a mesma coisa só por acidente do fake.
    const semColuna = usuario({ role: "admin" })
    delete semColuna.is_platform_admin
    expect(await destinoDoLogin({ users: [semColuna] })).toBe("/dashboard")
  })

  it("broker comum → /broker", async () => {
    expect(
      await destinoDoLogin({ users: [usuario({ is_platform_admin: false, role: "broker" })] })
    ).toBe("/broker")
  })

  it("cliente comum com uma obra → /cliente/{obra}", async () => {
    expect(
      await destinoDoLogin({
        users: [usuario({ is_platform_admin: false, role: "cliente" })],
        cliente_obras: [{ user_id: USER_ID, obra_id: "obra-77", is_primary: true }],
      })
    ).toBe("/cliente/obra-77")
  })

  it("cliente comum com duas obras → /cliente/selecionar", async () => {
    expect(
      await destinoDoLogin({
        users: [usuario({ is_platform_admin: false, role: "cliente" })],
        cliente_obras: [
          { user_id: USER_ID, obra_id: "obra-77", is_primary: true },
          { user_id: USER_ID, obra_id: "obra-88", is_primary: false },
        ],
      })
    ).toBe("/cliente/selecionar")
  })

  it("obras → /dashboard/obras", async () => {
    expect(
      await destinoDoLogin({ users: [usuario({ is_platform_admin: false, role: "obras" })] })
    ).toBe("/dashboard/obras")
  })

  it("gerente-relacionamento → /dashboard/obras", async () => {
    expect(
      await destinoDoLogin({
        users: [usuario({ is_platform_admin: false, role: "gerente-relacionamento" })],
      })
    ).toBe("/dashboard/obras")
  })
})
