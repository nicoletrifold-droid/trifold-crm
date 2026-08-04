import { describe, it, expect } from "vitest"
import { OPENING_PRIVILEGED_ROLES, canShowOpeningMenu } from "./opening-roles"

// Story 75-267 — gate de exibição do menu de abertura (drawer/composer).

describe("OPENING_PRIVILEGED_ROLES", () => {
  it("inclui sdr (o modelo SDR é o motivo da story)", () => {
    expect(OPENING_PRIVILEGED_ROLES).toContain("sdr")
  })

  it("não inclui broker nem imob (broker só via dono; imob nunca)", () => {
    expect(OPENING_PRIVILEGED_ROLES).not.toContain("broker")
    expect(OPENING_PRIVILEGED_ROLES).not.toContain("imob")
  })
})

describe("canShowOpeningMenu", () => {
  it("role privilegiado vê o menu para lead de qualquer corretor", () => {
    for (const role of OPENING_PRIVILEGED_ROLES) {
      expect(canShowOpeningMenu(role, false)).toBe(true)
    }
  })

  it("corretor dono vê o menu (comportamento que o /broker já tem)", () => {
    expect(canShowOpeningMenu("broker", true)).toBe(true)
  })

  it("corretor NÃO-dono não vê o menu para lead alheio (AC7)", () => {
    expect(canShowOpeningMenu("broker", false)).toBe(false)
  })

  it("imob não vê o menu, mesmo sendo o responsável do lead (AC5)", () => {
    expect(canShowOpeningMenu("imob", true)).toBe(false)
    expect(canShowOpeningMenu("imob", false)).toBe(false)
  })

  it("roles fora da lista / role ausente não veem o menu (AC5)", () => {
    expect(canShowOpeningMenu("obras", false)).toBe(false)
    expect(canShowOpeningMenu("", false)).toBe(false)
    expect(canShowOpeningMenu(null, true)).toBe(false)
    expect(canShowOpeningMenu(undefined, false)).toBe(false)
  })
})
