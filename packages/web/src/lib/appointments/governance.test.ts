import { describe, it, expect } from "vitest"
import { canMutateAppointment, overlaps, isConflict } from "./governance"

describe("canMutateAppointment (Story 75-103)", () => {
  const internal = { broker_id: "broker-1", calendly_event_uri: null }
  const calendly = { broker_id: null, calendly_event_uri: "https://calendly.com/evt/abc" }

  it("dono (corretor atribuído) pode", () => {
    expect(canMutateAppointment("broker", "broker-1", internal)).toBe(true)
  })
  it("outro corretor NÃO pode", () => {
    expect(canMutateAppointment("broker", "broker-2", internal)).toBe(false)
  })
  it("admin/supervisor/gerente-comercial podem (mesmo sem ser dono)", () => {
    expect(canMutateAppointment("admin", "x", internal)).toBe(true)
    expect(canMutateAppointment("supervisor", "x", internal)).toBe(true)
    expect(canMutateAppointment("gerente-comercial", "x", internal)).toBe(true)
  })
  it("perfil não privilegiado e não-dono NÃO pode (ex.: imob/consultoria)", () => {
    expect(canMutateAppointment("imob", "x", internal)).toBe(false)
    expect(canMutateAppointment("consultoria", "x", internal)).toBe(false)
  })
  it("Calendly (sem dono interno) é livre pra qualquer um", () => {
    expect(canMutateAppointment("imob", "x", calendly)).toBe(true)
    expect(canMutateAppointment("broker", "qualquer", calendly)).toBe(true)
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
  const cand = { start: 1000, end: 2000, location: "Stand Trifold" }

  it("mesmo local + sobreposto = conflito", () => {
    expect(isConflict(cand, { start: 1500, end: 2500, location: "Stand Trifold", calendly_event_uri: null })).toBe(true)
  })
  it("local diferente + interno = SEM conflito", () => {
    expect(isConflict(cand, { start: 1500, end: 2500, location: "Sala 2", calendly_event_uri: null })).toBe(false)
  })
  it("Calendly sobreposto = conflito mesmo com local diferente", () => {
    expect(isConflict(cand, { start: 1500, end: 2500, location: "Calendly", calendly_event_uri: "uri" })).toBe(true)
  })
  it("Calendly mas SEM sobreposição = sem conflito", () => {
    expect(isConflict(cand, { start: 3000, end: 4000, location: "Calendly", calendly_event_uri: "uri" })).toBe(false)
  })
})
