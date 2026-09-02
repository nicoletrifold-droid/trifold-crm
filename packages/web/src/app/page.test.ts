/**
 * A régua da SEGUNDA porta da frente: `app/page.tsx` — para onde vai quem abre `/` com sessão
 * viva (favorito, atalho da barra de endereço, aba reaberta).
 *
 * A Story 900-56 consertou `login/actions.ts` e mediu que o CRM não tinha link nenhum para
 * `/platform`. Esta rota ficou de fora: ela só age para quem JÁ tem cookie, então nenhum teste
 * de login a alcança, e ela continuava roteando só por `role`.
 *
 * ## Por que a régua mede `Home()` e não um helper extraído
 *
 * Mesma razão da irmã (`login/actions.test.ts`): extrair `resolverDestino()` e testar o helper
 * deixaria VERDE a mutação que mais importa — mudar o **argumento** no call site (ler a coluna
 * errada, ou não ler coluna nenhuma). A suíte do helper continuaria 100% verde e o operador da
 * plataforma continuaria caindo no CRM. Quem decide é o call site; é ele que está sob teste, com
 * o `redirect()` do Next instrumentado, que é a única saída observável desta função.
 *
 * ## As duas metades, e por que os conjuntos de morte precisam ser DISJUNTOS
 *
 *   • **metade 1** — quem é platform admin vai para `/platform`.
 *   • **metade 2** — quem NÃO é continua indo exatamente para onde ia.
 *
 * A metade 1 sozinha fica verde sob "manda todo mundo para `/platform`" — o defeito inverso, e
 * pior, porque o CRM sumiria para todo mundo. A metade 2 sozinha fica verde sob "ninguém vai
 * para `/platform`", que é literalmente o estado de antes. As mutações estão no Dev Agent Record:
 * cada uma mata UMA das metades, e a inversão da condição mata as duas.
 *
 * ## O fake projeta as colunas do `.select()`
 *
 * `criarFakeSupabase` — reúso, não cópia. É a projeção que dá carrasco à mutação "tirei
 * `is_platform_admin` do select": sem a coluna na projeção o campo chega `undefined` e a metade 1
 * fica vermelha. Um fake que devolvesse a linha inteira aprovaria essa mutação em silêncio.
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

vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new RedirecionouPara(destino)
  },
}))
vi.mock("@web/lib/supabase/server", () => ({ createClient: async () => clienteAtual() }))

const AUTH_ID = "auth-0001"

let clienteFake: ReturnType<typeof montarCliente> | null = null
let chamadas: ChamadaRegistrada[] = []
function clienteAtual() {
  if (!clienteFake) throw new Error("nenhum cliente fake montado para este teste")
  return clienteFake
}

interface Cenario {
  users: Linha[]
  /** `null` = `auth.getUser()` não devolve usuário nenhum. */
  authId?: string | null
}

function montarCliente(cenario: Cenario) {
  const base = criarFakeSupabase({ tabelas: { users: cenario.users }, chamadas })
  const authId = cenario.authId === undefined ? AUTH_ID : cenario.authId
  return {
    ...base,
    auth: {
      getUser: async () => ({ data: { user: authId === null ? null : { id: authId } } }),
    },
  }
}

/**
 * Roda `Home()` e devolve o destino do `redirect()`. Nunca inventa um destino: se a função
 * terminar sem redirecionar, a promessa rejeita — "não fez nada" não pode virar destino aprovado.
 */
async function destinoDaRaiz(cenario: Cenario): Promise<string> {
  clienteFake = montarCliente(cenario)
  const { default: Home } = await import("./page")
  try {
    await Home()
    throw new Error("Home() terminou sem redirect")
  } catch (e) {
    if (e instanceof RedirecionouPara) return e.destino
    throw e
  }
}

/** A linha de `users` que o `.eq("auth_id", …)` de `Home()` encontra. */
function usuario(campos: Linha): Linha {
  return { auth_id: AUTH_ID, role: "admin", is_platform_admin: false, ...campos }
}

beforeEach(() => {
  clienteFake = null
  chamadas = []
})

describe("app/page.tsx — vivacidade do instrumento", () => {
  it("sem sessão vai para /login (o harness distingue os desfechos)", async () => {
    // Sem este controle, "sempre manda para X" seria indistinguível de um harness que resolve
    // tudo pelo mesmo caminho.
    expect(await destinoDaRaiz({ users: [], authId: null })).toBe("/login")
  })

  it("a consulta de `users` de fato aconteceu (o fake não está mudo)", async () => {
    await destinoDaRaiz({ users: [usuario({})] })
    expect(chamadas.filter((c) => c.tabela === "users").length).toBeGreaterThan(0)
  })
})

describe("METADE 1 — quem é platform admin vai para o console", () => {
  it("platform admin com role `admin` → /platform", async () => {
    expect(await destinoDaRaiz({ users: [usuario({ is_platform_admin: true, role: "admin" })] })).toBe(
      "/platform",
    )
  })

  it("platform admin que TAMBÉM é `broker` → /platform (precedência declarada)", async () => {
    // `is_platform_admin` é ortogonal a `role`, e a ordem tem que ser a MESMA de
    // `login/actions.ts`. Duas portas da frente que discordam mandam a mesma pessoa para lugares
    // diferentes conforme o caminho — e o relato de quem reclama fica irreproduzível.
    expect(
      await destinoDaRaiz({ users: [usuario({ is_platform_admin: true, role: "broker" })] }),
    ).toBe("/platform")
  })
})

describe("METADE 2 — quem NÃO é platform admin continua indo para onde ia", () => {
  it("`broker` comum → /broker", async () => {
    expect(await destinoDaRaiz({ users: [usuario({ role: "broker" })] })).toBe("/broker")
  })

  it("`admin` comum → /dashboard", async () => {
    expect(await destinoDaRaiz({ users: [usuario({ role: "admin" })] })).toBe("/dashboard")
  })

  it("`is_platform_admin: false` explícito → /dashboard, não /platform", async () => {
    expect(await destinoDaRaiz({ users: [usuario({ is_platform_admin: false })] })).toBe(
      "/dashboard",
    )
  })

  it("linha de `users` ausente → /dashboard (o `undefined` não é tratado como plataforma)", async () => {
    // `appUser` é `null` quando o usuário do Auth não tem linha em `users`. A comparação é
    // `=== true` justamente para que ausência NUNCA vire acesso: `undefined` é o valor mais
    // provável de aparecer aqui num dia ruim, e ele não pode abrir o console.
    expect(await destinoDaRaiz({ users: [], authId: AUTH_ID })).toBe("/dashboard")
  })

  it("valor não-booleano em `is_platform_admin` não abre o console", async () => {
    // `"true"` (string) é o que um dado migrado errado pareceria. `Boolean("false")` é `true`;
    // `=== true` recusa os dois. Esta asserção morre se alguém trocar por `if (appUser?.
    // is_platform_admin)`.
    expect(
      await destinoDaRaiz({ users: [usuario({ is_platform_admin: "true", role: "admin" })] }),
    ).toBe("/dashboard")
  })
})
