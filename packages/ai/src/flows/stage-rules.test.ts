import { describe, it, expect } from "vitest"
import { guardStageForAssignedLead } from "./stage-rules"

const STAGE = "00000000-0000-0000-0001-000000000002"
const BROKER = "8a8bf785-ab97-46ba-8151-186be330d161"

describe("guardStageForAssignedLead", () => {
  it("AC1: lead atribuído → remove stage_id do patch", () => {
    const patch: Record<string, unknown> = { stage_id: STAGE, qualification_score: 10 }
    guardStageForAssignedLead(patch, BROKER)
    expect("stage_id" in patch).toBe(false)
    // demais campos preservados (AC5)
    expect(patch.qualification_score).toBe(10)
  })

  it("AC2: lead sem dono (null) → mantém stage_id", () => {
    const patch: Record<string, unknown> = { stage_id: STAGE }
    guardStageForAssignedLead(patch, null)
    expect(patch.stage_id).toBe(STAGE)
  })

  it("AC2: lead sem dono (undefined) → mantém stage_id", () => {
    const patch: Record<string, unknown> = { stage_id: STAGE }
    guardStageForAssignedLead(patch, undefined)
    expect(patch.stage_id).toBe(STAGE)
  })

  it("AC3: patch sem stage_id → permanece inalterado (não cria a chave)", () => {
    const patch: Record<string, unknown> = { qualification_score: 50 }
    guardStageForAssignedLead(patch, BROKER)
    expect("stage_id" in patch).toBe(false)
    expect(patch.qualification_score).toBe(50)
  })

  it("string vazia de broker é tratada como sem dono → mantém stage_id", () => {
    const patch: Record<string, unknown> = { stage_id: STAGE }
    guardStageForAssignedLead(patch, "")
    expect(patch.stage_id).toBe(STAGE)
  })
})
