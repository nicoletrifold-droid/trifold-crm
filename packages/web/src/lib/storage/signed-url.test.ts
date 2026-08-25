import { describe, it, expect, vi } from "vitest"
import { assinarCaminhos, VALIDADE_PADRAO_SEGUNDOS } from "./signed-url"
import type { SupabaseClient } from "@supabase/supabase-js"

function clienteFalso(resposta: unknown) {
  const createSignedUrls = vi.fn(async () => resposta)
  return {
    client: { storage: { from: () => ({ createSignedUrls }) } } as unknown as SupabaseClient,
    createSignedUrls,
  }
}

describe("assinarCaminhos", () => {
  it("devolve mapa path -> url", async () => {
    const { client } = clienteFalso({
      data: [{ path: "a.jpg", signedUrl: "https://x/a?token=1" }],
      error: null,
    })
    const m = await assinarCaminhos(client, "obra-fotos", ["a.jpg"])
    expect(m.get("a.jpg")).toBe("https://x/a?token=1")
  })

  it("assina em LOTE — uma chamada só, não uma por foto", async () => {
    const { client, createSignedUrls } = clienteFalso({ data: [], error: null })
    await assinarCaminhos(client, "obra-fotos", ["a.jpg", "b.jpg", "c.jpg"])
    expect(createSignedUrls).toHaveBeenCalledTimes(1)
  })

  it("deduplica caminhos repetidos", async () => {
    const { client, createSignedUrls } = clienteFalso({ data: [], error: null })
    await assinarCaminhos(client, "obra-fotos", ["a.jpg", "a.jpg", "b.jpg"])
    expect(createSignedUrls).toHaveBeenCalledWith(["a.jpg", "b.jpg"], VALIDADE_PADRAO_SEGUNDOS)
  })

  it("caminho que falha fica AUSENTE do mapa, não vira string vazia", async () => {
    const { client } = clienteFalso({
      data: [{ path: "a.jpg", signedUrl: null }, { path: "b.jpg", signedUrl: "https://x/b" }],
      error: null,
    })
    const m = await assinarCaminhos(client, "obra-fotos", ["a.jpg", "b.jpg"])
    expect(m.has("a.jpg")).toBe(false)
    expect(m.get("b.jpg")).toBe("https://x/b")
  })

  it("erro do Storage devolve mapa vazio em vez de estourar", async () => {
    const { client } = clienteFalso({ data: null, error: { message: "boom" } })
    await expect(assinarCaminhos(client, "obra-fotos", ["a.jpg"])).resolves.toEqual(new Map())
  })

  it("lista vazia não chama a rede", async () => {
    const { client, createSignedUrls } = clienteFalso({ data: [], error: null })
    await assinarCaminhos(client, "obra-fotos", [])
    expect(createSignedUrls).not.toHaveBeenCalled()
  })
})
