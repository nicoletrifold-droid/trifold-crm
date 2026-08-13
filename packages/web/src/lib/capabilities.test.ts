// Story 75-300 — invariantes do registro de capabilities + tabela-verdade da resolução.
import { describe, expect, it } from "vitest"

import {
  CAPABILITIES,
  CAPABILITY_SEED,
  ENFORCED_CAPABILITIES,
  KNOWN_ROLES,
  VIRTUAL_GROUPS,
  VIRTUAL_GROUP_LABELS,
  adminMatrixKeys,
  capabilityCellState,
  capabilityGroup,
  enforcedCapabilitiesByGroup,
  resolveCapabilityDecision,
  roleEligibleForCapability,
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

describe("enforced — regra anti-'botão que mente' (75-301, AC1)", () => {
  it("enforced = exatamente os módulos já migrados (75-301 piloto + 75-302)", () => {
    expect(ENFORCED_CAPABILITIES.map((c) => c.key)).toEqual([
      "pastas.gerenciar",
      "marketing.gerenciar",
    ])
  })

  it("todo grupo VIRTUAL com capability enforced tem label de exibição", () => {
    for (const cap of ENFORCED_CAPABILITIES) {
      const group = capabilityGroup(cap.key)
      if ((VIRTUAL_GROUPS as readonly string[]).includes(group)) {
        const label =
          VIRTUAL_GROUP_LABELS[group as keyof typeof VIRTUAL_GROUP_LABELS]
        expect(label?.trim().length, cap.key).toBeGreaterThan(0)
      }
    }
  })

  it("todo grupo virtual declarado tem label (à prova de F3)", () => {
    for (const g of VIRTUAL_GROUPS) {
      expect(VIRTUAL_GROUP_LABELS[g]?.trim().length, g).toBeGreaterThan(0)
    }
  })

  it("enforcedCapabilitiesByGroup agrupa pelo prefixo", () => {
    const byGroup = enforcedCapabilitiesByGroup()
    expect(Object.keys(byGroup).sort()).toEqual(["marketing", "pastas"])
    expect(byGroup["marketing"]?.map((c) => c.key)).toEqual(["marketing.gerenciar"])
    expect(byGroup["pastas"]?.map((c) => c.key)).toEqual(["pastas.gerenciar"])
  })
})

describe("capabilityCellState — exibição espelha a resolução real (75-301, risco 2/4)", () => {
  it("admin: sempre ON e TRAVADO (fullMatrix ignora a linha do role)", () => {
    expect(
      capabilityCellState({ isAdminRole: true, explicit: false, parentGranted: false })
    ).toEqual({ checked: true, locked: true })
  })

  it("não-admin: linha explícita manda; sem linha, herda o pai; virtual herda false", () => {
    expect(
      capabilityCellState({ isAdminRole: false, explicit: false, parentGranted: true })
    ).toEqual({ checked: false, locked: false })
    expect(
      capabilityCellState({ isAdminRole: false, parentGranted: true })
    ).toEqual({ checked: true, locked: false })
    expect(
      capabilityCellState({ isAdminRole: false, parentGranted: false })
    ).toEqual({ checked: false, locked: false })
  })

  it("CONSISTÊNCIA: para todo caso sem exceção de usuário, exibição === resolução da F1", () => {
    for (const isAdminRole of [true, false]) {
      for (const explicit of [true, false, undefined]) {
        for (const parentGranted of [true, false]) {
          const shown = capabilityCellState({ isAdminRole, explicit, parentGranted })
          const resolved = resolveCapabilityDecision({
            isAdmin: isAdminRole,
            exactRoleRow: explicit,
            parentRoleRow: parentGranted,
          })
          expect(shown.checked, JSON.stringify({ isAdminRole, explicit, parentGranted })).toBe(resolved)
        }
      }
    }
  })
})

describe("adminMatrixKeys — fix do T6 da 75-301 (admin × grupo virtual)", () => {
  it("cobre todos os módulos E todos os grupos virtuais", () => {
    const keys = adminMatrixKeys(ALL_MODULES)
    for (const m of ALL_MODULES) expect(keys, m).toContain(m)
    for (const g of VIRTUAL_GROUPS) expect(keys, g).toContain(g)
  })
})

describe("75-302 — Pastas via capability (espelho + elegibilidade)", () => {
  it("seed de pastas.gerenciar espelha a antiga PASTA_MANAGER_ROLES; demais fora", () => {
    const seed = [...CAPABILITY_SEED["pastas.gerenciar"]]
    expect(seed.sort()).toEqual(["admin", "gerente-comercial", "imob", "supervisor"])
    for (const role of ["broker", "sdr", "obras", "gerente-relacionamento", "consultoria", "social-media"]) {
      expect((seed as string[]).includes(role), role).toBe(false)
    }
  })

  it("roleEligibleForCapability — o caso Silmara: role customizado SEM linha explícita herda o MÓDULO ligado", () => {
    expect(
      roleEligibleForCapability({ roleName: "auxadministrativo", moduleRow: true })
    ).toBe(true)
  })

  it("roleEligibleForCapability — linha explícita FALSE bloqueia mesmo com módulo ligado", () => {
    expect(
      roleEligibleForCapability({ roleName: "broker", explicitRow: false, moduleRow: true })
    ).toBe(false)
  })

  it("roleEligibleForCapability — admin sempre elegível; nada em lugar nenhum nega", () => {
    expect(roleEligibleForCapability({ roleName: "admin" })).toBe(true)
    expect(roleEligibleForCapability({ roleName: "corretor-novo" })).toBe(false)
  })
})
