/**
 * Story 59-1 — Tests for resolveBrokerName (AC3, AC6).
 *
 * Covers:
 *  1. Returns broker name when assigned_broker_id exists
 *  2. Returns "" when assigned_broker_id is null
 *  3. Returns "" when query returns no row
 *  4. Returns "" when query throws (never propagates)
 */
import { describe, it, expect, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { resolveBrokerName } from "./route"

function makeSupabase(result: { data: unknown; error?: unknown }) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve(result),
        }),
      }),
    }),
  }
}

describe("resolveBrokerName", () => {
  it("returns the broker name when found", async () => {
    const supabase = makeSupabase({ data: { name: "Roberto Colichio" } })
    const result = await resolveBrokerName(supabase as never, "broker-uuid-123")
    expect(result).toBe("Roberto Colichio")
  })

  it("returns '' when assigned_broker_id is null", async () => {
    const supabase = makeSupabase({ data: null })
    const result = await resolveBrokerName(supabase as never, null)
    expect(result).toBe("")
  })

  it("returns '' when query returns no row", async () => {
    const supabase = makeSupabase({ data: null })
    const result = await resolveBrokerName(supabase as never, "nonexistent-id")
    expect(result).toBe("")
  })

  it("returns '' when query throws", async () => {
    const supabase = {
      from: () => {
        throw new Error("DB error")
      },
    }
    const result = await resolveBrokerName(supabase as never, "broker-id")
    expect(result).toBe("")
  })

  it("returns '' when name field is null", async () => {
    const supabase = makeSupabase({ data: { name: null } })
    const result = await resolveBrokerName(supabase as never, "broker-uuid-456")
    expect(result).toBe("")
  })
})
