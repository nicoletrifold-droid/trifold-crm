import { describe, it, expect } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getUpcomingAppointmentsCount } from "./appointments-count"

// Fake do client que registra a cadeia de filtros e devolve `count` no await.
// O gotcha desta classe de bug é a régua divergir entre layout e rota — o
// teste congela a régua: escopo org, status ativos e corte no "agora".
function fakeSupabase(result: { count: number | null }) {
  const filters: Array<[string, ...unknown[]]> = []
  const record =
    (method: string) =>
    (...args: unknown[]) => (filters.push([method, ...args]), builder)
  const builder = {
    select: record("select"),
    eq: record("eq"),
    in: record("in"),
    gte: record("gte"),
    then: (resolve: (v: { count: number | null }) => void) => resolve(result),
  }
  const client = { from: (table: string) => (filters.push(["from", table]), builder) }
  return { client: client as unknown as SupabaseClient, filters }
}

describe("getUpcomingAppointmentsCount", () => {
  it("aplica a régua do badge: org, status ativos e só futuro", async () => {
    const { client, filters } = fakeSupabase({ count: 2 })
    const before = new Date()
    const count = await getUpcomingAppointmentsCount(client, "org-1")
    const after = new Date()

    expect(count).toBe(2)
    expect(filters).toContainEqual(["from", "appointments"])
    expect(filters).toContainEqual(["select", "id", { count: "exact", head: true }])
    expect(filters).toContainEqual(["eq", "org_id", "org-1"])
    expect(filters).toContainEqual(["in", "status", ["scheduled", "confirmed"]])

    // O corte é "agora": um compromisso já passado não pode contar.
    const gte = filters.find(([m]) => m === "gte") as [string, string, string]
    expect(gte[1]).toBe("scheduled_at")
    const cutoff = new Date(gte[2])
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(cutoff.getTime()).toBeLessThanOrEqual(after.getTime())
  })

  it("sem brokerId NÃO filtra por corretor (menu do /dashboard é org-wide)", async () => {
    const { client, filters } = fakeSupabase({ count: 1 })
    await getUpcomingAppointmentsCount(client, "org-1")
    expect(filters.some(([m, col]) => m === "eq" && col === "broker_id")).toBe(false)
  })

  it("com brokerId (75-287) restringe ao corretor, mantendo a régua base", async () => {
    const { client, filters } = fakeSupabase({ count: 1 })
    await getUpcomingAppointmentsCount(client, "org-1", { brokerId: "user-9" })
    expect(filters).toContainEqual(["eq", "org_id", "org-1"])
    expect(filters).toContainEqual(["eq", "broker_id", "user-9"])
    expect(filters).toContainEqual(["in", "status", ["scheduled", "confirmed"]])
  })

  it("count null (head request sem linhas) vira 0, não NaN/undefined", async () => {
    const { client } = fakeSupabase({ count: null })
    expect(await getUpcomingAppointmentsCount(client, "org-1")).toBe(0)
  })
})
