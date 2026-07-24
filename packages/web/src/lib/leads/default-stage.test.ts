/**
 * Story 75-218 — etapa default do Kanban (lead nunca nasce sem etapa).
 */
import { describe, it, expect, vi } from "vitest"
import { getDefaultStageId } from "./default-stage"

type Result = { data: unknown; error: unknown }

function fakeSupabase(queue: Result[]) {
  return {
    from: () => {
      const result = queue.shift() ?? { data: null, error: null }
      const b: Record<string, unknown> = {}
      for (const m of ["select", "eq", "order", "limit"]) b[m] = vi.fn(() => b)
      b.single = () => Promise.resolve(result)
      return b
    },
  } as never
}

describe("getDefaultStageId", () => {
  it("usa a etapa is_default quando existe", async () => {
    const supabase = fakeSupabase([{ data: { id: "stage-default" }, error: null }])
    expect(await getDefaultStageId(supabase, "org-1")).toBe("stage-default")
  })

  it("sem is_default → primeira etapa por posição", async () => {
    const supabase = fakeSupabase([
      { data: null, error: { code: "PGRST116" } },
      { data: { id: "stage-first" }, error: null },
    ])
    expect(await getDefaultStageId(supabase, "org-1")).toBe("stage-first")
  })

  it("sem etapas → fallback fixo (nunca retorna null)", async () => {
    const supabase = fakeSupabase([
      { data: null, error: { code: "PGRST116" } },
      { data: null, error: { code: "PGRST116" } },
    ])
    expect(await getDefaultStageId(supabase, "org-1")).toBe("00000000-0000-0000-0001-000000000001")
  })
})
