import { describe, it, expect, vi, beforeEach } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

// notify-appointment é server-only e dispara push/e-mail — mockado para o teste
// exercitar o COMPORTAMENTO do claim (quem é avisado, com qual horário).
// A tipagem explícita do parâmetro mantém `notifySpy.mock.calls[n][0]` tipado
// sem deixar variável não usada para o lint.
const notifySpy = vi.fn((params: Record<string, unknown>) => Promise.resolve(params))
vi.mock("@web/lib/broker/notify-appointment", () => ({
  notifyBrokerOfAppointment: (p: Record<string, unknown>) => notifySpy(p),
}))

const { syncFutureVisitsWithLeadOwner, formatVisitWhen } = await import("./sync-visit-owner")

const BROKER = "34260eb8-e20b-422f-aadb-1f12806adc82"
const LEAD = "81f90ea4-5544-42a7-b7da-37a8eb834d58"

interface ApptRow { id: string; broker_id: string | null; status: string; scheduled_at: string; team: string }

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
      // appointments — a cadeia é thenable: o claim faz update().eq()…select() e
      // a transferência faz select().eq()… (ordem inversa). Os filtros só valem
      // quando a promise resolve, então o efeito é aplicado no `then`.
      let cur = rows
      let patch: Record<string, unknown> | null = null
      const chain = {
        update(v: Record<string, unknown>) { patch = v; return chain },
        select() { return chain },
        eq(col: string, val: unknown) { cur = cur.filter((r) => (r as unknown as Record<string, unknown>)[col] === val); return chain },
        is(col: string, val: null) { cur = cur.filter((r) => (r as unknown as Record<string, unknown>)[col] === val); return chain },
        in(col: string, vals: unknown[]) { cur = cur.filter((r) => vals.includes((r as unknown as Record<string, unknown>)[col])); return chain },
        gte(col: string, val: string) { cur = cur.filter((r) => String((r as unknown as Record<string, unknown>)[col]) >= val); return chain },
        then(resolve: (v: { data: unknown; error: null }) => void) {
          if (patch) {
            for (const r of cur) {
              updated.push({ id: r.id, broker_id: patch.broker_id as string })
              r.broker_id = patch.broker_id as string
            }
          }
          resolve({
            data: cur.map((r) => ({ id: r.id, scheduled_at: r.scheduled_at, broker_id: r.broker_id })),
            error: null,
          })
        },
      }
      return chain
    },
  } as unknown as SupabaseClient
  return { admin, activities, updated }
}

// eq("lead_id", …) precisa achar a coluna: as linhas do fake carregam lead_id.
const row = (over: Partial<ApptRow & { lead_id: string }> = {}) => ({
  id: "appt-1", lead_id: LEAD, broker_id: null, status: "scheduled", team: "house",
  scheduled_at: "2099-08-01T13:00:00.000Z", ...over,
}) as ApptRow

beforeEach(() => notifySpy.mockClear())

describe("syncFutureVisitsWithLeadOwner — visita órfã (Story 75-247)", () => {
  it("carimba a visita sem dono e avisa o novo responsável com o horário certo", async () => {
    const { admin, activities, updated } = fakeAdmin([row()])
    const res = await syncFutureVisitsWithLeadOwner({ admin, orgId: "org1", leadId: LEAD, brokerUserId: BROKER, origem: "roleta" })

    expect(res.moved).toBe(1)
    expect(updated).toEqual([{ id: "appt-1", broker_id: BROKER }])
    // sem dono anterior → ninguém é avisado de perda
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

  it("ignora visita passada, cancelada e de outro lead", async () => {
    const { admin } = fakeAdmin([
      row({ id: "passada", scheduled_at: "2020-01-01T13:00:00.000Z" }),
      row({ id: "cancelada", status: "cancelled" }),
      { ...row({ id: "outro-lead" }), lead_id: "outro" } as ApptRow,
    ])
    const res = await syncFutureVisitsWithLeadOwner({ admin, orgId: "org1", leadId: LEAD, brokerUserId: BROKER, origem: "bolsão" })
    expect(res.moved).toBe(0)
    expect(notifySpy).not.toHaveBeenCalled()
  })

  it("sem lead ou sem corretor não faz nada", async () => {
    const { admin } = fakeAdmin([row()])
    expect((await syncFutureVisitsWithLeadOwner({ admin, orgId: "org1", leadId: "", brokerUserId: BROKER, origem: "x" })).moved).toBe(0)
    expect((await syncFutureVisitsWithLeadOwner({ admin, orgId: "org1", leadId: LEAD, brokerUserId: "", origem: "x" })).moved).toBe(0)
    expect(notifySpy).not.toHaveBeenCalled()
  })

  it("avisa uma vez por visita quando o lead tem mais de uma", async () => {
    const { admin } = fakeAdmin([row({ id: "a1" }), row({ id: "a2", scheduled_at: "2099-08-02T13:00:00.000Z" })])
    const res = await syncFutureVisitsWithLeadOwner({ admin, orgId: "org1", leadId: LEAD, brokerUserId: BROKER, origem: "roleta" })
    expect(res.moved).toBe(2)
    expect(notifySpy).toHaveBeenCalledTimes(2)
  })

  it("erro no banco não derruba a distribuição (best-effort)", async () => {
    const admin = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ in: () => ({ gte: () => Promise.resolve({ data: null, error: { message: "boom" } }) }) }) }) }),
      }),
    } as unknown as SupabaseClient
    const res = await syncFutureVisitsWithLeadOwner({ admin, orgId: "org1", leadId: LEAD, brokerUserId: BROKER, origem: "roleta" })
    expect(res.moved).toBe(0)
    expect(notifySpy).not.toHaveBeenCalled()
  })
})

describe("syncFutureVisitsWithLeadOwner — troca de dono (Story 75-249)", () => {
  const NOVO = "12089ddc-5bf2-482f-9915-1b3518df43bb" // Matheus, o caso real

  it("🔥 caso do Marcos: lead reatribuído leva a visita, e os dois lados são avisados", async () => {
    const { admin, activities, updated } = fakeAdmin([row({ broker_id: BROKER })])
    const res = await syncFutureVisitsWithLeadOwner({ admin, orgId: "org1", leadId: LEAD, brokerUserId: NOVO, origem: "atribuição manual" })

    expect(res.moved).toBe(1)
    expect(updated).toEqual([{ id: "appt-1", broker_id: NOVO }])
    expect(notifySpy).toHaveBeenCalledTimes(2)
    const variants = notifySpy.mock.calls.map((c) => (c[0] as Record<string, unknown>).variant)
    expect(variants).toEqual(["inherited", "moved_out"])
    const destinos = notifySpy.mock.calls.map((c) => (c[0] as Record<string, unknown>).brokerUserId)
    expect(destinos).toEqual([NOVO, BROKER])
    expect(String(activities[0]!.description)).toContain("novo responsável")
    expect(activities[0]!.metadata).toMatchObject({ from_broker_user_id: BROKER, to_broker_user_id: NOVO })
  })

  it("visita que JÁ é do dono não é mexida nem notificada (idempotente)", async () => {
    const { admin, updated } = fakeAdmin([row({ broker_id: NOVO })])
    const res = await syncFutureVisitsWithLeadOwner({ admin, orgId: "org1", leadId: LEAD, brokerUserId: NOVO, origem: "transferência" })
    expect(res.moved).toBe(0)
    expect(updated).toEqual([])
    expect(notifySpy).not.toHaveBeenCalled()
  })

  it("não mexe em visita IMOB, passada, cancelada nem de outro lead", async () => {
    const { admin } = fakeAdmin([
      row({ id: "imob", team: "imob", broker_id: BROKER }),
      row({ id: "passada", scheduled_at: "2020-01-01T13:00:00.000Z", broker_id: BROKER }),
      row({ id: "cancelada", status: "cancelled", broker_id: BROKER }),
      { ...row({ id: "outro-lead", broker_id: BROKER }), lead_id: "outro" } as ApptRow,
    ])
    const res = await syncFutureVisitsWithLeadOwner({ admin, orgId: "org1", leadId: LEAD, brokerUserId: NOVO, origem: "transferência" })
    expect(res.moved).toBe(0)
    expect(notifySpy).not.toHaveBeenCalled()
  })
})

describe("não invade o mundo IMOB (Story 75-247)", () => {
  it("visita IMOB sem corretor NÃO é carimbada — dono é a imobiliária", async () => {
    const { admin, updated } = fakeAdmin([row({ id: "imob-1", team: "imob" })])
    const res = await syncFutureVisitsWithLeadOwner({ admin, orgId: "org1", leadId: LEAD, brokerUserId: BROKER, origem: "roleta" })
    expect(res.moved).toBe(0)
    expect(updated).toEqual([])
    expect(notifySpy).not.toHaveBeenCalled()
  })
})

describe("formatVisitWhen (Story 75-247)", () => {
  it("formata em BRT com 'às' antes da hora", () => {
    // 2026-08-01T13:00Z = sábado 01/08 10:00 BRT (a visita do Ailton)
    expect(formatVisitWhen("2026-08-01T13:00:00.000Z")).toBe("sáb., 01/08 às 10:00")
  })
})
