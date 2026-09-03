/**
 * Story 900-65 · AC3/AC4/AC7/AC9 — o gate por host medido por **COMPORTAMENTO**, não por forma.
 *
 * ## Por que este arquivo existe (achado QA-900-65-3 do gate da 900-65)
 *
 * `lib/tenancy/papel-do-host.test.ts` cobre o `proxy.ts` por duas âncoras de **texto** (ordem na
 * pilha e presença/ausência de literais). Elas são necessárias — mas o gate mediu dois mutantes de
 * **inserção** que passavam `30/30` com `tsc` rc=0 e desviavam o caminho `"app"`, o exato caminho
 * que esta story existe para não tocar:
 *
 * - **M15** — `return new NextResponse(null, { status: 404 })` incondicional no topo do `proxy()`.
 *   Sobrevive porque `status: 404` continua ANTES do único `updateSession(request)`, que é tudo
 *   que a âncora de ordem sabe perguntar. **100% das requisições de `crm.trifold.eng.br` viram
 *   404.**
 * - **M16** — `url.pathname = "/platform"` acrescentado DEPOIS da linha correta do bounce em
 *   `lib/supabase/middleware.ts`. Sobrevive porque a âncora só exige a presença da chamada a
 *   `destinoDoBounceDeLogin(...)` e a ausência do literal antigo `url.pathname = "/dashboard"` —
 *   e o mutante preserva os dois. **Todo usuário logado da Trifold que revisita `/login` vai
 *   parar no console da plataforma.**
 *
 * Régua de forma não distingue "o texto certo está lá" de "o texto certo é o que executa". Este
 * arquivo faz a segunda pergunta.
 *
 * ## Onde o dublê foi posto, e por quê aí
 *
 * O dublê é `createServerClient` de `@supabase/ssr` — a **fronteira do Supabase**, não a fronteira
 * do módulo `updateSession`. Dublar `updateSession` mataria M15 e deixaria M16 vivo, porque o
 * bounce de `/login` mora DENTRO de `updateSession`. Com o dublê um nível abaixo, o `proxy()` e o
 * `updateSession()` são os **reais** em todos os testes daqui, e os dois mutantes morrem.
 *
 * O dublê ainda serve de sonda de **NÃO-chamada**, que é literalmente a AC7 ("caminho bloqueado
 * não chama `updateSession`", cujo custo real é o round-trip ao Supabase): no caminho bloqueado
 * `createServerClient` não é alcançado, e isso é asseverado — a ausência de um efeito, medida, e
 * não deduzida da leitura da ordem das linhas.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { NextRequest } from "next/server"

const criarCliente = vi.fn()

vi.mock("@supabase/ssr", () => ({
  createServerClient: (...args: unknown[]) => criarCliente(...args),
}))

// Importado DEPOIS do `vi.mock` de propósito: é o `proxy()` real, e ele importa o
// `updateSession()` real, que importa o `createServerClient` dublado.
const { proxy } = await import("./proxy")

const HOST_ADMIN = "admin.judtecnologia.com.br"
const HOST_TENANT = "crm.trifold.eng.br"

/** Cliente Supabase dublado. `usuario === null` ⇒ ninguém logado. */
function clienteFake(usuario: { id: string; app_metadata?: Record<string, unknown> } | null) {
  const consulta = {
    select: () => consulta,
    eq: () => consulta,
    maybeSingle: async () => ({ data: { is_active: true } }),
    single: async () => ({ data: { role: "admin" } }),
  }
  return {
    auth: {
      getUser: async () => ({ data: { user: usuario } }),
      signOut: async () => ({}),
    },
    from: () => consulta,
  }
}

function pedido(host: string, pathname: string): NextRequest {
  return new NextRequest(`https://${host}${pathname}`, { headers: { host } })
}

let envOriginal: string | undefined
beforeEach(() => {
  envOriginal = process.env["PLATFORM_ADMIN_HOSTS"]
  delete process.env["PLATFORM_ADMIN_HOSTS"]
  criarCliente.mockReset()
  criarCliente.mockImplementation(() => clienteFake(null))
})
afterEach(() => {
  if (envOriginal === undefined) delete process.env["PLATFORM_ADMIN_HOSTS"]
  else process.env["PLATFORM_ADMIN_HOSTS"] = envOriginal
})

// ---------------------------------------------------------------------------------------------
// M15 — o caminho `"app"` da Trifold, exercitado de ponta a ponta
// ---------------------------------------------------------------------------------------------

describe("AC9 — no host de inquilino o gate é transparente (carrasco de M15)", () => {
  it("com a env ligada, TODA rota do host de inquilino alcança o Supabase e nenhuma vira 404", async () => {
    process.env["PLATFORM_ADMIN_HOSTS"] = HOST_ADMIN
    // Estas quatro seriam `"bloqueado"` no host admin — é o que torna o teste discriminante.
    for (const pathname of ["/dashboard", "/api/webhook/whatsapp", "/broker", "/"]) {
      criarCliente.mockClear()
      const resposta = await proxy(pedido(HOST_TENANT, pathname))
      expect(criarCliente, `Supabase não foi tocado em ${pathname}`).toHaveBeenCalledTimes(1)
      expect(resposta.status, `${pathname} respondeu 404 no host de inquilino`).not.toBe(404)
      expect(resposta.headers.get("x-middleware-rewrite")).toBeNull()
    }
  })

  it("sem a env, até o próprio host admin alcança o Supabase — o gate nasce inerte", async () => {
    expect(process.env["PLATFORM_ADMIN_HOSTS"]).toBeUndefined()
    const resposta = await proxy(pedido(HOST_ADMIN, "/dashboard"))
    expect(criarCliente).toHaveBeenCalledTimes(1)
    expect(resposta.status).not.toBe(404)
  })
})

// ---------------------------------------------------------------------------------------------
// AC4/AC7 — o bloqueio é 404 nu e NÃO toca o Supabase (ausência de efeito, medida)
// ---------------------------------------------------------------------------------------------

describe("AC4/AC7 — no host admin, rota de produto é 404 nu sem round-trip ao Supabase", () => {
  beforeEach(() => {
    process.env["PLATFORM_ADMIN_HOSTS"] = HOST_ADMIN
  })

  it("responde 404 com corpo nulo e noindex, e createServerClient NÃO é chamado", async () => {
    for (const pathname of ["/dashboard", "/broker", "/api/webhook/whatsapp", "/cliente/x"]) {
      criarCliente.mockClear()
      const resposta = await proxy(pedido(HOST_ADMIN, pathname))
      expect(resposta.status, pathname).toBe(404)
      expect(resposta.headers.get("X-Robots-Tag")).toBe("noindex, nofollow")
      expect(await resposta.text()).toBe("")
      expect(criarCliente, `Supabase tocado no caminho bloqueado ${pathname}`).not.toHaveBeenCalled()
    }
  })

  it("a raiz é REESCRITA para /platform, sem redirect e sem tocar o Supabase", async () => {
    const resposta = await proxy(pedido(HOST_ADMIN, "/"))
    expect(resposta.status).toBe(200) // rewrite, não 307
    expect(new URL(resposta.headers.get("x-middleware-rewrite") ?? "").pathname).toBe("/platform")
    expect(criarCliente).not.toHaveBeenCalled()
  })

  it("as rotas do console e a porta de entrada seguem — e essas SIM tocam o Supabase", async () => {
    for (const pathname of ["/platform", "/platform/orgs", "/api/platform/orgs", "/login"]) {
      criarCliente.mockClear()
      const resposta = await proxy(pedido(HOST_ADMIN, pathname))
      expect(resposta.status, pathname).not.toBe(404)
      expect(criarCliente, pathname).toHaveBeenCalledTimes(1)
    }
  })
})

// ---------------------------------------------------------------------------------------------
// M16 — o bounce de /login, executado (não lido)
// ---------------------------------------------------------------------------------------------

describe("AC5 — o bounce de /login executa o destino certo (carrasco de M16)", () => {
  beforeEach(() => {
    criarCliente.mockImplementation(() => clienteFake({ id: "u1", app_metadata: { role: "admin" } }))
  })

  it("os DOIS destinos, na mesma asserção: inquilino → /dashboard, admin → /platform", async () => {
    process.env["PLATFORM_ADMIN_HOSTS"] = HOST_ADMIN
    const noTenant = await proxy(pedido(HOST_TENANT, "/login"))
    const noAdmin = await proxy(pedido(HOST_ADMIN, "/login"))
    const destino = (r: Response) => new URL(r.headers.get("location") ?? "").pathname
    // Juntas de propósito: a primeira sozinha ficaria verde se o bounce parasse de acontecer.
    expect([noTenant.status, destino(noTenant), noAdmin.status, destino(noAdmin)]).toEqual([
      307,
      "/dashboard",
      307,
      "/platform",
    ])
  })

  it("sem a env, o bounce do host admin também vai para /dashboard — nada muda sem ligar", async () => {
    expect(process.env["PLATFORM_ADMIN_HOSTS"]).toBeUndefined()
    const resposta = await proxy(pedido(HOST_ADMIN, "/login"))
    expect(new URL(resposta.headers.get("location") ?? "").pathname).toBe("/dashboard")
  })
})
