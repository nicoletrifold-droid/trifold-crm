/**
 * Story 900-56 (defeito da porta de entrada) — a AUTORIDADE em que as duas metades se apoiam.
 *
 * `isPlatformAdmin()` existe desde a 75-314 e não tinha nenhum teste. Até esta story ela só
 * guardava três rotas de API de billing; agora ela decide se o atalho para o console aparece na
 * barra lateral do CRM, e "só para quem é platform admin" é uma afirmação que passa inteira por
 * aqui. Uma função que respondesse `true` para todo mundo deixaria as duas metades da régua
 * verdes — elas medem o componente e o login, não quem responde a pergunta.
 *
 * O fake é o `criarFakeSupabase` de `lib/tenancy/__fixtures__` (reúso): ele **filtra** de verdade
 * no `.eq()`, então "a função lê a linha do usuário certo" é reprovável, e não uma alegação.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  criarFakeSupabase,
  type Linha,
  type ErroPostgrest,
} from "@web/lib/tenancy/__fixtures__/fake-supabase-postgrest"

let clienteFake: ReturnType<typeof criarFakeSupabase> | null = null
vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => {
    if (!clienteFake) throw new Error("nenhum cliente fake montado para este teste")
    return clienteFake
  },
}))

const { isPlatformAdmin, atalhoDoConsole } = await import("./platform")

const EU = "user-eu"
const OUTRO = "user-outro"

function montar(users: Linha[], erro?: ErroPostgrest) {
  clienteFake = criarFakeSupabase({
    tabelas: { users },
    ...(erro ? { erroPorTabela: { users: erro } } : {}),
  })
}

beforeEach(() => {
  clienteFake = null
})

describe("isPlatformAdmin — quem é da plataforma", () => {
  it("coluna `true` → true", async () => {
    montar([{ id: EU, is_platform_admin: true }])
    expect(await isPlatformAdmin(EU)).toBe(true)
  })

  it("coluna `false` → false", async () => {
    montar([{ id: EU, is_platform_admin: false }])
    expect(await isPlatformAdmin(EU)).toBe(false)
  })

  it("coluna NULA (linha legada) → false", async () => {
    montar([{ id: EU, is_platform_admin: null }])
    expect(await isPlatformAdmin(EU)).toBe(false)
  })

  it("usuário inexistente → false", async () => {
    montar([{ id: OUTRO, is_platform_admin: true }])
    expect(await isPlatformAdmin(EU)).toBe(false)
  })

  it("lê a linha do usuário PEDIDO — nos DOIS sentidos", async () => {
    // Um sentido só é colinear: "o vizinho é admin e eu não sou" fica verde sob a mutação que
    // apaga o `.eq("id", …)`, porque duas linhas em `.maybeSingle()` viram `PGRST116` e o ramo
    // de erro também responde `false`. É o sentido INVERSO — o vizinho comum e eu admin — que
    // reprova a mutação: sem filtro ele responderia `false` para quem é.
    montar([
      { id: OUTRO, is_platform_admin: false },
      { id: EU, is_platform_admin: true },
    ])
    expect(await isPlatformAdmin(EU), "eu sou platform admin").toBe(true)
    expect(await isPlatformAdmin(OUTRO), "o vizinho não é").toBe(false)
  })

  it("erro de leitura → false (fecha fechado)", async () => {
    // Para uma PERMISSÃO, o lado seguro do erro é negar: uma falha transitória custa ao operador
    // um atalho, não custa ao CRM um painel exposto. É o inverso do que vale para uma CONTAGEM
    // exibida, onde não conseguir ler tem de GRITAR em vez de virar zero.
    montar([{ id: EU, is_platform_admin: true }], {
      code: "57014",
      message: "canceling statement due to statement timeout",
      details: "",
      hint: null,
    })
    expect(await isPlatformAdmin(EU)).toBe(false)
  })

  it("vivacidade: a mesma montagem produz `true` — o fake não responde `false` sempre", async () => {
    montar([{ id: EU, is_platform_admin: true }])
    expect(await isPlatformAdmin(EU)).toBe(true)
  })
})

describe("atalhoDoConsole — o que a autoridade vira na tela", () => {
  it("platform admin recebe o par {href,label}", () => {
    expect(atalhoDoConsole(true)).toEqual({ href: "/platform", label: "Painel da plataforma" })
  })

  it("quem não é recebe `null`", () => {
    expect(atalhoDoConsole(false)).toBeNull()
  })

  it("o objeto devolvido é novo a cada chamada — quem o receber não pode corromper a constante", () => {
    const primeiro = atalhoDoConsole(true)!
    primeiro.href = "/adulterado"
    expect(atalhoDoConsole(true)).toEqual({ href: "/platform", label: "Painel da plataforma" })
  })
})
