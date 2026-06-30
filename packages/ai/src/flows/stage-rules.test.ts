import { describe, it, expect } from "vitest"
import { guardStageForAssignedLead } from "./stage-rules"

const STAGE = "00000000-0000-0000-0001-000000000002"
const BROKER = "8a8bf785-ab97-46ba-8151-186be330d161"

describe("guardStageForAssignedLead", () => {
  // Story 75-56: a Nicole NUNCA escreve etapa — o guard remove stage_id
  // INCONDICIONALMENTE, com ou sem corretor atribuído.
  it("AC1: lead atribuído → remove stage_id do patch (demais campos preservados)", () => {
    const patch: Record<string, unknown> = { stage_id: STAGE, qualification_score: 10 }
    guardStageForAssignedLead(patch, BROKER)
    expect("stage_id" in patch).toBe(false)
    expect(patch.qualification_score).toBe(10)
  })

  it("AC3: lead SEM dono (null) → também remove stage_id", () => {
    const patch: Record<string, unknown> = { stage_id: STAGE, qualification_score: 25 }
    guardStageForAssignedLead(patch, null)
    expect("stage_id" in patch).toBe(false)
    expect(patch.qualification_score).toBe(25)
  })

  it("AC3: lead SEM dono (undefined) → também remove stage_id", () => {
    const patch: Record<string, unknown> = { stage_id: STAGE }
    guardStageForAssignedLead(patch, undefined)
    expect("stage_id" in patch).toBe(false)
  })

  it("AC3: chamada sem o 2º argumento → remove stage_id", () => {
    const patch: Record<string, unknown> = { stage_id: STAGE }
    guardStageForAssignedLead(patch)
    expect("stage_id" in patch).toBe(false)
  })

  it("patch sem stage_id → permanece inalterado (não cria a chave)", () => {
    const patch: Record<string, unknown> = { qualification_score: 50 }
    guardStageForAssignedLead(patch, BROKER)
    expect("stage_id" in patch).toBe(false)
    expect(patch.qualification_score).toBe(50)
  })

  it("broker string vazia → remove stage_id (regra incondicional)", () => {
    const patch: Record<string, unknown> = { stage_id: STAGE }
    guardStageForAssignedLead(patch, "")
    expect("stage_id" in patch).toBe(false)
  })
})
