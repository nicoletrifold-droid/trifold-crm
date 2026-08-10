import { describe, it, expect } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getBrokerNavCounts } from "./nav-counts"

/**
 * Fake do client por TABELA: cada from(tabela) devolve um builder que registra
 * a cadeia de filtros e resolve com o resultado configurado. O gotcha desta
 * classe de bug é a régua divergir entre layout e rota — os testes congelam as
 * 4 réguas movidas do broker/layout.tsx (75-8, 75-83/89, 63-19, 75-286).
 */
type Result = { count?: number | null; data?: unknown }

function fakeSupabase(results: Record<string, Result[]>, rpcResult: { data?: unknown; error?: unknown } = { data: 0 }) {
  const calls: Array<{ table: string; filters: Array<[string, ...unknown[]]> }> = []
  const rpcCalls: Array<[string, unknown]> = []
  const client = {
    from(table: string) {
      const queue = results[table] ?? [{ count: 0, data: null }]
      const result = (queue.length > 1 ? queue.shift() : queue[0]) ?? { count: 0, data: null }
      const call = { table, filters: [] as Array<[string, ...unknown[]]> }
      calls.push(call)
      const record =
        (method: string) =>
        (...args: unknown[]) => {
          call.filters.push([method, ...args])
          return builder
        }
      const builder: Record<string, unknown> = {
        select: record("select"),
        eq: record("eq"),
        in: record("in"),
        gte: record("gte"),
        gt: record("gt"),
        not: record("not"),
        is: record("is"),
        maybeSingle: () => Promise.resolve({ data: result.data ?? null }),
        then: (resolve: (v: Result) => void) => resolve(result),
      }
      return builder
    },
    rpc(name: string, params: unknown) {
      rpcCalls.push([name, params])
      return Promise.resolve(rpcResult)
    },
  }
  return { client: client as unknown as SupabaseClient, calls, rpcCalls }
}

const filtersOf = (
  calls: Array<{ table: string; filters: Array<[string, ...unknown[]]> }>,
  table: string,
) => calls.filter((c) => c.table === table).map((c) => c.filters)

describe("getBrokerNavCounts", () => {
  it("agenda: escopo do CORRETOR (org + broker_id + status ativos + futuro)", async () => {
    const { client, calls } = fakeSupabase({
      appointments: [{ count: 3 }],
      brokers: [{ data: { id: "br-1" } }],
      users: [{ data: { leads_notifications_seen_at: "2026-08-01T00:00:00Z" } }],
      lead_distribution_log: [{ count: 0 }],
      leads: [{ count: 0 }],
    })
    const counts = await getBrokerNavCounts(client, "org-1", "user-1")
    expect(counts.agenda).toBe(3)

    const agendaFilters = filtersOf(calls, "appointments")[0]!
    expect(agendaFilters).toContainEqual(["eq", "org_id", "org-1"])
    expect(agendaFilters).toContainEqual(["eq", "broker_id", "user-1"])
    expect(agendaFilters).toContainEqual(["in", "status", ["scheduled", "confirmed"]])
    expect(agendaFilters.some(([m, col]) => m === "gte" && col === "scheduled_at")).toBe(true)
  })

  it("chat: sai da RPC get_broker_unread_total com org e user", async () => {
    const { client, rpcCalls } = fakeSupabase(
      { brokers: [{ data: null }] },
      { data: 7 },
    )
    const counts = await getBrokerNavCounts(client, "org-1", "user-1")
    expect(counts.chat).toBe(7)
    expect(rpcCalls).toContainEqual([
      "get_broker_unread_total",
      { p_org_id: "org-1", p_broker_user_id: "user-1" },
    ])
  })

  it("leads: distribuídos após seen_at, pelo brokers.id (não user.id)", async () => {
    const { client, calls } = fakeSupabase({
      appointments: [{ count: 0 }],
      brokers: [{ data: { id: "br-99" } }],
      users: [{ data: { leads_notifications_seen_at: "2026-08-05T10:00:00Z" } }],
      lead_distribution_log: [{ count: 4 }],
      leads: [{ count: 0 }],
    })
    const counts = await getBrokerNavCounts(client, "org-1", "user-1")
    expect(counts.leads).toBe(4)

    const logFilters = filtersOf(calls, "lead_distribution_log")[0]!
    expect(logFilters).toContainEqual(["eq", "broker_id", "br-99"])
    expect(logFilters).toContainEqual(["eq", "status", "distributed"])
    expect(logFilters).toContainEqual(["gt", "created_at", "2026-08-05T10:00:00Z"])
  })

  it("leads: sem linha em brokers = 0 (sem query no log)", async () => {
    const { client, calls } = fakeSupabase({ brokers: [{ data: null }] })
    const counts = await getBrokerNavCounts(client, "org-1", "user-1")
    expect(counts.leads).toBe(0)
    expect(filtersOf(calls, "lead_distribution_log")).toHaveLength(0)
  })

  it("bolsao: só o pool real — bolsao_em not null e SEM dono (75-89)", async () => {
    const { client, calls } = fakeSupabase({
      brokers: [{ data: null }],
      leads: [{ count: 5 }],
    })
    const counts = await getBrokerNavCounts(client, "org-1", "user-1")
    expect(counts.bolsao).toBe(5)

    const leadsFilters = filtersOf(calls, "leads")[0]!
    expect(leadsFilters).toContainEqual(["eq", "is_active", true])
    expect(leadsFilters).toContainEqual(["not", "bolsao_em", "is", null])
    expect(leadsFilters).toContainEqual(["is", "assigned_broker_id", null])
  })

  it("count null vira 0 em todas as réguas", async () => {
    const { client } = fakeSupabase(
      {
        appointments: [{ count: null }],
        brokers: [{ data: { id: "br-1" } }],
        users: [{ data: null }],
        lead_distribution_log: [{ count: null }],
        leads: [{ count: null }],
      },
      { data: null },
    )
    expect(await getBrokerNavCounts(client, "org-1", "user-1")).toEqual({
      agenda: 0,
      chat: 0,
      leads: 0,
      bolsao: 0,
    })
  })
})
