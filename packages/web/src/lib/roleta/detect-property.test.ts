import { describe, it, expect } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { detectPropertyInterestId } from "./detect-property"

/** Mock encadeável: properties resolve via `then` (await direto). */
function makeSupabase(properties: Array<{ id: string; name: string }> | null): SupabaseClient {
  return {
    from() {
      const builder: Record<string, unknown> = {}
      const chain = () => builder
      builder.select = chain
      builder.eq = chain
      builder.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: properties }).then(resolve)
      return builder
    },
  } as unknown as SupabaseClient
}

const PROPS = [
  { id: "vind-id", name: "Vind Residence" },
  { id: "yarden-id", name: "Yarden" },
]

describe("detectPropertyInterestId", () => {
  it("texto vazio → null", async () => {
    expect(await detectPropertyInterestId(makeSupabase(PROPS), "org", "", null, undefined)).toBeNull()
  })

  it("menção a 'vind' → Vind Residence", async () => {
    expect(await detectPropertyInterestId(makeSupabase(PROPS), "org", "Tenho interesse no Vind")).toBe("vind-id")
  })

  it("menção a 'yarden' (case-insensitive) → Yarden", async () => {
    expect(await detectPropertyInterestId(makeSupabase(PROPS), "org", "quero saber do YARDEN")).toBe("yarden-id")
  })

  it("nome completo 'vind residence' → Vind Residence", async () => {
    expect(await detectPropertyInterestId(makeSupabase(PROPS), "org", "Vind Residence 2 quartos")).toBe("vind-id")
  })

  it("ambíguo (cita os dois) → null (pool geral)", async () => {
    expect(await detectPropertyInterestId(makeSupabase(PROPS), "org", "vind ou yarden?")).toBeNull()
  })

  it("nenhuma menção → null", async () => {
    expect(await detectPropertyInterestId(makeSupabase(PROPS), "org", "quero um apartamento")).toBeNull()
  })

  it("vários textos (campanha + anúncio) — detecta no segundo", async () => {
    const r = await detectPropertyInterestId(makeSupabase(PROPS), "org", "Campanha Junho", "Anuncio Yarden Lancamento")
    expect(r).toBe("yarden-id")
  })

  it("erro na query → null (nunca lança)", async () => {
    const broken = { from() { throw new Error("db down") } } as unknown as SupabaseClient
    expect(await detectPropertyInterestId(broken, "org", "vind")).toBeNull()
  })
})
