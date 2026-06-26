import { describe, it, expect } from "vitest"
import { isUuid } from "./uuid"

describe("isUuid (Story 75-67)", () => {
  it("aceita UUID válido", () => {
    expect(isUuid("00000000-0000-0000-0004-000000000001")).toBe(true)
    expect(isUuid("a1b2c3d4-e5f6-7890-ab12-cd34ef56ab78")).toBe(true)
  })
  it("rejeita o placeholder literal de template (cru e url-encoded)", () => {
    expect(isUuid("{{1}}")).toBe(false)
    expect(isUuid("%7B%7B1%7D%7D")).toBe(false)
  })
  it("rejeita vazio/nulo/lixo", () => {
    expect(isUuid("")).toBe(false)
    expect(isUuid(null)).toBe(false)
    expect(isUuid(undefined)).toBe(false)
    expect(isUuid("123")).toBe(false)
    expect(isUuid("not-a-uuid")).toBe(false)
  })
  it("rejeita UUID com texto extra (âncora)", () => {
    expect(isUuid("00000000-0000-0000-0004-000000000001/foo")).toBe(false)
    expect(isUuid(" 00000000-0000-0000-0004-000000000001")).toBe(false)
  })
})
