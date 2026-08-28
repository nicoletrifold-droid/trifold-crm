/**
 * Story 900-22b (CodeRabbit #522) — contrato de exportação dos módulos que as suítes desta
 * story substituem por `vi.mock` de módulo inteiro.
 *
 * POR QUE ESTE ARQUIVO EXISTE: `vi.mock("@web/lib/supabase/admin", () => ({ createAdminClient:
 * ... }))` **fabrica** o símbolo. Se alguém renomear `createAdminClient`, mover o arquivo ou
 * remover a exportação, todas aquelas suítes continuam verdes — o mock supre o que sumiu — e a
 * quebra só aparece em runtime, no deploy. O mesmo vale para `sendEmail`,
 * `renderPasswordActionEmail`, `getPlatformAdmin`, `platformQuery` e `ensureAdminInvited`.
 *
 * Este arquivo é o único da story SEM nenhum `vi.mock`: ele importa os módulos de verdade e
 * assere que os símbolos existem e são funções. É barato e fecha exatamente o buraco entre
 * "o teste passa" e "o import funciona".
 *
 * NÃO EXECUTA nenhuma das funções — várias tocam rede ou env. O contrato aqui é de
 * EXISTÊNCIA e ARIDADE, não de comportamento; o comportamento está nas suítes mockadas.
 */
import { describe, it, expect } from "vitest"

describe("contrato de exportação — módulos mockados pelas suítes da 900-22b", () => {
  it("@web/lib/supabase/admin exporta createAdminClient", async () => {
    const mod = await import("@web/lib/supabase/admin")
    expect(typeof mod.createAdminClient).toBe("function")
  })

  it("@web/lib/email exporta sendEmail", async () => {
    const mod = await import("@web/lib/email")
    expect(typeof mod.sendEmail).toBe("function")
  })

  it("@web/lib/email-layout exporta renderPasswordActionEmail", async () => {
    const mod = await import("@web/lib/email-layout")
    expect(typeof mod.renderPasswordActionEmail).toBe("function")
  })

  it("@web/lib/tenancy/platform-guard exporta getPlatformAdmin e requirePlatformAdmin", async () => {
    const mod = await import("./platform-guard")
    expect(typeof mod.getPlatformAdmin).toBe("function")
    expect(typeof mod.requirePlatformAdmin).toBe("function")
  })

  it("@web/lib/tenancy/platform-query exporta platformQuery e a lista fechada", async () => {
    const mod = await import("./platform-query")
    expect(typeof mod.platformQuery).toBe("function")
    expect(Array.isArray(mod.PLATFORM_READABLE_TABLES)).toBe(true)
  })

  it("@web/lib/tenancy/admin-invite exporta as três funções que as rotas importam", async () => {
    const mod = await import("./admin-invite")
    expect(typeof mod.ensureAdminInvited).toBe("function")
    expect(typeof mod.persistAdminInviteEmail).toBe("function")
    expect(typeof mod.deriveAdminInviteStatus).toBe("function")
  })

  it("as funções mantêm a aridade que os chamadores usam", async () => {
    // Aridade é contrato barato e real: `ensureAdminInvited(orgId, email)` sendo reduzida a um
    // argumento passaria pelos mocks sem ninguém notar.
    const { ensureAdminInvited, persistAdminInviteEmail } = await import("./admin-invite")
    const { platformQuery } = await import("./platform-query")
    expect(ensureAdminInvited.length).toBe(2)
    expect(persistAdminInviteEmail.length).toBe(2)
    // 3 e não 2: `orgId?` é opcional no TypeScript mas não tem valor default, então continua
    // contando em `Function.length` (que só ignora parâmetros com default e rest).
    expect(platformQuery.length).toBe(3)
  })
})
