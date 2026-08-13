// Story 75-300 — invariantes do registro de capabilities + tabela-verdade da resolução.
import { describe, expect, it } from "vitest"

import {
  CAPABILITIES,
  CAPABILITY_SEED,
  KNOWN_ROLES,
  VIRTUAL_GROUPS,
  capabilityGroup,
  resolveCapabilityDecision,
} from "./capabilities"
import { ALL_MODULES, SUBMODULE_MAP } from "./permissions-modules"

describe("registro de capabilities — invariantes (AC1)", () => {
  it("chaves são únicas", () => {
    const keys = CAPABILITIES.map((c) => c.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("toda chave tem exatamente 1 ponto (garante a herança de 1 nível do SQL)", () => {
    for (const { key } of CAPABILITIES) {
      expect(key.split(".").length, key).toBe(2)
      expect(key).toMatch(/^[a-z-]+\.[a-z_]+$/)
    }
  })

  it("todo prefixo é módulo real (ALL_MODULES) ou grupo virtual declarado", () => {
    const valid = new Set<string>([...ALL_MODULES, ...VIRTUAL_GROUPS])
    for (const { key } of CAPABILITIES) {
      expect(valid.has(capabilityGroup(key)), key).toBe(true)
    }
  })

  it("nenhum grupo virtual colide com módulo da sidebar", () => {
    for (const g of VIRTUAL_GROUPS) {
      expect(ALL_MODULES.includes(g), g).toBe(false)
    }
  })

  it("nenhuma chave de AÇÃO colide com sub-módulo (TELA) do SUBMODULE_MAP", () => {
    const telas = new Set(
      Object.values(SUBMODULE_MAP).flatMap((subs) => Object.keys(subs))
    )
    for (const { key } of CAPABILITIES) {
      expect(telas.has(key), key).toBe(false)
    }
  })

  it("todo role citado no seed é role conhecido", () => {
    const known = new Set<string>(KNOWN_ROLES)
    for (const { key, seed } of CAPABILITIES) {
      for (const role of seed) {
        expect(known.has(role), `${key} → ${role}`).toBe(true)
      }
      // seed sem duplicata
      expect(new Set(seed).size, key).toBe(seed.length)
    }
  })

  it("labels e descrições não-vazios", () => {
    for (const { key, label, description } of CAPABILITIES) {
      expect(label.trim().length, key).toBeGreaterThan(0)
      expect(description.trim().length, key).toBeGreaterThan(0)
    }
  })

  it("CAPABILITY_SEED cobre exatamente as chaves do registro", () => {
    expect(Object.keys(CAPABILITY_SEED).sort()).toEqual(
      CAPABILITIES.map((c) => c.key).sort()
    )
  })
})

describe("resolveCapabilityDecision — tabela-verdade da paridade app ↔ SQL (AC5)", () => {
  it("1. exceção exata NEGANDO vence tudo — inclusive admin com tudo liberado", () => {
    expect(
      resolveCapabilityDecision({
        isAdmin: true,
        exactException: false,
        exactRoleRow: true,
        parentException: true,
        parentRoleRow: true,
      })
    ).toBe(false)
  })

  it("2. exceção exata CONCEDENDO vence tudo — mesmo com o resto negado", () => {
    expect(
      resolveCapabilityDecision({
        isAdmin: false,
        exactException: true,
        exactRoleRow: false,
        parentException: false,
        parentRoleRow: false,
      })
    ).toBe(true)
  })

  it("3. admin sem exceções = true (fullMatrix)", () => {
    expect(resolveCapabilityDecision({ isAdmin: true })).toBe(true)
  })

  it("4. admin com exceção do PAI negada = false (exceção mesclada por cima do fullMatrix)", () => {
    expect(
      resolveCapabilityDecision({ isAdmin: true, parentException: false })
    ).toBe(false)
  })

  it("5. admin IGNORA linha do role (fullMatrix descarta) — linha exata false não nega admin", () => {
    expect(
      resolveCapabilityDecision({ isAdmin: true, exactRoleRow: false })
    ).toBe(true)
  })

  it("6. linha exata do perfil vence herança do pai (true sobre pai negado)", () => {
    expect(
      resolveCapabilityDecision({
        isAdmin: false,
        exactRoleRow: true,
        parentException: false,
        parentRoleRow: false,
      })
    ).toBe(true)
  })

  it("7. linha exata do perfil NEGANDO vence pai liberado — o caso 'módulo ON, ação OFF'", () => {
    expect(
      resolveCapabilityDecision({
        isAdmin: false,
        exactRoleRow: false,
        parentException: true,
        parentRoleRow: true,
      })
    ).toBe(false)
  })

  it("8. sem linha exata: exceção do pai vence linha do pai", () => {
    expect(
      resolveCapabilityDecision({
        isAdmin: false,
        parentException: true,
        parentRoleRow: false,
      })
    ).toBe(true)
    expect(
      resolveCapabilityDecision({
        isAdmin: false,
        parentException: false,
        parentRoleRow: true,
      })
    ).toBe(false)
  })

  it("9. só o módulo pai decide quando não há nada mais específico (herança)", () => {
    expect(
      resolveCapabilityDecision({ isAdmin: false, parentRoleRow: true })
    ).toBe(true)
    expect(
      resolveCapabilityDecision({ isAdmin: false, parentRoleRow: false })
    ).toBe(false)
  })

  it("10. nada em lugar nenhum = default-deny (vale p/ grupos virtuais sem módulo)", () => {
    expect(resolveCapabilityDecision({ isAdmin: false })).toBe(false)
  })
})
