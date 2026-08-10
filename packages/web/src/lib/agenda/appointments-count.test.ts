import { describe, it, expect } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getUpcomingAppointmentsCount } from "./appointments-count"

// Fake do client que registra a cadeia de filtros e devolve `count` no await.
// O gotcha desta classe de bug é a régua divergir entre layout e rota — o
// teste congela a régua: escopo org, status ativos e corte no "agora".
function fakeSupabase(result: { count: number | null }) {
  const calls: Record<string, unknown[]> = {}
  const builder = {
    select: (...args: unknown[]) => ((calls.select = args), builder),
    eq: (...args: unknown[]) => ((calls.eq = args), builder),
    in: (...args: unknown[]) => ((calls.in = args), builder),
    gte: (...args: unknown[]) => ((calls.gte = args), builder),
    then: (resolve: (v: { count: number | null }) => void) => resolve(result),
  }
  const client = { from: (table: string) => ((calls.from = [table]), builder) }
  return { client: client as unknown as SupabaseClient, calls }
}

describe("getUpcomingAppointmentsCount", () => {
  it("aplica a régua do badge: org, status ativos e só futuro", async () => {
    const { client, calls } = fakeSupabase({ count: 2 })
    const before = new Date()
    const count = await getUpcomingAppointmentsCount(client, "org-1")
    const after = new Date()

    expect(count).toBe(2)
    expect(calls.from).toEqual(["appointments"])
    expect(calls.select).toEqual(["id", { count: "exact", head: true }])
    expect(calls.eq).toEqual(["org_id", "org-1"])
    expect(calls.in).toEqual(["status", ["scheduled", "confirmed"]])

    // O corte é "agora": um compromisso já passado não pode contar.
    const [gteCol, gteValue] = calls.gte as [string, string]
    expect(gteCol).toBe("scheduled_at")
    const cutoff = new Date(gteValue)
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(cutoff.getTime()).toBeLessThanOrEqual(after.getTime())
  })

  it("count null (head request sem linhas) vira 0, não NaN/undefined", async () => {
    const { client } = fakeSupabase({ count: null })
    expect(await getUpcomingAppointmentsCount(client, "org-1")).toBe(0)
  })
})
