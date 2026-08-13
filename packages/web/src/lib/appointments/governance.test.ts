import { describe, it, expect } from "vitest"
import { canMutateAppointment, overlaps, isConflict } from "./governance"
import { CAPABILITY_SEED } from "@web/lib/capabilities"

// 75-307: a decisão agora é por GRANTS (capabilities). Derivamos os grants de cada
// role do PRÓPRIO SEED — assim estes testes provam que a matriz do diretor
// (Stories 75-103/81-3/75-204) sobrevive intacta sob o modelo novo.
const grantsFor = (role: string) => ({
  house: role === "admin" || (CAPABILITY_SEED["agenda.gerenciar_house"] as readonly string[]).includes(role),
  imob: role === "admin" || (CAPABILITY_SEED["agenda.gerenciar_imob"] as readonly string[]).includes(role),
})

describe("canMutateAppointment (Story 75-103)", () => {
  const internal = { broker_id: "broker-1", calendly_event_uri: null, team: "house" }
  const calendly = { broker_id: null, calendly_event_uri: "https://calendly.com/evt/abc", team: "house" }

  it("dono (corretor atribuído) pode", () => {
    expect(canMutateAppointment(grantsFor("broker"), "broker-1", internal)).toBe(true)
  })
  it("outro corretor NÃO pode", () => {
    expect(canMutateAppointment(grantsFor("broker"), "broker-2", internal)).toBe(false)
  })
  it("admin/supervisor/gerente-comercial podem no HOUSE (mesmo sem ser dono)", () => {
    expect(canMutateAppointment(grantsFor("admin"), "x", internal)).toBe(true)
    expect(canMutateAppointment(grantsFor("supervisor"), "x", internal)).toBe(true)
    expect(canMutateAppointment(grantsFor("gerente-comercial"), "x", internal)).toBe(true)
  })
  it("sdr espelha o gerente-comercial no HOUSE, mas NÃO no IMOB (Story 75-204)", () => {
    expect(canMutateAppointment(grantsFor("sdr"), "x", internal)).toBe(true)
    expect(
      canMutateAppointment(grantsFor("sdr"), "x", { broker_id: null, calendly_event_uri: null, team: "imob" })
    ).toBe(false)
  })
  it("perfil não privilegiado e não-dono NÃO pode no HOUSE (ex.: imob/consultoria)", () => {
    expect(canMutateAppointment(grantsFor("imob"), "x", internal)).toBe(false)
    expect(canMutateAppointment(grantsFor("consultoria"), "x", internal)).toBe(false)
  })
  it("Calendly (sem dono interno) é livre pra qualquer um", () => {
    expect(canMutateAppointment(grantsFor("imob"), "x", calendly)).toBe(true)
    expect(canMutateAppointment(grantsFor("broker"), "qualquer", calendly)).toBe(true)
  })
})

describe("canMutateAppointment por equipe (Story 81-3 — matriz do diretor)", () => {
  const houseAppt = { broker_id: "broker-1", calendly_event_uri: null, team: "house" }
  const imobAppt = { broker_id: null, calendly_event_uri: null, team: "imob" }

  it("admin/supervisor mexem em TUDO (house e imob)", () => {
    for (const role of ["admin", "supervisor"]) {
      expect(canMutateAppointment(grantsFor(role), "x", houseAppt)).toBe(true)
      expect(canMutateAppointment(grantsFor(role), "x", imobAppt)).toBe(true)
    }
  })
  it("gerente-comercial mexe no HOUSE mas NÃO no IMOB (mudança vs 75-103)", () => {
    expect(canMutateAppointment(grantsFor("gerente-comercial"), "x", houseAppt)).toBe(true)
    expect(canMutateAppointment(grantsFor("gerente-comercial"), "x", imobAppt)).toBe(false)
  })
  it("perfil imob (Daiana) mexe no IMOB (mesmo sem ser dono) mas NÃO no HOUSE", () => {
    expect(canMutateAppointment(grantsFor("imob"), "daiana", imobAppt)).toBe(true)
    expect(canMutateAppointment(grantsFor("imob"), "daiana", houseAppt)).toBe(false)
  })
  it("dono house NÃO mexe se o compromisso for IMOB (mesmo sendo broker_id)", () => {
    const imobComBroker = { broker_id: "broker-1", calendly_event_uri: null, team: "imob" }
    expect(canMutateAppointment(grantsFor("broker"), "broker-1", imobComBroker)).toBe(false)
  })
  it("corretor comum não mexe no IMOB", () => {
    expect(canMutateAppointment(grantsFor("broker"), "qualquer", imobAppt)).toBe(false)
  })
  it("team ausente/desconhecido = HOUSE (fallback consistente com 81-1/81-2)", () => {
    const semTeam = { broker_id: "broker-1", calendly_event_uri: null }
    expect(canMutateAppointment(grantsFor("broker"), "broker-1", semTeam)).toBe(true)
    expect(canMutateAppointment(grantsFor("gerente-comercial"), "x", { ...semTeam, team: undefined })).toBe(true)
    expect(canMutateAppointment(grantsFor("imob"), "x", { ...semTeam, team: null })).toBe(false)
  })
})

describe("overlaps", () => {
  it("detecta sobreposição", () => {
    expect(overlaps(100, 200, 150, 250)).toBe(true)
    expect(overlaps(100, 200, 200, 300)).toBe(false) // encosta, não sobrepõe
    expect(overlaps(100, 200, 300, 400)).toBe(false)
  })
})

describe("isConflict (Story 81-9 — por horário, independente do local)", () => {
  const cand = { start: 1000, end: 2000, team: "house" as const }

  it("mesma equipe + sobreposto = conflito (o local não importa)", () => {
    expect(isConflict(cand, { start: 1500, end: 2500, team: "house" })).toBe(true)
  })
  it("mesma equipe SEM sobreposição = sem conflito", () => {
    expect(isConflict(cand, { start: 3000, end: 4000, team: "house" })).toBe(false)
    expect(isConflict(cand, { start: 2000, end: 3000, team: "house" })).toBe(false) // encosta
  })
})

describe("isConflict por equipe (Story 81-1 — Epic 81 HOUSE × IMOB)", () => {
  const house = { start: 1000, end: 2000, team: "house" as const }
  const imob = { start: 1000, end: 2000, team: "imob" as const }

  it("equipes DIFERENTES + mesmo horário = NÃO conflita (decisão do diretor)", () => {
    expect(isConflict(house, imob)).toBe(false)
    expect(isConflict(imob, house)).toBe(false)
  })
  it("MESMA equipe imob + sobreposto = conflita (regra intra-equipe)", () => {
    expect(isConflict(imob, { start: 1500, end: 2500, team: "imob" })).toBe(true)
  })
})
