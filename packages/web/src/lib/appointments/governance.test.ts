import { describe, it, expect } from "vitest"
import { canMutateAppointment, overlaps, isConflict } from "./governance"

describe("canMutateAppointment (Story 75-103)", () => {
  const internal = { broker_id: "broker-1", calendly_event_uri: null, team: "house" }
  const calendly = { broker_id: null, calendly_event_uri: "https://calendly.com/evt/abc", team: "house" }

  it("dono (corretor atribuído) pode", () => {
    expect(canMutateAppointment("broker", "broker-1", internal)).toBe(true)
  })
  it("outro corretor NÃO pode", () => {
    expect(canMutateAppointment("broker", "broker-2", internal)).toBe(false)
  })
  it("admin/supervisor/gerente-comercial podem no HOUSE (mesmo sem ser dono)", () => {
    expect(canMutateAppointment("admin", "x", internal)).toBe(true)
    expect(canMutateAppointment("supervisor", "x", internal)).toBe(true)
    expect(canMutateAppointment("gerente-comercial", "x", internal)).toBe(true)
  })
  it("perfil não privilegiado e não-dono NÃO pode no HOUSE (ex.: imob/consultoria)", () => {
    expect(canMutateAppointment("imob", "x", internal)).toBe(false)
    expect(canMutateAppointment("consultoria", "x", internal)).toBe(false)
  })
  it("Calendly (sem dono interno) é livre pra qualquer um", () => {
    expect(canMutateAppointment("imob", "x", calendly)).toBe(true)
    expect(canMutateAppointment("broker", "qualquer", calendly)).toBe(true)
  })
})

describe("canMutateAppointment por equipe (Story 81-3 — matriz do diretor)", () => {
  const houseAppt = { broker_id: "broker-1", calendly_event_uri: null, team: "house" }
  const imobAppt = { broker_id: null, calendly_event_uri: null, team: "imob" }

  it("admin/supervisor mexem em TUDO (house e imob)", () => {
    for (const role of ["admin", "supervisor"]) {
      expect(canMutateAppointment(role, "x", houseAppt)).toBe(true)
      expect(canMutateAppointment(role, "x", imobAppt)).toBe(true)
    }
  })
  it("gerente-comercial mexe no HOUSE mas NÃO no IMOB (mudança vs 75-103)", () => {
    expect(canMutateAppointment("gerente-comercial", "x", houseAppt)).toBe(true)
    expect(canMutateAppointment("gerente-comercial", "x", imobAppt)).toBe(false)
  })
  it("perfil imob (Daiana) mexe no IMOB (mesmo sem ser dono) mas NÃO no HOUSE", () => {
    expect(canMutateAppointment("imob", "daiana", imobAppt)).toBe(true)
    expect(canMutateAppointment("imob", "daiana", houseAppt)).toBe(false)
  })
  it("dono house NÃO mexe se o compromisso for IMOB (mesmo sendo broker_id)", () => {
    const imobComBroker = { broker_id: "broker-1", calendly_event_uri: null, team: "imob" }
    expect(canMutateAppointment("broker", "broker-1", imobComBroker)).toBe(false)
  })
  it("corretor comum não mexe no IMOB", () => {
    expect(canMutateAppointment("broker", "qualquer", imobAppt)).toBe(false)
  })
  it("team ausente/desconhecido = HOUSE (fallback consistente com 81-1/81-2)", () => {
    const semTeam = { broker_id: "broker-1", calendly_event_uri: null }
    expect(canMutateAppointment("broker", "broker-1", semTeam)).toBe(true)
    expect(canMutateAppointment("gerente-comercial", "x", { ...semTeam, team: undefined })).toBe(true)
    expect(canMutateAppointment("imob", "x", { ...semTeam, team: null })).toBe(false)
  })
})

describe("overlaps", () => {
  it("detecta sobreposição", () => {
    expect(overlaps(100, 200, 150, 250)).toBe(true)
    expect(overlaps(100, 200, 200, 300)).toBe(false) // encosta, não sobrepõe
    expect(overlaps(100, 200, 300, 400)).toBe(false)
  })
})

describe("isConflict (Story 75-103)", () => {
  const cand = { start: 1000, end: 2000, location: "Stand Trifold", team: "house" as const }

  it("mesmo local + sobreposto = conflito", () => {
    expect(isConflict(cand, { start: 1500, end: 2500, location: "Stand Trifold", team: "house", calendly_event_uri: null })).toBe(true)
  })
  it("local diferente + interno = SEM conflito", () => {
    expect(isConflict(cand, { start: 1500, end: 2500, location: "Sala 2", team: "house", calendly_event_uri: null })).toBe(false)
  })
  it("Calendly sobreposto = conflito mesmo com local diferente", () => {
    expect(isConflict(cand, { start: 1500, end: 2500, location: "Calendly", team: "house", calendly_event_uri: "uri" })).toBe(true)
  })
  it("Calendly mas SEM sobreposição = sem conflito", () => {
    expect(isConflict(cand, { start: 3000, end: 4000, location: "Calendly", team: "house", calendly_event_uri: "uri" })).toBe(false)
  })
})

describe("isConflict por equipe (Story 81-1 — Epic 81 HOUSE × IMOB)", () => {
  const house = { start: 1000, end: 2000, location: "Decorado Vind", team: "house" as const }
  const imob = { start: 1000, end: 2000, location: "Decorado Vind", team: "imob" as const }

  it("equipes DIFERENTES + mesmo local + mesmo horário = NÃO conflita (decisão do diretor)", () => {
    expect(isConflict(house, { ...imob, calendly_event_uri: null })).toBe(false)
    expect(isConflict(imob, { ...house, calendly_event_uri: null })).toBe(false)
  })
  it("equipe cruzada nem com Calendly bloqueia (Calendly é house; candidato imob passa)", () => {
    expect(isConflict(imob, { start: 1500, end: 2500, location: "Calendly", team: "house", calendly_event_uri: "uri" })).toBe(false)
  })
  it("MESMA equipe imob + mesmo local + sobreposto = conflita (regra intra-equipe preservada)", () => {
    expect(isConflict(imob, { start: 1500, end: 2500, location: "Decorado Vind", team: "imob", calendly_event_uri: null })).toBe(true)
  })
  it("MESMA equipe imob + local diferente = sem conflito (igual à regra house)", () => {
    expect(isConflict(imob, { start: 1500, end: 2500, location: "Decorado Yarden", team: "imob", calendly_event_uri: null })).toBe(false)
  })
})
