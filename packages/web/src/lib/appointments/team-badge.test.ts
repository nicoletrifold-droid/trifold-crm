import { describe, it, expect } from "vitest"
import { teamBadge } from "./team-badge"

describe("teamBadge (Story 81-2)", () => {
  it("imob → badge IMOB violeta", () => {
    const b = teamBadge("imob")
    expect(b.label).toBe("IMOB")
    expect(b.chip).toContain("violet")
    expect(b.accent).toContain("violet")
  })
  it("house → badge HOUSE com paleta atual (sem violeta)", () => {
    const b = teamBadge("house")
    expect(b.label).toBe("HOUSE")
    expect(b.chip).not.toContain("violet")
    expect(b.accent).toContain("orange")
  })
  it("valor desconhecido/nulo cai em HOUSE (default do banco)", () => {
    expect(teamBadge(null).label).toBe("HOUSE")
    expect(teamBadge(undefined).label).toBe("HOUSE")
    expect(teamBadge("xxx").label).toBe("HOUSE")
  })
  it("labels e cores das equipes são distintos (requisito 'bater o olho')", () => {
    expect(teamBadge("house").label).not.toBe(teamBadge("imob").label)
    expect(teamBadge("house").chip).not.toBe(teamBadge("imob").chip)
    expect(teamBadge("house").accent).not.toBe(teamBadge("imob").accent)
  })
})
