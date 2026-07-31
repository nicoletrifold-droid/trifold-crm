import { describe, it, expect, vi, beforeEach } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

// notify-appointment é server-only e dispara push/e-mail — mockado para o teste
// exercitar o COMPORTAMENTO do claim (quem é avisado, com qual horário).
const notifySpy = vi.fn(async (_params: Record<string, unknown>) => {})
vi.mock("@web/lib/broker/notify-appointment", () => ({
  notifyBrokerOfAppointment: (p: Record<string, unknown>) => notifySpy(p),
}))

const { claimOrphanVisitsForBroker, formatVisitWhen } = await import("./claim-orphan-visits")

const BROKER = "34260eb8-e20b-422f-aadb-1f12806adc82"
const LEAD = "81f90ea4-5544-42a7-b7da-37a8eb834d58"

interface ApptRow { id: string; broker_id: string | null; status: string; scheduled_at: string }

/**
 * Fake do query-builder aplicando os filtros de verdade: assim o teste prova que
 * o claim só toca visita FUTURA, ATIVA e SEM dono — a garantia que permite
 * chamar esta função de qualquer caminho de atribuição.
 */
function fakeAdmin(rows: ApptRow[]) {
  const activities: Array<Record<string, unknown>> = []
  const updated: Array<{ id: string; broker_id: string }> = []
  const admin = {
    from(table: string) {
      if (table === "activities") {
        return { insert: async (v: Record<string, unknown>) => { activities.push(v); return { error: null } } }
      }
      if (table === "leads") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({ data: { name: "Ailton Gouvea", phone: "554491565006" } }),
        }
        return chain
      }
      // appointments
      let cur = rows
      let patch: Record<string, unknown> = {}
      const chain = {
        update(v: Record<string, unknown>) { patch = v; return chain },
        eq(col: string, val: unknown) { cur = cur.filter((r) => (r as unknown as Record<string, unknown>)[col] === val); return chain },
        is(col: string, val: null) { cur = cur.filter((r) => (r as unknown as Record<string, unknown>)[col] === val); return chain },
        in(col: string, vals: unknown[]) { cur = cur.filter((r) => vals.includes((r as unknown as Record<string, unknown>)[col])); return chain },
        gte(col: string, val: string) { cur = cur.filter((r) => String((r as unknown as Record<string, unknown>)[col]) >= val); return chain },
        async select() {
          for (const r of cur) updated.push({ id: r.id, broker_id: patch.broker_id as string })
          return { data: cur.map((r) => ({ id: r.id, scheduled_at: r.scheduled_at })), error: null }
        },
      }
      return chain
    },
  } as unknown as SupabaseClient
  return { admin, activities, updated }
}

// eq("lead_id", …) precisa achar a coluna: as linhas do fake carregam lead_id.
const row = (over: Partial<ApptRow & { lead_id: string }> = {}) => ({
  id: "appt-1", lead_id: LEAD, broker_id: null, status: "scheduled",
  scheduled_at: "2099-08-01T13:00:00.000Z", ...over,
}) as ApptRow

beforeEach(() => notifySpy.mockClear())

describe("claimOrphanVisitsForBroker (Story 75-247)", () => {
  it("carimba a visita órfã futura e avisa o corretor com o horário certo", async () => {
    const { admin, activities, updated } = fakeAdmin([row()])
    const res = await claimOrphanVisitsForBroker({ admin, orgId: "org1", leadId: LEAD, brokerUserId: BROKER, origem: "roleta" })

    expect(res.claimed).toBe(1)
    expect(updated).toEqual([{ id: "appt-1", broker_id: BROKER }])
    expect(notifySpy).toHaveBeenCalledTimes(1)
    expect(notifySpy.mock.calls[0]?.[0]).toMatchObject({
      brokerUserId: BROKER,
      leadId: LEAD,
      leadName: "Ailton Gouvea",
      variant: "inherited",
    })
    expect(activities[0]).toMatchObject({ type: "appointment_updated" })
    expect(String(activities[0]!.description)).toContain("roleta")
  })

  it("NÃO rouba visita que já tem corretor (idempotente / no-op)", async () => {
    const { admin, updated } = fakeAdmin([row({ broker_id: "outro-corretor" })])
    const res = await claimOrphanVisitsForBroker({ admin, orgId: "org1", leadId: LEAD, brokerUserId: BROKER, origem: "roleta" })
    expect(res.claimed).toBe(0)
    expect(updated).toEqual([])
    expect(notifySpy).not.toHaveBeenCalled()
  })

  it("ignora visita passada, cancelada e de outro lead", async () => {
    const { admin } = fakeAdmin([
      row({ id: "passada", scheduled_at: "2020-01-01T13:00:00.000Z" }),
      row({ id: "cancelada", status: "cancelled" }),
      { ...row({ id: "outro-lead" }), lead_id: "outro" } as ApptRow,
    ])
    const res = await claimOrphanVisitsForBroker({ admin, orgId: "org1", leadId: LEAD, brokerUserId: BROKER, origem: "bolsão" })
    expect(res.claimed).toBe(0)
    expect(notifySpy).not.toHaveBeenCalled()
  })

  it("sem lead ou sem corretor não faz nada", async () => {
    const { admin } = fakeAdmin([row()])
    expect((await claimOrphanVisitsForBroker({ admin, orgId: "org1", leadId: "", brokerUserId: BROKER, origem: "x" })).claimed).toBe(0)
    expect((await claimOrphanVisitsForBroker({ admin, orgId: "org1", leadId: LEAD, brokerUserId: "", origem: "x" })).claimed).toBe(0)
    expect(notifySpy).not.toHaveBeenCalled()
  })

  it("avisa uma vez por visita quando o lead tem mais de uma órfã", async () => {
    const { admin } = fakeAdmin([row({ id: "a1" }), row({ id: "a2", scheduled_at: "2099-08-02T13:00:00.000Z" })])
    const res = await claimOrphanVisitsForBroker({ admin, orgId: "org1", leadId: LEAD, brokerUserId: BROKER, origem: "roleta" })
    expect(res.claimed).toBe(2)
    expect(notifySpy).toHaveBeenCalledTimes(2)
  })

  it("erro no banco não derruba a distribuição (best-effort)", async () => {
    const admin = {
      from: () => ({
        update: () => ({ eq: () => ({ is: () => ({ in: () => ({ gte: () => ({ select: async () => ({ data: null, error: { message: "boom" } }) }) }) }) }) }),
      }),
    } as unknown as SupabaseClient
    const res = await claimOrphanVisitsForBroker({ admin, orgId: "org1", leadId: LEAD, brokerUserId: BROKER, origem: "roleta" })
    expect(res.claimed).toBe(0)
    expect(notifySpy).not.toHaveBeenCalled()
  })
})

describe("formatVisitWhen (Story 75-247)", () => {
  it("formata em BRT com 'às' antes da hora", () => {
    // 2026-08-01T13:00Z = sábado 01/08 10:00 BRT (a visita do Ailton)
    expect(formatVisitWhen("2026-08-01T13:00:00.000Z")).toBe("sáb., 01/08 às 10:00")
  })
})
