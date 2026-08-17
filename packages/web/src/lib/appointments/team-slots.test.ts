import { describe, it, expect, vi } from "vitest"

// Story 75-331 — o helper extraído passou a servir DUAS rotas: a autenticada
// (81-8, modal interno) e a pública do formulário. A rota autenticada não tinha
// teste nenhum; refatorar sem cobrir seria trocar código por confiança.
//
// O que importa provar aqui é a REGRA de negócio da grade, não a matemática dos
// horários (essa já é de imob-slots.test.ts): house e imob não se enxergam, e
// pré-agendado ocupa igual a confirmado.

vi.mock("@web/lib/roleta/business-time", () => ({
  getOrgSchedule: async () => ({
    // WeekSchedule é um ARRAY de 7 indexado por dia da semana (0 = domingo),
    // não um objeto com nomes de dia — `business-time.ts:126`.
    week: [
      { isOpen: false, open: "08:00", close: "12:00" }, // domingo
      { isOpen: true, open: "08:00", close: "18:00" },
      { isOpen: true, open: "08:00", close: "18:00" },
      { isOpen: true, open: "08:00", close: "18:00" },
      { isOpen: true, open: "08:00", close: "18:00" },
      { isOpen: true, open: "08:00", close: "18:00" },
      { isOpen: false, open: "08:00", close: "12:00" }, // sábado
    ],
    timezone: "America/Sao_Paulo",
  }),
}))

import { ocupadosDaEquipe, gradeDaEquipe } from "./team-slots"

type Row = Record<string, unknown>

/** Fake que aplica `.eq()` e `.in()` de verdade — o ponto do teste é o filtro. */
function fakeClient(rows: Row[]) {
  const preds: ((r: Row) => boolean)[] = []
  const api: Record<string, unknown> = {
    select: () => api,
    eq: (c: string, v: unknown) => {
      preds.push((r) => String(r[c]) === String(v))
      return api
    },
    in: (c: string, vs: unknown[]) => {
      preds.push((r) => vs.map(String).includes(String(r[c])))
      return api
    },
    gte: () => api,
    lte: () => api,
    then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
      resolve({ data: rows.filter((r) => preds.every((p) => p(r))), error: null }),
  }
  return { from: () => api } as never
}

const compromisso = (team: string, status: string): Row => ({
  org_id: "org-1", // a query filtra por org — sem isto o fake (corretamente) descarta
  team,
  status,
  scheduled_at: "2026-08-18T14:00:00.000Z",
  duration_minutes: 60,
})

describe("ocupadosDaEquipe", () => {
  it("HOUSE não enxerga compromisso da IMOB (Story 81-1)", async () => {
    const client = fakeClient([compromisso("imob", "scheduled"), compromisso("house", "scheduled")])
    const r = await ocupadosDaEquipe(client, "org-1", "house", "2026-08-17", "2026-08-19")
    expect(r).toHaveLength(1)
  })

  it("pré-agendado OCUPA igual a confirmado (D1 do Epic 89)", async () => {
    const client = fakeClient([compromisso("house", "scheduled"), compromisso("house", "confirmed")])
    const r = await ocupadosDaEquipe(client, "org-1", "house", "2026-08-17", "2026-08-19")
    expect(r).toHaveLength(2)
  })

  it("cancelado e no-show NÃO ocupam — o horário volta a ser oferecido", async () => {
    const client = fakeClient([
      compromisso("house", "cancelled"),
      compromisso("house", "no_show"),
      compromisso("house", "completed"),
    ])
    const r = await ocupadosDaEquipe(client, "org-1", "house", "2026-08-17", "2026-08-19")
    expect(r).toHaveLength(0)
  })
})

describe("gradeDaEquipe", () => {
  it("sem data, devolve só os dias abertos — sem grade de horários", async () => {
    const g = await gradeDaEquipe({ supabase: fakeClient([]), orgId: "org-1", team: "house" })
    expect(g.slots).toBeUndefined()
    expect(g.days.length).toBeGreaterThan(0)
    expect(g.timezone).toBe("America/Sao_Paulo")
  })

  it("data malformada é ignorada em vez de quebrar a grade", async () => {
    const g = await gradeDaEquipe({
      supabase: fakeClient([]),
      orgId: "org-1",
      team: "house",
      date: "18/08/2026", // formato brasileiro, não ISO
    })
    expect(g.slots).toBeUndefined()
    expect(g.days.length).toBeGreaterThan(0)
  })

  it("com data válida, devolve a grade daquele dia", async () => {
    const g = await gradeDaEquipe({
      supabase: fakeClient([]),
      orgId: "org-1",
      team: "house",
      date: "2026-08-19", // quarta-feira
      now: new Date("2026-08-17T12:00:00.000Z"),
    })
    expect(Array.isArray(g.slots)).toBe(true)
    expect(g.slots!.length).toBeGreaterThan(0)
    expect(g.slots!.every((s) => s.free)).toBe(true) // nada ocupado no fake
  })

  it("dia fechado devolve grade VAZIA, não erro", async () => {
    const g = await gradeDaEquipe({
      supabase: fakeClient([]),
      orgId: "org-1",
      team: "house",
      date: "2026-08-23", // domingo, isOpen: false
      now: new Date("2026-08-17T12:00:00.000Z"),
    })
    expect(g.slots).toEqual([])
  })
})
