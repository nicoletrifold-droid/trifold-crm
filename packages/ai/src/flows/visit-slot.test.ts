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
  isAmbiguousSlotText,
  parsePeriodParts,
  freeSlotsInPeriod,
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

  it("sugestões saem de 30 em 30 min; vizinhos que sobrepõem a visita ocupada ficam fora", async () => {
    // house ocupa 14:00–15:00 → 14:30 sobrepõe (fora); livres: 15:00, 15:30, 16:00
    const sb = fakeSupabase([row("house", "2026-07-20T17:00:00.000Z")])
    const { free, alternatives } = await checkSlotAvailability(sb, "org1", SLOT)
    expect(free).toBe(false)
    expect(alternatives.map((a) => a.toISOString())).toEqual([
      "2026-07-20T18:00:00.000Z", // 15:00 BRT
      "2026-07-20T18:30:00.000Z", // 15:30 BRT
      "2026-07-20T19:00:00.000Z", // 16:00 BRT
    ])
  })

  it("pedido às 14:30 livre é aceito (passo de 30min também na entrada)", async () => {
    const sb = fakeSupabase([])
    const { free } = await checkSlotAvailability(sb, "org1", new Date("2026-07-20T17:30:00Z"))
    expect(free).toBe(true)
  })
})

describe("evaluateSlot — visita precisa caber no expediente (2026-07-23)", () => {
  it("17:00 com fechamento 18:00 = válido (termina exatamente no fechamento)", () => {
    const { startUtc, outsideHours } = evaluateSlot(isoToDayParts("2026-07-20")!, { hour: 17, minute: 0 }, NOW)
    expect(outsideHours).toBe(false)
    expect(startUtc?.toISOString()).toBe("2026-07-20T20:00:00.000Z")
  })
  it("17:30 com fechamento 18:00 = fora (a visita de 1h varia o expediente)", () => {
    const { startUtc, outsideHours } = evaluateSlot(isoToDayParts("2026-07-20")!, { hour: 17, minute: 30 }, NOW)
    expect(startUtc).toBeNull()
    expect(outsideHours).toBe(true)
  })
  it("14:30 em dia útil = válido", () => {
    const { startUtc, outsideHours } = evaluateSlot(isoToDayParts("2026-07-20")!, { hour: 14, minute: 30 }, NOW)
    expect(outsideHours).toBe(false)
    expect(startUtc?.toISOString()).toBe("2026-07-20T17:30:00.000Z")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Story 75-245 — incidente do lead Ailton (30/07/2026): a frase de horário de
// atendimento da PRÓPRIA Nicole foi gravada em visit_availability e o parser
// tirou dela "segunda" + "meio-dia" → agendou segunda 03/08 12h sem o cliente
// ter dito dia nem hora (a mensagem dele era o CPF).
// ─────────────────────────────────────────────────────────────────────────────

// Âncora do incidente: 2026-07-31T01:05:00Z = quinta 30/07 22:05 BRT.
const NOW_INCIDENTE = new Date("2026-07-31T01:05:00Z")
const FRASE_EXPEDIENTE =
  "Atendemos de segunda a sexta das 8h às 18h e sábado das 8h ao meio-dia"

describe("isAmbiguousSlotText (Story 75-245)", () => {
  it("frase de horário de atendimento é ambígua (o texto que causou o incidente)", () => {
    expect(isAmbiguousSlotText(FRASE_EXPEDIENTE)).toBe(true)
  })
  it("faixa de horário, 'atendemos' e 2+ dias da semana são ambíguos", () => {
    expect(isAmbiguousSlotText("das 8h às 18h")).toBe(true)
    expect(isAmbiguousSlotText("atendemos no sábado")).toBe(true)
    expect(isAmbiguousSlotText("pode ser sábado ou domingo")).toBe(true)
    expect(isAmbiguousSlotText("nosso horário de atendimento é esse")).toBe(true)
  })
  it("2+ horários (oferta de opções) é ambíguo", () => {
    expect(isAmbiguousSlotText("tenho 9h ou 10h livres, qual prefere?")).toBe(true)
    expect(isAmbiguousSlotText("sábado às 8h, 8h30 ou 9h")).toBe(true)
  })
  it("slot ÚNICO não é ambíguo — a 75-162 continua funcionando", () => {
    expect(isAmbiguousSlotText("Sábado, 18 de julho, às 9h")).toBe(false)
    expect(isAmbiguousSlotText("sábado, 1º de agosto às 10h")).toBe(false)
    expect(isAmbiguousSlotText("amanhã às 15h")).toBe(false)
    expect(isAmbiguousSlotText(null)).toBe(false)
  })
})

describe("resolveVisitSlotParts blinda o visit_availability (Story 75-245)", () => {
  it("AC1: frase de expediente NÃO vira slot (antes: segunda 03/08 12:00)", () => {
    const { day, time } = resolveVisitSlotParts({
      message: "CPF 174.677.569.68",
      now: NOW_INCIDENTE,
      visitAvailability: FRASE_EXPEDIENTE,
    })
    expect(day).toBeNull()
    expect(time).toBeNull()
  })
  it("prova do bug: o texto ainda resolve para segunda 12h quando parseado direto", () => {
    // Documenta a causa raiz — o parser não mudou, quem mudou foi quem confia nele.
    expect(parseDayParts(FRASE_EXPEDIENTE, NOW_INCIDENTE)).toEqual({ y: 2026, m: 7, d: 3 })
    expect(parseTimeParts(FRASE_EXPEDIENTE)).toEqual({ hour: 12, minute: 0 })
  })
  it("AC3: slot único no visit_availability continua agendável (75-162)", () => {
    const { day, time } = resolveVisitSlotParts({
      message: "confirmo",
      now: new Date("2026-07-15T17:00:00Z"),
      visitAvailability: "Sábado, 18 de julho, às 9h",
    })
    expect(day).toEqual({ y: 2026, m: 6, d: 18 })
    expect(time).toEqual({ hour: 9, minute: 0 })
  })
})

describe("parseTimeParts — separador de minutos (Story 75-245 AC4)", () => {
  it("'10,00 hora' é 10:00 (antes virava 00:00 e era descartado)", () => {
    expect(parseTimeParts("10,00 hora")).toEqual({ hour: 10, minute: 0 })
  })
  it("aceita ponto, vírgula e minutos diferentes de zero", () => {
    expect(parseTimeParts("10.00 hora")).toEqual({ hour: 10, minute: 0 })
    expect(parseTimeParts("as 10,30 horas")).toEqual({ hour: 10, minute: 30 })
    expect(parseTimeParts("10h00")).toEqual({ hour: 10, minute: 0 })
    expect(parseTimeParts("10,00 da manhã")).toEqual({ hour: 10, minute: 0 })
  })
  it("CPF e dinheiro NÃO viram horário", () => {
    expect(parseTimeParts("CPF 174.677.569.68")).toBeNull()
    expect(parseTimeParts("quero dar de entrada uns 25.000,00")).toBeNull()
    expect(parseTimeParts("R$ 250.000,00")).toBeNull()
  })
  it("'dia 5 de manhã' é dia 5 + período, não 5h", () => {
    expect(parseTimeParts("pode ser dia 5 de manhã")).toBeNull()
    expect(parseDayParts("pode ser dia 5 de manhã", NOW_INCIDENTE)).toEqual({ y: 2026, m: 7, d: 5 })
  })
})

describe("parsePeriodParts (Story 75-245 AC5)", () => {
  it("entende manhã e tarde sem número", () => {
    expect(parsePeriodParts("Pode ser de manhã...")).toBe("manha")
    expect(parsePeriodParts("prefiro à tarde")).toBe("tarde")
    expect(parsePeriodParts("de manhazinha")).toBe("manha")
  })
  it("não confunde 'amanhã' com 'manhã' nem 'mais tarde' com o período", () => {
    expect(parsePeriodParts("amanhã eu vejo")).toBeNull()
    expect(parsePeriodParts("me chama mais tarde")).toBeNull()
  })
  it("horário explícito manda — período não se aplica", () => {
    expect(parsePeriodParts("10h da manhã")).toBeNull()
    expect(parsePeriodParts("às 15h")).toBeNull()
  })
  it("dia + período: o período é lido mesmo com o dia na frase", () => {
    expect(parsePeriodParts("tem como ser sábado de manhã?")).toBe("manha")
  })
})

describe("freeSlotsInPeriod (Story 75-245 AC5)", () => {
  // Sábado 2026-08-01 (fecha ao meio-dia). Visita house às 10h BRT = 13:00Z —
  // exatamente o compromisso que já existia quando a Nicole prometeu 10h.
  const SABADO = isoToDayParts("2026-08-01")!
  const ocupado10h: FakeApptRow = {
    id: "appt-house-10h",
    org_id: "org1",
    team: "house",
    status: "scheduled",
    scheduled_at: "2026-08-01T13:00:00.000Z",
  }

  it("manhã de sábado com 10h ocupado → oferece 8h, 8h30 e 9h", async () => {
    const slots = await freeSlotsInPeriod(fakeSupabase([ocupado10h]), "org1", SABADO, "manha", NOW_INCIDENTE)
    expect(slots.map((s) => s.toISOString())).toEqual([
      "2026-08-01T11:00:00.000Z", // 8:00 BRT
      "2026-08-01T11:30:00.000Z", // 8:30 BRT
      "2026-08-01T12:00:00.000Z", // 9:00 BRT
    ])
  })

  it("tarde de sábado é vazio — o expediente fecha ao meio-dia", async () => {
    const slots = await freeSlotsInPeriod(fakeSupabase([]), "org1", SABADO, "tarde", NOW_INCIDENTE)
    expect(slots).toEqual([])
  })

  it("ignora horário que já passou e sobreposição com a visita ocupada", async () => {
    // Agora = sábado 09:45 BRT: 8h/8h30/9h passaram; 10h e 10h30 sobrepõem a das 10h.
    const agora = new Date("2026-08-01T12:45:00Z")
    const slots = await freeSlotsInPeriod(fakeSupabase([ocupado10h]), "org1", SABADO, "manha", agora)
    expect(slots.map((s) => s.toISOString())).toEqual(["2026-08-01T14:00:00.000Z"]) // 11:00 BRT
  })

  it("compromisso IMOB no mesmo horário não tira o slot da Nicole (Epic 81)", async () => {
    const imob: FakeApptRow = { ...ocupado10h, id: "appt-imob", team: "imob" }
    const slots = await freeSlotsInPeriod(fakeSupabase([imob]), "org1", SABADO, "manha", new Date("2026-08-01T12:45:00Z"))
    expect(slots.map((s) => s.toISOString())).toEqual([
      "2026-08-01T13:00:00.000Z", // 10:00 BRT
      "2026-08-01T13:30:00.000Z",
      "2026-08-01T14:00:00.000Z",
    ])
  })
})

describe("parseDayParts — data com mês escrito (Story 75-245)", () => {
  it("'1º de agosto' é a data explícita, não 'o próximo sábado'", () => {
    expect(parseDayParts("Sábado, 1º de agosto às 10h", NOW_INCIDENTE)).toEqual({ y: 2026, m: 7, d: 1 })
  })
  it("data distante não é mais colapsada no próximo dia da semana", () => {
    // Antes: "segunda-feira, 10 de agosto" caía na próxima segunda (03/08).
    expect(parseDayParts("segunda-feira, 10 de agosto às 14h", NOW_INCIDENTE)).toEqual({ y: 2026, m: 7, d: 10 })
  })
  it("mês já passado no ano corrente rola para o ano seguinte", () => {
    expect(parseDayParts("pode ser 5 de março", NOW_INCIDENTE)).toEqual({ y: 2027, m: 2, d: 5 })
  })
  it("dia da semana sem mês continua funcionando (próxima ocorrência)", () => {
    expect(parseDayParts("tem como ver no sábado", NOW_INCIDENTE)).toEqual({ y: 2026, m: 7, d: 1 })
  })
})

describe("parsePeriodParts — saudação não é período (Story 75-245)", () => {
  it("'boa tarde' e 'bom dia' não viram pedido de período", () => {
    expect(parsePeriodParts("Boa tarde!")).toBeNull()
    expect(parsePeriodParts("bom dia, tudo bem?")).toBeNull()
    expect(parsePeriodParts("boa noite")).toBeNull()
  })
  it("saudação + pedido real: o pedido vence", () => {
    expect(parsePeriodParts("Boa tarde! pode ser de manhã?")).toBe("manha")
    expect(parsePeriodParts("bom dia! prefiro à tarde")).toBe("tarde")
  })
})

// ============================================================================
// Story 75-268 — hora sem "h" ("Umas 14", "as 10")
// Âncora dos incidentes: 03/08/2026 21:52Z = segunda 18:52 BRT.
// ============================================================================
const NOW_268 = new Date("2026-08-03T21:52:00Z")
const BARE = { bareNumberAllowed: true }

describe("parseTimeParts — número pelado é opt-in (Story 75-268 AC1)", () => {
  it("as strings dos incidentes só resolvem COM a opção ligada", () => {
    // Sueli, 03/08 18:52
    expect(parseTimeParts("Umas 14")).toBeNull()
    expect(parseTimeParts("Umas 14", BARE)).toEqual({ hour: 14, minute: 0 })
    // Valnira, 03/08 21:09 e 21:10
    expect(parseTimeParts("Na quinta as 10")).toBeNull()
    expect(parseTimeParts("Na quinta as 10", BARE)).toEqual({ hour: 10, minute: 0 })
    expect(parseTimeParts("As 10")).toBeNull()
    expect(parseTimeParts("As 10", BARE)).toEqual({ hour: 10, minute: 0 })
  })
  it("outras formas naturais de dizer a hora sem 'h'", () => {
    expect(parseTimeParts("10", BARE)).toEqual({ hour: 10, minute: 0 })
    expect(parseTimeParts("por volta das 14", BARE)).toEqual({ hour: 14, minute: 0 })
    expect(parseTimeParts("pode ser 9", BARE)).toEqual({ hour: 9, minute: 0 })
    expect(parseTimeParts("umas 17 então", BARE)).toEqual({ hour: 17, minute: 0 })
  })
  it("o caminho com marcador continua idêntico (nenhuma regressão)", () => {
    expect(parseTimeParts("as 14h", BARE)).toEqual({ hour: 14, minute: 0 })
    expect(parseTimeParts("14:30", BARE)).toEqual({ hour: 14, minute: 30 })
    expect(parseTimeParts("10,00 hora", BARE)).toEqual({ hour: 10, minute: 0 })
    expect(parseTimeParts("meio-dia", BARE)).toEqual({ hour: 12, minute: 0 })
    expect(parseTimeParts("3 da tarde", BARE)).toEqual({ hour: 15, minute: 0 })
  })
})

describe("parseTimeParts — número que NÃO é hora (Story 75-268 AC2)", () => {
  it("jargão de imóvel não vira horário, mesmo com a opção ligada", () => {
    expect(parseTimeParts("Acima do 5", BARE)).toBeNull()
    expect(parseTimeParts("São todos com 2 suítes", BARE)).toBeNull()
    expect(parseTimeParts("tem 66,91m² de área privativa", BARE)).toBeNull()
    expect(parseTimeParts("preciso de 3 vagas", BARE)).toBeNull()
    expect(parseTimeParts("uns 500 mil", BARE)).toBeNull()
    expect(parseTimeParts("quero no 12 andar", BARE)).toBeNull()
    expect(parseTimeParts("no andar 15", BARE)).toBeNull()
    expect(parseTimeParts("a partir de 79m2", BARE)).toBeNull()
    expect(parseTimeParts("entrega em 2029", BARE)).toBeNull()
    expect(parseTimeParts("tenho 18 anos de casa", BARE)).toBeNull()
  })
  it("data não vira hora", () => {
    expect(parseTimeParts("dia 10", BARE)).toBeNull()
    expect(parseTimeParts("pode ser 10 de agosto", BARE)).toBeNull()
    expect(parseTimeParts("dia 5 de manhã", BARE)).toBeNull()
  })
  it("endereço, CPF, telefone e dinheiro seguem protegidos", () => {
    expect(parseTimeParts("Av. Nildo Ribeiro da Rocha, 1337", BARE)).toBeNull()
    expect(parseTimeParts("CPF 174.677.569.68", BARE)).toBeNull()
    expect(parseTimeParts("R$ 250.000,00", BARE)).toBeNull()
    expect(parseTimeParts("meu whats é 554488296886", BARE)).toBeNull()
  })
})

describe("Story 75-268 AC3/AC4 — os dois diálogos reais, turno a turno", () => {
  it("Valnira: dia num turno, 'as 10' no seguinte → quinta 06/08 10:00 BRT", () => {
    // Turno 1 — "Quinta ou sexta": resolve o dia, sem hora → fica pendente.
    const t1 = resolveVisitSlotParts({ message: "Quinta ou sexta", now: NOW_268, timeOptions: BARE })
    expect(t1.day).toEqual({ y: 2026, m: 7, d: 6 })
    expect(t1.time).toBeNull()
    // Turno 2 — "Na quinta as 10", com o dia pendente do turno 1.
    const t2 = resolveVisitSlotParts({
      message: "Na quinta as 10",
      now: NOW_268,
      pendingDay: t1.day,
      timeOptions: BARE,
    })
    expect(t2.time).toEqual({ hour: 10, minute: 0 })
    const ev = evaluateSlot(t2.day!, t2.time!, NOW_268)
    expect(ev.outsideHours).toBe(false)
    // 10:00 BRT = 13:00Z — exatamente o scheduled_at gravado à mão em prod.
    expect(ev.startUtc?.toISOString()).toBe("2026-08-06T13:00:00.000Z")
  })

  it("Sueli: 'Sexta a tarde' → 'Umas 14' → sexta 07/08 14:00 BRT (dentro do expediente)", () => {
    // Turno 1 — dia + período, sem hora: o fluxo oferece horários livres da tarde.
    const t1 = resolveVisitSlotParts({ message: "Sexta a tarde", now: NOW_268, timeOptions: BARE })
    expect(t1.day).toEqual({ y: 2026, m: 7, d: 7 })
    expect(t1.time).toBeNull()
    expect(parsePeriodParts("Sexta a tarde")).toBe("tarde")
    // Turno 2 — "Umas 14" com o dia pendente.
    const t2 = resolveVisitSlotParts({
      message: "Umas 14",
      now: NOW_268,
      pendingDay: t1.day,
      timeOptions: BARE,
    })
    expect(t2.time).toEqual({ hour: 14, minute: 0 })
    const ev = evaluateSlot(t2.day!, t2.time!, NOW_268)
    // Sexta 14h NUNCA foi fora do expediente — a Nicole é que disse que era.
    expect(ev.outsideHours).toBe(false)
    // 14:00 BRT = 17:00Z — o scheduled_at que o corretor gravou à mão 18h depois.
    expect(ev.startUtc?.toISOString()).toBe("2026-08-07T17:00:00.000Z")
  })
})

describe("Story 75-268 AC6 — período do lead não herda dia velho", () => {
  const AVAIL_SABADO = "Sábado, 8 de agosto, às 9h"
  it("'Semana de manhã' com visit_availability de sábado → NÃO assume sábado", () => {
    const r = resolveVisitSlotParts({
      message: "Semana de manhã",
      now: NOW_268,
      visitAvailability: AVAIL_SABADO,
      timeOptions: BARE,
    })
    expect(parsePeriodParts("Semana de manhã")).toBe("manha")
    expect(r.day).toBeNull() // sem dia → o fluxo PERGUNTA o dia
  })
  it("mas quando o lead dá o dia, o visit_availability continua completando a hora", () => {
    const r = resolveVisitSlotParts({
      message: "pode ser sábado",
      now: NOW_268,
      visitAvailability: AVAIL_SABADO,
    })
    expect(r.day).toEqual({ y: 2026, m: 7, d: 8 })
    expect(r.time).toEqual({ hour: 9, minute: 0 })
  })
  it("e sem período na mensagem o fallback de dia segue valendo (75-162 preservada)", () => {
    const r = resolveVisitSlotParts({
      message: "confirmado",
      now: NOW_268,
      visitAvailability: AVAIL_SABADO,
    })
    expect(r.day).toEqual({ y: 2026, m: 7, d: 8 })
    expect(r.time).toEqual({ hour: 9, minute: 0 })
  })
})
