/**
 * Story 75-289 (AC8) — a tela precisa distinguir TRÊS estados, não dois:
 * válido-permanente, válido-com-prazo e inválido. E "não deu para verificar"
 * jamais pode ser exibido como "inválido" (nem o contrário).
 */
import { describe, it, expect, vi } from "vitest"
import { interpretDebugToken, fetchTokenValidity } from "./token-validity"

describe("interpretDebugToken", () => {
  it("expires_at 0 → nunca expira (é a prova do token permanente)", () => {
    const v = interpretDebugToken({ is_valid: true, expires_at: 0, type: "SYSTEM_USER" })
    expect(v.valid).toBe(true)
    expect(v.neverExpires).toBe(true)
    expect(v.expiresAt).toBeNull()
    expect(v.label).toContain("nunca expira")
    expect(v.tokenType).toBe("SYSTEM_USER")
  })

  it("expires_at ausente também significa sem prazo", () => {
    expect(interpretDebugToken({ is_valid: true }).neverExpires).toBe(true)
  })

  it("token com prazo → conta os dias e avisa a data", () => {
    const em30Dias = Math.floor((Date.now() + 30 * 86_400_000) / 1000)
    const v = interpretDebugToken({ is_valid: true, expires_at: em30Dias, type: "SYSTEM_USER" })
    expect(v.valid).toBe(true)
    expect(v.neverExpires).toBe(false)
    expect(v.expiresAt).not.toBeNull()
    expect(v.label).toMatch(/expira em (29|30) dias/)
  })

  it("is_valid false → inválido (estado de incidente)", () => {
    const v = interpretDebugToken({ is_valid: false, type: "USER" })
    expect(v.valid).toBe(false)
    expect(v.label).toContain("recusando")
  })

  it("resposta vazia não é tratada como token bom", () => {
    expect(interpretDebugToken(null).valid).toBe(false)
    expect(interpretDebugToken(undefined).valid).toBe(false)
  })
})

describe("fetchTokenValidity", () => {
  it("sem credencial → null (a tela diz 'sem credencial', não 'inválido')", async () => {
    expect(await fetchTokenValidity(null)).toBeNull()
    expect(await fetchTokenValidity("")).toBeNull()
  })

  it("token permanente: devolve nunca expira", async () => {
    const fakeFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: { is_valid: true, expires_at: 0, type: "SYSTEM_USER" } }),
    })) as unknown as typeof fetch

    const v = await fetchTokenValidity("TOKEN-FALSO", fakeFetch)
    expect(v?.neverExpires).toBe(true)
  })

  it("falha de rede NÃO é 'token inválido' — vem com unknownReason", async () => {
    const fakeFetch = vi.fn(async () => {
      throw new Error("network down")
    }) as unknown as typeof fetch

    const v = await fetchTokenValidity("TOKEN-FALSO", fakeFetch)
    expect(v?.label).toBe("Não foi possível verificar")
    expect(v?.unknownReason).toContain("network down")
  })

  it("o token vai URL-encoded e não aparece em nenhuma mensagem de erro", async () => {
    const calls: string[] = []
    const fakeFetch = vi.fn(async (url: unknown) => {
      calls.push(String(url))
      throw new Error("boom")
    }) as unknown as typeof fetch

    const v = await fetchTokenValidity("tok/com+chars", fakeFetch)
    expect(calls[0]).toContain(encodeURIComponent("tok/com+chars"))
    // A mensagem devolvida à tela nunca carrega o segredo.
    expect(JSON.stringify(v)).not.toContain("tok/com+chars")
  })
})
