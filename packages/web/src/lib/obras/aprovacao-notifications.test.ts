import { describe, it, expect } from "vitest"
import { groupPendencias, renderDigestHtml, type PendenciaRow } from "./aprovacao-notifications"

const row = (over: Partial<PendenciaRow>): PendenciaRow => ({
  tipo: "documento",
  created_at: "2026-07-17T13:00:00Z",
  org_id: "org1",
  obra: { id: "obra1", name: "Vind Residence" },
  ...over,
})

describe("groupPendencias (Story 75-194)", () => {
  it("agrupa por org → obra com contagens por tipo e a mais antiga", () => {
    const g = groupPendencias([
      row({}),
      row({ created_at: "2026-07-16T09:00:00Z" }),
      row({ tipo: "foto" }),
      row({ obra: { id: "obra2", name: "Yarden" }, tipo: "foto", created_at: "2026-07-20T10:00:00Z" }),
      row({ org_id: "org2", obra: { id: "obra3", name: "Outra" } }),
    ])
    expect([...g.keys()].sort()).toEqual(["org1", "org2"])
    const org1 = g.get("org1")!
    const vind = org1.find((o) => o.obraId === "obra1")!
    expect(vind).toMatchObject({ documentos: 2, fotos: 1, maisAntiga: "2026-07-16T09:00:00Z" })
    expect(org1.find((o) => o.obraId === "obra2")).toMatchObject({ documentos: 0, fotos: 1 })
    expect(g.get("org2")).toHaveLength(1)
  })

  it("ignora pendência sem obra (join falho) e lida com vazio", () => {
    expect(groupPendencias([]).size).toBe(0)
    expect(groupPendencias([row({ obra: null })]).size).toBe(0)
  })
})

describe("renderDigestHtml", () => {
  it("lista obra com contagens, data e link de revisão", () => {
    const html = renderDigestHtml("Robson", [
      { obraId: "obra1", obraName: "Vind Residence", documentos: 14, fotos: 3, maisAntiga: "2026-07-17T13:00:00Z" },
    ])
    expect(html).toContain("Olá Robson")
    expect(html).toContain("14 documentos e 3 fotos")
    expect(html).toContain("Vind Residence")
    expect(html).toContain("?tab=aprovacoes")
    expect(html).toContain("17/07/2026")
  })
  it("singular correto", () => {
    const html = renderDigestHtml("Ana", [
      { obraId: "o", obraName: "X", documentos: 1, fotos: 0, maisAntiga: "2026-07-20T10:00:00Z" },
    ])
    expect(html).toContain("1 documento aguardando")
    expect(html).not.toContain("fotos")
  })
})
