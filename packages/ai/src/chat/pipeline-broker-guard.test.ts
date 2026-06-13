import { describe, it, expect } from "vitest"
import {
  shouldAssignPipelineBroker,
  resolveNotificationBrokerUserId,
} from "./pipeline"

/**
 * Story 51-7 — Guard de Precedência em assigned_broker_id (ADR-001, Opção 3).
 *
 * These tests cover the decision logic that the pipeline B1 (scheduling) and
 * B2 (handoff) blocks delegate to:
 *  - shouldAssignPipelineBroker: when the pipeline may set the lead owner
 *  - resolveNotificationBrokerUserId: who receives the APPOINTMENT_CREATED notify
 *
 * Mapping to the story's mandatory scenarios:
 *  Cenário 1 (Telegram NULL → atribui)      → shouldAssignPipelineBroker true
 *  Cenário 2 (lead já tem corretor → bloqueia) → shouldAssignPipelineBroker false
 *  Cenário 3 (notify usa dono quando bloqueia) → resolveNotificationBrokerUserId = owner
 *  Cenário 4 (notify usa imóvel quando NULL)   → resolveNotificationBrokerUserId = property
 *  Cenário 5 (B2 handoff = mesmo comportamento) → both helpers shared by B1/B2
 */
describe("shouldAssignPipelineBroker (guard B1/B2)", () => {
  // Cenário 1 — lead sem corretor (Telegram / sem roleta): guard NÃO bloqueia
  it("allows assignment when lead has no owner (null) and property broker exists", () => {
    expect(shouldAssignPipelineBroker("user-B", null)).toBe(true)
  })

  it("allows assignment when lead owner is undefined and property broker exists", () => {
    expect(shouldAssignPipelineBroker("user-B", undefined)).toBe(true)
  })

  // Cenário 2 — lead COM corretor (roleta/humano): guard bloqueia
  it("blocks assignment when lead already has an owner (different broker)", () => {
    expect(shouldAssignPipelineBroker("user-B", "user-A")).toBe(false)
  })

  it("blocks assignment when lead already has an owner (same broker)", () => {
    expect(shouldAssignPipelineBroker("user-A", "user-A")).toBe(false)
  })

  // Edge — no property broker found: nothing to assign regardless of owner
  it("does not assign when no property broker is found and lead has no owner", () => {
    expect(shouldAssignPipelineBroker(null, null)).toBe(false)
  })

  it("does not assign when no property broker is found and lead has an owner", () => {
    expect(shouldAssignPipelineBroker(null, "user-A")).toBe(false)
  })

  it("treats empty string property broker as falsy (no assignment)", () => {
    expect(shouldAssignPipelineBroker("", null)).toBe(false)
  })
})

describe("resolveNotificationBrokerUserId (AC5)", () => {
  // Cenário 3 — guard bloqueou: notificar o DONO atual, não o especialista do imóvel
  it("returns the current owner when the lead already has one (guard blocked)", () => {
    expect(resolveNotificationBrokerUserId("user-B", "user-A")).toBe("user-A")
  })

  // Cenário 4 — guard não bloqueou (lead NULL): notificar o corretor do imóvel
  it("returns the property broker when the lead had no owner", () => {
    expect(resolveNotificationBrokerUserId("user-B", null)).toBe("user-B")
  })

  it("returns the property broker when the lead owner is undefined", () => {
    expect(resolveNotificationBrokerUserId("user-B", undefined)).toBe("user-B")
  })

  it("returns null when neither an owner nor a property broker exists", () => {
    expect(resolveNotificationBrokerUserId(null, null)).toBe(null)
  })

  it("returns the owner even when no property broker was found", () => {
    expect(resolveNotificationBrokerUserId(null, "user-A")).toBe("user-A")
  })
})

describe("guard + notification consistency (B1/B2 shared logic)", () => {
  // Cenário 5 — both blocks use the same helpers, so behavior is identical.
  it("when guard blocks, owner is preserved AND owner is notified", () => {
    const propertyBroker = "user-B"
    const currentOwner = "user-A"
    expect(shouldAssignPipelineBroker(propertyBroker, currentOwner)).toBe(false)
    expect(resolveNotificationBrokerUserId(propertyBroker, currentOwner)).toBe(
      currentOwner
    )
  })

  it("when guard allows, property broker becomes owner AND is notified", () => {
    const propertyBroker = "user-B"
    const currentOwner = null
    expect(shouldAssignPipelineBroker(propertyBroker, currentOwner)).toBe(true)
    expect(resolveNotificationBrokerUserId(propertyBroker, currentOwner)).toBe(
      propertyBroker
    )
  })
})
