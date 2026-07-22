import { describe, it, expect } from "vitest"
import {
  COMMERCIAL_ROLE_RANK,
  commercialRoleAtLeast,
  canPullBolsaoDashboard,
} from "./roles-hierarchy"

describe("hierarquia comercial (Story 75-90)", () => {
  it("ranqueia de baixo pra cima: corretor < gerente-comercial < supervisor < admin", () => {
    expect(COMMERCIAL_ROLE_RANK.broker).toBeLessThan(COMMERCIAL_ROLE_RANK["gerente-comercial"])
    expect(COMMERCIAL_ROLE_RANK["gerente-comercial"]).toBeLessThan(COMMERCIAL_ROLE_RANK.supervisor)
    expect(COMMERCIAL_ROLE_RANK.supervisor).toBeLessThan(COMMERCIAL_ROLE_RANK.admin)
  })

  describe("commercialRoleAtLeast", () => {
    it("é cumulativa: nível pedido e todos ACIMA passam", () => {
      expect(commercialRoleAtLeast("gerente-comercial", "gerente-comercial")).toBe(true)
      expect(commercialRoleAtLeast("supervisor", "gerente-comercial")).toBe(true)
      expect(commercialRoleAtLeast("admin", "gerente-comercial")).toBe(true)
    })
    it("nível abaixo NÃO passa", () => {
      expect(commercialRoleAtLeast("broker", "gerente-comercial")).toBe(false)
    })
    it("sdr tem o mesmo nível do gerente-comercial (Story 75-204)", () => {
      expect(commercialRoleAtLeast("sdr", "gerente-comercial")).toBe(true)
      expect(commercialRoleAtLeast("sdr", "supervisor")).toBe(false)
      // bolsão continua fora do perfil sdr (módulo desligado na matriz)
      expect(canPullBolsaoDashboard("sdr")).toBe(false)
    })
    it("roles fora da escala comercial (obras, relacionamento, null) → false", () => {
      expect(commercialRoleAtLeast("obras", "gerente-comercial")).toBe(false)
      expect(commercialRoleAtLeast("gerente-relacionamento", "gerente-comercial")).toBe(false)
      expect(commercialRoleAtLeast(null, "gerente-comercial")).toBe(false)
      expect(commercialRoleAtLeast(undefined, "broker")).toBe(false)
    })
  })

  describe("canPullBolsaoDashboard — política atual (só gerente-comercial)", () => {
    it("gerente-comercial pode", () => {
      expect(canPullBolsaoDashboard("gerente-comercial")).toBe(true)
    })
    it("supervisor e admin NÃO (por ora — dependem de perfil de corretor; follow-up)", () => {
      expect(canPullBolsaoDashboard("supervisor")).toBe(false)
      expect(canPullBolsaoDashboard("admin")).toBe(false)
    })
    it("corretor e roles não-comerciais NÃO (corretor puxa pelo /broker)", () => {
      expect(canPullBolsaoDashboard("broker")).toBe(false)
      expect(canPullBolsaoDashboard("obras")).toBe(false)
      expect(canPullBolsaoDashboard(null)).toBe(false)
    })
  })
})
