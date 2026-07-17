import { describe, it, expect } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  parseRequestedSlot,
  parseDayParts,
  parseTimeParts,
  evaluateSlot,
  dayPartsToIso,
  isoToDayParts,
  resolveVisitSlotParts,
  detectCancelIntent,
  detectRescheduleIntent,
  checkSlotAvailability,
} from "./visit-slot"

// Âncora: 2026-06-18T17:00:00Z = quinta-feira 14:00 em BRT (UTC-3).
const NOW = new Date("2026-06-18T17:00:00Z")

describe("detectCancelIntent / detectRescheduleIntent (Story 75-163)", () => {
  it("cancelar: pega variações comuns", () => {
    expect(detectCancelIntent("quero cancelar a visita")).toBe(true)
    expect(detectCancelIntent("preciso desmarcar")).toBe(true)
    expect(detectCancelIntent("não vou poder ir mais")).toBe(true)
    expect(detectCancelIntent("desisti da visita")).toBe(true)
  })
  it("cancelar: não dispara em conversa normal", () => {
    expect(detectCancelIntent("que horas é a visita?")).toBe(false)
    expect(detectCancelIntent("confirmo sim, estarei lá")).toBe(false)
    expect(detectCancelIntent(null)).toBe(false)
  })
  it("remarcar: pega variações comuns", () => {
    expect(detectRescheduleIntent("posso remarcar?")).toBe(true)
    expect(detectRescheduleIntent("dá pra mudar o horário?")).toBe(true)
    expect(detectRescheduleIntent("queria trocar pra outro dia")).toBe(true)
    expect(detectRescheduleIntent("consigo antecipar a visita?")).toBe(true)
  })
  it("remarcar: não dispara em conversa normal", () => {
    expect(detectRescheduleIntent("obrigado, até sábado")).toBe(false)
    expect(detectRescheduleIntent(null)).toBe(false)
  })
})

describe("resolveVisitSlotParts (Story 75-162)", () => {
  it("resolve dia+hora só do visit_availability quando a msg não traz (caso Andréia)", () => {
    const r = resolveVisitSlotParts({
      message: "9 horas",
      now: NOW,
      visitAvailability: "Sábado, 20 de junho, às 9h",
    })
    expect(r.day).not.toBeNull() // sábado (próximo)
    expect(r.time).toEqual({ hour: 9, minute: 0 })
  })

  it("mensagem do lead tem prioridade sobre visit_availability", () => {
    const r = resolveVisitSlotParts({
      message: "pode ser sexta às 10h",
      now: NOW,
      visitAvailability: "sábado às 9h",
    })
    expect(r.time).toEqual({ hour: 10, minute: 0 })
  })

  it("combina dia da msg com hora pendente", () => {
    const r = resolveVisitSlotParts({
      message: "sexta",
      now: NOW,
      pendingTime: { hour: 15, minute: 0 },
    })
    expect(r.day).not.toBeNull()
    expect(r.time).toEqual({ hour: 15, minute: 0 })
  })

  it("só dia (sem hora em lugar nenhum) → time null (não agenda)", () => {
    const r = resolveVisitSlotParts({
      message: "quero visitar",
      now: NOW,
      visitAvailability: "quero visitar sábado",
    })
    expect(r.time).toBeNull()
  })

  it("sem sinais → dia e hora null", () => {
    const r = resolveVisitSlotParts({ message: "bom dia", now: NOW, visitAvailability: "quero conhecer" })
    expect(r.day).toBeNull()
    expect(r.time).toBeNull()
  })
})

describe("parseRequestedSlot", () => {
  it("dia + hora explícitos dentro do horário → startUtc", () => {
    const s = parseRequestedSlot("pode ser quinta às 15h", NOW)
    expect(s.hasDay).toBe(true)
    expect(s.hasTime).toBe(true)
    expect(s.outsideHours).toBe(false)
    expect(s.startUtc?.toISOString()).toBe("2026-06-18T18:00:00.000Z") // 15h BRT
  })

  it("amanhã às 10h → próximo dia 10h BRT", () => {
    const s = parseRequestedSlot("amanhã às 10h fica bom", NOW)
    expect(s.startUtc?.toISOString()).toBe("2026-06-19T13:00:00.000Z")
  })

  it("meio-dia de amanhã → 12h BRT", () => {
    const s = parseRequestedSlot("pode ser meio-dia de amanhã", NOW)
    expect(s.startUtc?.toISOString()).toBe("2026-06-19T15:00:00.000Z")
  })

  it("sábado às 11h → válido (sábado fecha 12h)", () => {
    const s = parseRequestedSlot("sábado às 11h", NOW)
    expect(s.startUtc?.toISOString()).toBe("2026-06-20T14:00:00.000Z")
  })

  it("domingo → fora do horário (fechado)", () => {
    const s = parseRequestedSlot("domingo às 10h", NOW)
    expect(s.hasDay).toBe(true)
    expect(s.outsideHours).toBe(true)
    expect(s.startUtc).toBeNull()
  })

  it("quinta às 20h → fora do horário comercial", () => {
    const s = parseRequestedSlot("quinta às 20h", NOW)
    expect(s.outsideHours).toBe(true)
    expect(s.startUtc).toBeNull()
  })

  it("sexta às 7h → antes da abertura", () => {
    const s = parseRequestedSlot("sexta às 7h", NOW)
    expect(s.outsideHours).toBe(true)
    expect(s.startUtc).toBeNull()
  })

  it("sábado às 13h → após o fechamento de sábado", () => {
    const s = parseRequestedSlot("sábado às 13h", NOW)
    expect(s.outsideHours).toBe(true)
  })

  it("só o dia, sem horário → hasDay sem startUtc", () => {
    const s = parseRequestedSlot("pode ser quinta", NOW)
    expect(s.hasDay).toBe(true)
    expect(s.hasTime).toBe(false)
    expect(s.startUtc).toBeNull()
  })

  it("só o horário, sem dia → hasTime sem startUtc", () => {
    const s = parseRequestedSlot("às 15h", NOW)
    expect(s.hasDay).toBe(false)
    expect(s.hasTime).toBe(true)
    expect(s.startUtc).toBeNull()
  })

  it("horário no passado (hoje 10h, já são 14h) → não vira slot", () => {
    const s = parseRequestedSlot("hoje às 10h", NOW)
    expect(s.startUtc).toBeNull()
    expect(s.outsideHours).toBe(false)
  })

  it("hoje à tarde futuro → válido", () => {
    const s = parseRequestedSlot("hoje às 16h", NOW)
    expect(s.startUtc?.toISOString()).toBe("2026-06-18T19:00:00.000Z")
  })

  it("não confunde 'ter' em 'gostaria de ter' com terça", () => {
    const s = parseRequestedSlot("gostaria de ter mais informações", NOW)
    expect(s.hasDay).toBe(false)
  })

  it("não confunde '2 suítes' com horário", () => {
    const s = parseRequestedSlot("quero 2 suítes", NOW)
    expect(s.hasTime).toBe(false)
  })

  it("'3 da tarde' → 15h BRT", () => {
    const s = parseRequestedSlot("quinta às 3 da tarde", NOW)
    expect(s.startUtc?.toISOString()).toBe("2026-06-18T18:00:00.000Z")
  })
})

describe("partes (combinação dia+hora entre turnos)", () => {
  it("parseDayParts pega só o dia; parseTimeParts pega só a hora", () => {
    expect(parseDayParts("pode ser quinta", NOW)).toEqual({ y: 2026, m: 5, d: 18 })
    expect(parseTimeParts("às 15h")).toEqual({ hour: 15, minute: 0 })
    expect(parseTimeParts("pode ser quinta")).toBeNull()
    expect(parseDayParts("às 15h", NOW)).toBeNull()
  })

  it("dayPartsToIso / isoToDayParts são inversos (mês 1-based no ISO)", () => {
    const iso = dayPartsToIso({ y: 2026, m: 5, d: 18 })
    expect(iso).toBe("2026-06-18")
    expect(isoToDayParts(iso)).toEqual({ y: 2026, m: 5, d: 18 })
    expect(isoToDayParts("lixo")).toBeNull()
  })

  it("evaluateSlot combina dia pendente + hora nova → startUtc", () => {
    const day = isoToDayParts("2026-06-19")! // sexta
    const time = parseTimeParts("às 10h")!
    const { startUtc, outsideHours } = evaluateSlot(day, time, NOW)
    expect(outsideHours).toBe(false)
    expect(startUtc?.toISOString()).toBe("2026-06-19T13:00:00.000Z")
  })

  it("evaluateSlot marca outsideHours para domingo", () => {
    const { startUtc, outsideHours } = evaluateSlot(isoToDayParts("2026-06-21")!, { hour: 10, minute: 0 }, NOW)
    expect(startUtc).toBeNull()
    expect(outsideHours).toBe(true)
  })
})

// ─────────── Story 81-1 — Nicole house-only (Epic 81 HOUSE × IMOB) ───────────

interface FakeApptRow {
  id: string
  org_id: string
  team: string
  status: string
  scheduled_at: string
}

/**
 * Fake mínimo do query-builder do supabase-js para `isSlotFree` (via
 * checkSlotAvailability): suporta a cadeia .from().select().eq().in().gt()
 * .lt().neq().limit().maybeSingle() aplicando os filtros de verdade sobre um
 * array de linhas — assim o teste exercita o COMPORTAMENTO (imob não bloqueia),
 * não só a presença do filtro.
 */
function fakeSupabase(rows: FakeApptRow[]): SupabaseClient {
  function builder(current: FakeApptRow[]) {
    const q = {
      select: () => q,
      eq: (col: string, val: unknown) => builder(current.filter((r) => (r as unknown as Record<string, unknown>)[col] === val)),
      neq: (col: string, val: unknown) => builder(current.filter((r) => (r as unknown as Record<string, unknown>)[col] !== val)),
      in: (col: string, vals: unknown[]) => builder(current.filter((r) => vals.includes((r as unknown as Record<string, unknown>)[col]))),
      gt: (col: string, val: string) => builder(current.filter((r) => String((r as unknown as Record<string, unknown>)[col]) > val)),
      lt: (col: string, val: string) => builder(current.filter((r) => String((r as unknown as Record<string, unknown>)[col]) < val)),
      limit: () => q,
      maybeSingle: async () => ({ data: current[0] ?? null }),
    }
    return q
  }
  return { from: () => builder(rows) } as unknown as SupabaseClient
}

describe("checkSlotAvailability por equipe (Story 81-1)", () => {
  // Segunda-feira 2026-07-20 14:00 BRT = 17:00Z (dentro do expediente)
  const SLOT = new Date("2026-07-20T17:00:00Z")
  const row = (team: string, iso: string): FakeApptRow => ({
    id: `appt-${team}-${iso}`,
    org_id: "org1",
    team,
    status: "scheduled",
    scheduled_at: iso,
  })

  it("compromisso IMOB no mesmo horário NÃO bloqueia a Nicole (equipes independentes)", async () => {
    const sb = fakeSupabase([row("imob", "2026-07-20T17:00:00.000Z")])
    const { free } = await checkSlotAvailability(sb, "org1", SLOT)
    expect(free).toBe(true)
  })

  it("compromisso HOUSE no mesmo horário bloqueia (comportamento original preservado)", async () => {
    const sb = fakeSupabase([row("house", "2026-07-20T17:00:00.000Z")])
    const { free, alternatives } = await checkSlotAvailability(sb, "org1", SLOT)
    expect(free).toBe(false)
    expect(alternatives.length).toBeGreaterThan(0)
  })

  it("alternativas oferecidas também ignoram compromissos IMOB", async () => {
    // house ocupa 14h; imob ocupa 15h — a 1ª alternativa deve ser 15h mesmo assim
    const sb = fakeSupabase([
      row("house", "2026-07-20T17:00:00.000Z"),
      row("imob", "2026-07-20T18:00:00.000Z"),
    ])
    const { free, alternatives } = await checkSlotAvailability(sb, "org1", SLOT)
    expect(free).toBe(false)
    expect(alternatives[0]?.toISOString()).toBe("2026-07-20T18:00:00.000Z")
  })
})
