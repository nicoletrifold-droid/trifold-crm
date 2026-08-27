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
  espalhar,
  isSlotFree,
} from "./visit-slot"
import { buildAgendaState, type AgendaState } from "./agenda-state"
import { extractCollectedData } from "./qualification"

// Âncora: 2026-06-18T17:00:00Z = quinta-feira 14:00 em BRT (UTC-3).
const NOW = new Date("2026-06-18T17:00:00Z")

/**
 * Story 87-4 — o estado herdado deixou de ser três parâmetros soltos
 * (`pendingDay` + `pendingTime` + `visitAvailability`, sendo o último uma STRING
 * reancorada a cada leitura) e virou UM `AgendaState` com o dia já absoluto.
 * Este helper existe para que os testes das stories anteriores continuem
 * exercitando o MESMO cenário no formato novo.
 */
/**
 * `fonte` é OBRIGATÓRIA aqui de propósito: ela é o que substituiu a distinção que
 * as quatro chaves antigas carregavam. Cada teste declara qual chave do `HEAD`
 * está reencenando — `visit_availability` → `"mencao"`, `visit_pending_*` →
 * `"pendencia"`. Um default esconderia exatamente o que precisa ficar visível.
 */
function estado(
  p: {
    fonte: "pendencia" | "mencao"
    dataAbsoluta?: string | null
    hora?: number | null
    minuto?: number | null
    periodo?: "manha" | "tarde" | null
    citacao?: string
  },
  ancoraEm: Date = NOW
): AgendaState {
  const { citacao, ...partes } = p
  return buildAgendaState({ citacao: citacao ?? "(fixture do teste)", now: ancoraEm, ...partes })
}

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
  it("resolve dia+hora só do estado quando a msg não traz (caso Andréia)", () => {
    const r = resolveVisitSlotParts({
      message: "9 horas",
      now: NOW,
      agendaState: estado({ fonte: "mencao", dataAbsoluta: "2026-06-20", hora: 9, citacao: "Sábado, 20 de junho, às 9h" }),
    })
    expect(r.day).toEqual({ y: 2026, m: 5, d: 20 })
    expect(r.time).toEqual({ hour: 9, minute: 0 })
  })

  it("mensagem do lead tem prioridade sobre o estado", () => {
    const r = resolveVisitSlotParts({
      message: "pode ser sexta às 10h",
      now: NOW,
      agendaState: estado({ fonte: "mencao", dataAbsoluta: "2026-06-20", hora: 9, citacao: "sábado às 9h" }),
    })
    expect(r.time).toEqual({ hour: 10, minute: 0 })
    expect(r.day).toEqual({ y: 2026, m: 5, d: 19 }) // sexta 19/06, não o sábado do estado
  })

  it("combina dia da msg com hora do estado", () => {
    const r = resolveVisitSlotParts({
      message: "sexta",
      now: NOW,
      agendaState: estado({ fonte: "pendencia", hora: 15, minuto: 0 }),
    })
    expect(r.day).not.toBeNull()
    expect(r.time).toEqual({ hour: 15, minute: 0 })
  })

  it("só dia (sem hora em lugar nenhum) → time null (não agenda)", () => {
    const r = resolveVisitSlotParts({
      message: "quero visitar",
      now: NOW,
      agendaState: estado({ fonte: "mencao", dataAbsoluta: "2026-06-20", citacao: "quero visitar sábado" }),
    })
    expect(r.time).toBeNull()
  })

  it("sem sinais → dia e hora null", () => {
    const r = resolveVisitSlotParts({
      message: "bom dia",
      now: NOW,
      agendaState: estado({ fonte: "mencao", citacao: "quero conhecer" }),
    })
    expect(r.day).toBeNull()
    expect(r.time).toBeNull()
  })

  it("🔴 Story 87-4 — a CITAÇÃO nunca é fonte de parse: a data não anda", () => {
    // O defeito que esta story fecha: a mesma frase resolvia um sábado diferente
    // a cada semana em que fosse lida. Agora a citação é só auditoria.
    const st = estado({ fonte: "mencao", dataAbsoluta: null, citacao: "…durante a semana ou no sábado de manhã?" })
    for (const now of ["2026-08-05", "2026-08-12", "2026-08-19"].map((d) => new Date(`${d}T12:00:00Z`))) {
      expect(resolveVisitSlotParts({ message: "Oi", now, agendaState: st }).day).toBeNull()
    }
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
/**
 * Story 87-17 `AC4` — `hooks` instrumenta o fake para MEDIR as idas ao banco:
 * `onEmit` marca a consulta emitida (a chamada de `.maybeSingle()`) e `onResolve`
 * marca a resolução dela. É o que permite provar profundidade sequencial = 1
 * (todas emitidas antes de a primeira resolver) sem inspecionar a implementação.
 * Sem hooks o comportamento é idêntico ao de antes.
 */
/**
 * Story 87-18 (`T0`) — o fake ganha o modo de INJETAR erro de consulta:
 * `{ data: null, error }`, que é exatamente o que o PostgREST devolve em RLS
 * negado / coluna renomeada / timeout / schema cache stale — sem REJEITAR. Sem
 * isso nenhuma AC desta story é testável, porque o defeito original não é uma
 * exceção: é um retorno normal mal interpretado.
 *
 * `index` é a ORDEM da consulta emitida na chamada (0 = primeiro candidato) e
 * `slotUtc` é o candidato que ela está checando, recuperado do ponto médio da
 * janela `gt`/`lt` que `isSlotFree` monta (`start ± 59min`) — permite injetar
 * "por índice" ou "por predicado sobre `scheduled_at`", as duas formas que a
 * `T0` pede.
 */
interface FalhaDeConsulta {
  index: number
  slotUtc: Date
}

function fakeSupabase(
  rows: FakeApptRow[],
  hooks?: { onEmit?: () => void; onResolve?: () => void },
  falharSe?: (ctx: FalhaDeConsulta) => boolean
): SupabaseClient {
  let emitidas = 0
  function builder(current: FakeApptRow[], janela: { gt?: string; lt?: string }) {
    const q = {
      select: () => q,
      eq: (col: string, val: unknown) => builder(current.filter((r) => (r as unknown as Record<string, unknown>)[col] === val), janela),
      neq: (col: string, val: unknown) => builder(current.filter((r) => (r as unknown as Record<string, unknown>)[col] !== val), janela),
      in: (col: string, vals: unknown[]) => builder(current.filter((r) => vals.includes((r as unknown as Record<string, unknown>)[col])), janela),
      gt: (col: string, val: string) => builder(current.filter((r) => String((r as unknown as Record<string, unknown>)[col]) > val), { ...janela, gt: val }),
      lt: (col: string, val: string) => builder(current.filter((r) => String((r as unknown as Record<string, unknown>)[col]) < val), { ...janela, lt: val }),
      limit: () => q,
      maybeSingle: () => {
        const index = emitidas++
        hooks?.onEmit?.()
        const slotUtc = new Date(
          (new Date(janela.gt ?? 0).getTime() + new Date(janela.lt ?? 0).getTime()) / 2
        )
        const falhar = falharSe?.({ index, slotUtc }) ?? false
        return Promise.resolve().then(() => {
          hooks?.onResolve?.()
          if (falhar) {
            // Forma EXATA do PostgREST em erro de consulta: `data: null` + `error`,
            // sem rejeição. É este par que o `HEAD` lia como "livre".
            return { data: null, error: { message: 'permission denied for table "appointments"' } }
          }
          return { data: current[0] ?? null, error: null }
        })
      },
    }
    return q
  }
  return { from: () => builder(rows, {}) } as unknown as SupabaseClient
}

/** Story 87-18 — conta as consultas ao `appointments` de UMA chamada (`AC2-ii`). */
function contadorDeConsultas(): { hooks: { onEmit: () => void }; total: () => number } {
  let n = 0
  return { hooks: { onEmit: () => { n++ } }, total: () => n }
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

describe("a guarda da 75-245 blinda a ESCRITA do estado (Story 87-4)", () => {
  // Story 87-4 — este bloco mudou de LUGAR, não de intenção. A guarda
  // `isAmbiguousSlotText` protegia o `visit_availability` dentro do
  // `resolveVisitSlotParts` porque era ali que a string crua era reparseada.
  // Com a string fora do caminho de parse, a guarda passa a valer onde o fato é
  // ESCRITO — e é lá que ela precisa estar, porque frase de expediente nunca
  // mais pode virar estado.
  it("AC1: frase de expediente NÃO vira estado de agenda (antes: segunda 03/08 12:00)", () => {
    const out = extractCollectedData(FRASE_EXPEDIENTE, {}, { origem: "lead", now: NOW_INCIDENTE })
    expect(out.agenda_state).toBeUndefined()
  })
  it("prova do bug: o texto ainda resolve para segunda 12h quando parseado direto", () => {
    // Documenta a causa raiz — o parser não mudou, quem mudou foi quem confia nele.
    expect(parseDayParts(FRASE_EXPEDIENTE, NOW_INCIDENTE)).toEqual({ y: 2026, m: 7, d: 3 })
    expect(parseTimeParts(FRASE_EXPEDIENTE)).toEqual({ hour: 12, minute: 0 })
  })
  it("AC3: slot único vira estado E continua agendável (75-162)", () => {
    const NOW_15_07 = new Date("2026-07-15T17:00:00Z")
    const out = extractCollectedData("Sábado, 18 de julho, às 9h", {}, { origem: "lead", now: NOW_15_07 })
    const st = out.agenda_state as AgendaState
    expect(st.data_absoluta).toBe("2026-07-18")
    expect(st.hora).toBe(9)
    // Texto solto do lead → MENÇÃO. É o que o `visit_availability` sempre foi.
    expect(st.fonte).toBe("mencao")
    const { day, time } = resolveVisitSlotParts({ message: "confirmo", now: NOW_15_07, agendaState: st })
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

  /**
   * 🔧 RECALIBRADO pela Story 87-17 (Defeito A), `AC10` item 1.
   * Era *"oferece 8h, 8h30 e 9h"* — a borda de abertura, que é exatamente o
   * defeito que a 87-17 fecha. Os LIVRES não mudaram (`8:00, 8:30, 9:00, 11:00`:
   * 9:30/10:00/10:30 colidem com a visita das 10h); o que mudou é QUAIS 3 dos 4
   * a Nicole oferece — `espalhar` amostra os índices 0, 2 e 3.
   */
  it("manhã de sábado com 10h ocupado → oferece 8h, 9h e 11h (espalhado nos 4 livres)", async () => {
    const { slots } = await freeSlotsInPeriod(fakeSupabase([ocupado10h]), "org1", SABADO, "manha", NOW_INCIDENTE)
    expect(slots.map((s) => s.toISOString())).toEqual([
      "2026-08-01T11:00:00.000Z", // 8:00 BRT
      "2026-08-01T12:00:00.000Z", // 9:00 BRT
      "2026-08-01T14:00:00.000Z", // 11:00 BRT
    ])
  })

  it("tarde de sábado é vazio — o expediente fecha ao meio-dia", async () => {
    const { slots } = await freeSlotsInPeriod(fakeSupabase([]), "org1", SABADO, "tarde", NOW_INCIDENTE)
    expect(slots).toEqual([])
  })

  it("ignora horário que já passou e sobreposição com a visita ocupada", async () => {
    // Agora = sábado 09:45 BRT: 8h/8h30/9h passaram; 10h e 10h30 sobrepõem a das 10h.
    const agora = new Date("2026-08-01T12:45:00Z")
    const { slots } = await freeSlotsInPeriod(fakeSupabase([ocupado10h]), "org1", SABADO, "manha", agora)
    expect(slots.map((s) => s.toISOString())).toEqual(["2026-08-01T14:00:00.000Z"]) // 11:00 BRT
  })

  it("compromisso IMOB no mesmo horário não tira o slot da Nicole (Epic 81)", async () => {
    const imob: FakeApptRow = { ...ocupado10h, id: "appt-imob", team: "imob" }
    const { slots } = await freeSlotsInPeriod(fakeSupabase([imob]), "org1", SABADO, "manha", new Date("2026-08-01T12:45:00Z"))
    expect(slots.map((s) => s.toISOString())).toEqual([
      "2026-08-01T13:00:00.000Z", // 10:00 BRT
      "2026-08-01T13:30:00.000Z",
      "2026-08-01T14:00:00.000Z",
    ])
  })
})

describe("espalhar (Story 87-17 AC3)", () => {
  const xs = [10, 20, 30, 40, 50, 60, 70, 80]

  it("AC3-i — quando cabe, não amostra: 2 e 3 candidatos saem inteiros e em ordem", () => {
    expect(espalhar([10, 20], 3)).toEqual([10, 20])
    expect(espalhar([10, 20, 30], 3)).toEqual([10, 20, 30])
    expect(espalhar([], 3)).toEqual([])
  })

  it("AC3-ii — k ≤ 1 não produz NaN nem undefined (a fórmula divide por k − 1)", () => {
    expect(espalhar(xs, 1)).toEqual([10]) // exatamente 1, o primeiro
    expect(espalhar(xs, 0)).toEqual([])
    expect(espalhar(xs, -1)).toEqual([])
    for (const k of [-1, 0, 1]) {
      expect(espalhar(xs, k).every((v) => typeof v === "number" && Number.isFinite(v))).toBe(true)
    }
  })

  it("AC3-iii — invariante de cobertura: primeiro e último sempre entram, ordenado e sem repetição", () => {
    // É esta invariante que faz "não existe nada mais tarde do que o último que
    // te ofereci" ser verdade (a `AC5` da Fatia 2 se apoia nela).
    for (let k = 2; k <= xs.length; k++) {
      for (let n = k + 1; n <= xs.length; n++) {
        const inp = xs.slice(0, n)
        const out = espalhar(inp, k)
        const rotulo = `n=${n} k=${k} → ${JSON.stringify(out)}`
        expect(out[0], rotulo).toBe(inp[0])
        expect(out[out.length - 1], rotulo).toBe(inp[n - 1])
        expect(out, rotulo).toEqual([...out].sort((a, b) => a - b))
        expect(new Set(out).size, rotulo).toBe(out.length)
        expect(out.length, rotulo).toBeLessThanOrEqual(k)
        expect(out.every((v) => v !== undefined), rotulo).toBe(true)
      }
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Story 87-17 — Fatia 1 / Defeito A: a oferta de período para de colar na
// borda de abertura. O laço do `HEAD` parava nos 3 primeiros livres, então
// "à tarde" era SEMPRE 12h/12h30/13h e "de manhã" SEMPRE 8h/8h30/9h —
// geométrico ao algoritmo, independente de haver compromisso.
// ═══════════════════════════════════════════════════════════════════════════
describe("freeSlotsInPeriod — oferta espalhada (Story 87-17 AC1/AC2/AC4)", () => {
  /**
   * A fixture é a conversa da Ana, REMEDIDA contra produção em 27/08/2026
   * (conversa `02d3a064-0271-4e34-b64a-c6ecd57ddae0`, org `0000…0001`, somente
   * SELECT): no instante da mentira (22:22:33Z de 26/08) existia UM único
   * compromisso `house` no dia 27/08 — 16:00 BRT (19:00Z), `status=scheduled`,
   * criado em 18/08 por `admin`. O compromisso de 12:00 BRT que hoje também
   * aparece no dia é o DESTA conversa (`created_by=nicole`, 22:42Z), criado
   * DEPOIS da mentira — por isso está fora da fixture, de propósito.
   */
  const DIA_ANA = isoToDayParts("2026-08-27")! // quinta-feira
  const AGORA_DA_MENTIRA = new Date("2026-08-26T22:22:33.815Z")
  const ocupado16h: FakeApptRow = {
    id: "63957a67-35ac-4a33-8796-f7152facbdc6",
    org_id: "org1",
    team: "house",
    status: "scheduled",
    scheduled_at: "2026-08-27T19:00:00.000Z", // 16:00 BRT
  }

  it("AC1 — a tarde da Ana passa a ser 12h, 14h e 17h (o HEAD dava 12h, 12h30 e 13h)", async () => {
    const { slots } = await freeSlotsInPeriod(fakeSupabase([ocupado16h]), "org1", DIA_ANA, "tarde", AGORA_DA_MENTIRA)
    expect(slots.map((s) => s.toISOString())).toEqual([
      "2026-08-27T15:00:00.000Z", // 12:00 BRT
      "2026-08-27T17:00:00.000Z", // 14:00 BRT
      "2026-08-27T20:00:00.000Z", // 17:00 BRT — o que a Nicole negou existir
    ])
  })

  it("AC1 — e os LIVRES da tarde são os 8 medidos em produção (a amostragem escolhe 3 DESSES 8)", async () => {
    // `limit` alto = o período inteiro, sem amostragem: prova que a fixture
    // reproduz exatamente a lista livre apurada no banco de produção.
    const { slots: todos } = await freeSlotsInPeriod(fakeSupabase([ocupado16h]), "org1", DIA_ANA, "tarde", AGORA_DA_MENTIRA, undefined, 11)
    expect(todos.map((s) => s.toISOString())).toEqual([
      "2026-08-27T15:00:00.000Z", // 12:00 BRT
      "2026-08-27T15:30:00.000Z", // 12:30
      "2026-08-27T16:00:00.000Z", // 13:00
      "2026-08-27T16:30:00.000Z", // 13:30
      "2026-08-27T17:00:00.000Z", // 14:00
      "2026-08-27T17:30:00.000Z", // 14:30
      "2026-08-27T18:00:00.000Z", // 15:00
      "2026-08-27T20:00:00.000Z", // 17:00 (15:30/16:00/16:30 colidem com a visita das 16h)
    ])
  })

  it("AC2 — manhã sem compromisso nenhum passa a ser 8h, 9h30 e 11h (o HEAD dava 8h, 8h30 e 9h)", async () => {
    const { slots } = await freeSlotsInPeriod(fakeSupabase([]), "org1", DIA_ANA, "manha", AGORA_DA_MENTIRA)
    expect(slots.map((s) => s.toISOString())).toEqual([
      "2026-08-27T11:00:00.000Z", // 8:00 BRT
      "2026-08-27T12:30:00.000Z", // 9:30 BRT
      "2026-08-27T14:00:00.000Z", // 11:00 BRT
    ])
  })

  it("AC2 — os candidatos da manhã são 7, não 8: o último início é 11:00 (a visita de 60min tem de caber até 12h)", async () => {
    const { slots: todos } = await freeSlotsInPeriod(fakeSupabase([]), "org1", DIA_ANA, "manha", AGORA_DA_MENTIRA, undefined, 20)
    expect(todos).toHaveLength(7)
    expect(todos[todos.length - 1]!.toISOString()).toBe("2026-08-27T14:00:00.000Z") // 11:00 BRT
  })

  it("AC4 — as 11 consultas da tarde são todas emitidas antes de a primeira resolver (profundidade sequencial = 1)", async () => {
    // `isSlotFree` é UMA query ao `appointments` por candidato. Varrer o período
    // inteiro sobe de 3 para 11 consultas; o que a AC4 proíbe é que elas sejam
    // 11 round-trips EM SÉRIE no caminho da resposta ao lead.
    const log: string[] = []
    const sb = fakeSupabase([ocupado16h], {
      onEmit: () => log.push("emit"),
      onResolve: () => log.push("resolve"),
    })
    await freeSlotsInPeriod(sb, "org1", DIA_ANA, "tarde", AGORA_DA_MENTIRA)

    const emitidas = log.filter((e) => e === "emit").length
    expect(emitidas).toBe(11) // o período inteiro (12:00…17:00), não os 3 primeiros
    expect(log.slice(0, emitidas).every((e) => e === "emit")).toBe(true)
    expect(log.indexOf("resolve")).toBe(emitidas) // nenhuma resolveu antes de todas serem emitidas
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
  it("🔥 número que é IMPEDIMENTO não é pedido de horário (achado no gate de QA)", () => {
    // "as 15" aqui é o compromisso que ele TEM, não o horário que ele quer.
    expect(parseTimeParts("não vou poder, tenho compromisso as 15", BARE)).toBeNull()
    expect(parseTimeParts("só consigo depois das 17", BARE)).toBeNull()
    expect(parseTimeParts("antes das 10 não dá", BARE)).toBeNull()
    expect(parseTimeParts("tenho reunião as 14", BARE)).toBeNull()
    expect(parseTimeParts("trabalho até 18", BARE)).toBeNull()
    expect(parseTimeParts("não consigo 9", BARE)).toBeNull()
  })
  it("com marcador, o caminho antigo segue intacto — inclusive no seu limite conhecido", () => {
    // ⚠️ Documenta comportamento PRÉ-EXISTENTE, não comportamento desejado: com
    // dois horários marcados a função devolve o PRIMEIRO, mesmo quando o segundo
    // é o pedido de verdade. Não mexido aqui (fora do escopo da 75-268); quem
    // protege o cliente nesse caso é o bloco [SISTEMA] + a regra da 75-245.
    expect(parseTimeParts("não vou poder as 10h, pode ser 14h?", BARE)).toEqual({ hour: 10, minute: 0 })
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
      agendaState: estado({ fonte: "pendencia", dataAbsoluta: dayPartsToIso(t1.day!) }, NOW_268),
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
      agendaState: estado({ fonte: "pendencia", dataAbsoluta: dayPartsToIso(t1.day!) }, NOW_268),
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
  // Story 87-4 — o mesmo cenário, agora no formato único. E o ponto que a 75-268
  // deixou aberto: antes existiam DOIS caminhos de dia herdado e a guarda cobria
  // um só (`visit_availability`); o `pendingDay` entrava sem passar por ela. Por
  // isso a Valnira pediu "Semana de manhã" e ouviu três sábados mesmo depois do
  // fix. Com uma chave só, não há como aplicar a guarda pela metade.
  const SABADO = estado({ fonte: "mencao", dataAbsoluta: "2026-08-08", hora: 9, citacao: "Sábado, 8 de agosto, às 9h" }, NOW_268)
  it("'Semana de manhã' com estado de sábado → NÃO assume sábado", () => {
    const r = resolveVisitSlotParts({
      message: "Semana de manhã",
      now: NOW_268,
      agendaState: SABADO,
      timeOptions: BARE,
    })
    expect(parsePeriodParts("Semana de manhã")).toBe("manha")
    expect(r.day).toBeNull() // sem dia → o fluxo PERGUNTA o dia
  })
  it("87-4 — mas a PENDÊNCIA passa: bloqueá-la apagaria o pedido de quem respondeu", () => {
    // Revisado depois do gate do @qa. A v1 desta story bloqueava o dia herdado
    // também quando ele era pendência, e isso estava ERRADO nos dois sentidos:
    //
    //  • não protegia a Valnira — conferido na conversa real (03/08 23:57), o
    //    sábado dela veio da fala da PRÓPRIA Nicole ("…durante a semana ou
    //    sábado de manhã?") e ela NÃO tinha pendência nenhuma: aquele era o
    //    primeiro turno em que se perguntou o dia. Menção, não pendência;
    //  • e apagava em silêncio o fluxo legítimo "nós perguntamos o dia → ele
    //    respondeu 'quinta' → ele diz 'de manhã'" (4 ocorrências históricas).
    const diaQuePerguntamos = estado({ fonte: "pendencia", dataAbsoluta: "2026-08-08" }, NOW_268)
    const r = resolveVisitSlotParts({
      message: "Semana de manhã",
      now: NOW_268,
      agendaState: diaQuePerguntamos,
      timeOptions: BARE,
    })
    expect(r.day).toEqual({ y: 2026, m: 7, d: 8 })
  })

  it("🔴 87-4 — e a MENÇÃO continua barrada mesmo sem hora (o caso real da Valnira)", () => {
    const soMencaoDeDia = estado({ fonte: "mencao", dataAbsoluta: "2026-08-08" }, NOW_268)
    const r = resolveVisitSlotParts({
      message: "Semana de manhã",
      now: NOW_268,
      agendaState: soMencaoDeDia,
      timeOptions: BARE,
    })
    expect(r.day).toBeNull()
  })

  it("🔴 87-4 — `ignorarMencao` descarta a menção inteira (o `visitAvailability: null` do HEAD)", () => {
    // É a guarda do B1: com visita já marcada, uma menção não pode virar slot.
    const mencao = estado({ fonte: "mencao", dataAbsoluta: "2026-08-08", hora: 9 }, NOW_268)
    const semGuarda = resolveVisitSlotParts({ message: "Oi", now: NOW_268, agendaState: mencao })
    expect(semGuarda.day).not.toBeNull()
    expect(semGuarda.time).not.toBeNull()

    const comGuarda = resolveVisitSlotParts({ message: "Oi", now: NOW_268, agendaState: mencao, ignorarMencao: true })
    expect(comGuarda.day).toBeNull()
    expect(comGuarda.time).toBeNull()

    // E a PENDÊNCIA atravessa a mesma guarda — ela é o pedido do lead.
    const pend = estado({ fonte: "pendencia", dataAbsoluta: "2026-08-08", hora: 9 }, NOW_268)
    const pendComGuarda = resolveVisitSlotParts({ message: "Oi", now: NOW_268, agendaState: pend, ignorarMencao: true })
    expect(pendComGuarda.day).toEqual({ y: 2026, m: 7, d: 8 })
  })
  it("mas quando o lead dá o dia, o estado continua completando a hora", () => {
    const r = resolveVisitSlotParts({ message: "pode ser sábado", now: NOW_268, agendaState: SABADO })
    expect(r.day).toEqual({ y: 2026, m: 7, d: 8 })
    expect(r.time).toEqual({ hour: 9, minute: 0 })
  })
  it("e sem período na mensagem o fallback de dia segue valendo (75-162 preservada)", () => {
    const r = resolveVisitSlotParts({ message: "confirmado", now: NOW_268, agendaState: SABADO })
    expect(r.day).toEqual({ y: 2026, m: 7, d: 8 })
    expect(r.time).toEqual({ hour: 9, minute: 0 })
  })
})

// ---------------------------------------------------------------------------
// Story 75-279 — a grafia colada ("11hrs") não virava hora e a visita da lead
// Maria Oliveira (06/08) nunca foi gravada. Ver a story para o incidente.
// ---------------------------------------------------------------------------
describe("Story 75-279 — sufixo de hora colado ao número", () => {
  const BARE_ON = { bareNumberAllowed: true }

  it("AC1 — hrs/hs/hr colados viram hora", () => {
    expect(parseTimeParts("As 11hrs", BARE_ON)).toEqual({ hour: 11, minute: 0 })
    expect(parseTimeParts("11hs", BARE_ON)).toEqual({ hour: 11, minute: 0 })
    expect(parseTimeParts("as 9hs", BARE_ON)).toEqual({ hour: 9, minute: 0 })
    expect(parseTimeParts("as 11hr", BARE_ON)).toEqual({ hour: 11, minute: 0 })
    expect(parseTimeParts("as 11hrs por favor", BARE_ON)).toEqual({ hour: 11, minute: 0 })
  })

  it("AC1 — e valem SEM o número pelado liberado (fala da Nicole, remarcação)", () => {
    // Antes, "11hrs" só era lido quando bareNumberAllowed estava ligado — e por
    // acidente, via parseBareHour. Com marcador reconhecido, vale sempre.
    expect(parseTimeParts("As 11hrs")).toEqual({ hour: 11, minute: 0 })
    expect(parseTimeParts("as 11 hrs")).toEqual({ hour: 11, minute: 0 })
  })

  it("AC2 — nada do que já funcionava regride", () => {
    expect(parseTimeParts("as 11h", BARE_ON)).toEqual({ hour: 11, minute: 0 })
    expect(parseTimeParts("as 11", BARE_ON)).toEqual({ hour: 11, minute: 0 })
    expect(parseTimeParts("11 horas", BARE_ON)).toEqual({ hour: 11, minute: 0 })
    expect(parseTimeParts("11h30", BARE_ON)).toEqual({ hour: 11, minute: 30 })
    expect(parseTimeParts("11:00", BARE_ON)).toEqual({ hour: 11, minute: 0 })
    expect(parseTimeParts("meio-dia", BARE_ON)).toEqual({ hour: 12, minute: 0 })
    expect(parseTimeParts("3 da tarde", BARE_ON)).toEqual({ hour: 15, minute: 0 })
  })

  it("AC3 — palavra que só COMEÇA com h não vira marcador de hora", () => {
    // O risco de afrouxar o marcador: "11 hoje" virar 11:00.
    expect(parseTimeParts("11 hoje")).toBeNull()
    expect(parseTimeParts("as 11 hectares")).toBeNull()
  })

  it("AC3 — as guardas anti-fantasma da 75-268 seguem de pé", () => {
    expect(parseTimeParts("nao vou poder, tenho compromisso as 15", BARE_ON)).toBeNull()
    expect(parseTimeParts("so consigo depois das 17", BARE_ON)).toBeNull()
    expect(parseTimeParts("andar 11", BARE_ON)).toBeNull()
    expect(parseTimeParts("11 anos", BARE_ON)).toBeNull()
    expect(parseTimeParts("67m²", BARE_ON)).toBeNull()
  })

  it("AC3 — texto ambíguo com a grafia nova continua NÃO agendando nada", () => {
    // Se o marcador passa a ser entendido, o detector de ambiguidade precisa
    // enxergar os mesmos horários — senão "8hrs ou 9hrs" viraria slot único e
    // reabriria o agendamento fantasma da 75-245.
    expect(isAmbiguousSlotText("Posso 8hrs ou 9hrs")).toBe(true)
    expect(isAmbiguousSlotText("Atendemos das 8hrs as 18hrs")).toBe(true)
  })

  it("AC7 — o caso real da Maria: dia num turno, 'As 11hrs' no seguinte", () => {
    const r = resolveVisitSlotParts({
      message: "As 11hrs",
      now: new Date("2026-08-06T13:00:00Z"),
      agendaState: estado({ fonte: "pendencia", dataAbsoluta: "2026-08-08" }, new Date("2026-08-06T13:00:00Z")),
      timeOptions: BARE_ON,
    })
    expect(r.day).toEqual({ y: 2026, m: 7, d: 8 })
    expect(r.time).toEqual({ hour: 11, minute: 0 })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Story 87-18 — erro de consulta para de virar "horário livre" em silêncio.
//
// O defeito: `const { data } = await q.limit(1).maybeSingle()` descartava o
// `error`. O PostgREST não REJEITA em erro de consulta — devolve
// `{ data: null, error }` — então `!data` dava `true`, "livre", e a Nicole
// ofertava E GRAVAVA (`pipeline.ts:1563`) um horário possivelmente ocupado, sem
// log, sem evento, sem rastro.
//
// Todos os testes abaixo usam a injeção de erro do `fakeSupabase` (`T0`), que
// devolve a forma EXATA do PostgREST. Nenhum deles simula rejeição de rede — isso
// é o caminho A (`REL-1`), e a `AC7` é o controle de que ele segue intacto.
// ═══════════════════════════════════════════════════════════════════════════

describe("Story 87-18 AC1 — isSlotFree distingue os três estados", () => {
  // Segunda-feira 2026-07-20 14:00 BRT = 17:00Z (dentro do expediente).
  const SLOT = new Date("2026-07-20T17:00:00Z")
  const ocupando: FakeApptRow = {
    id: "appt-house-14h",
    org_id: "org1",
    team: "house",
    status: "scheduled",
    scheduled_at: "2026-07-20T17:00:00.000Z",
  }

  it('🔴 erro de consulta devolve "unknown" — o `HEAD` devolvia `true` ("livre")', async () => {
    // MESMA fixture que no `HEAD` produzia "livre": zero linha + `error`. A
    // mutação (a) do `T6` (voltar para `!data`) deixa este teste vermelho.
    const sb = fakeSupabase([], undefined, () => true)
    expect(await isSlotFree(sb, "org1", SLOT)).toBe("unknown")
  })

  it('controle — sem erro e sem linha sobrepondo é "free"', async () => {
    expect(await isSlotFree(fakeSupabase([]), "org1", SLOT)).toBe("free")
  })

  it('controle — sem erro e com linha sobrepondo é "occupied"', async () => {
    expect(await isSlotFree(fakeSupabase([ocupando]), "org1", SLOT)).toBe("occupied")
  })

  it('🔴 "occupied" NUNCA pode ser lido por truthiness (as três strings são truthy)', async () => {
    // Guarda explícita da Armadilha do §6: `if (await isSlotFree(...))` compila
    // limpo com `tsc --strict` e faria TODO horário ocupado passar por livre.
    const status = await isSlotFree(fakeSupabase([ocupando]), "org1", SLOT)
    expect(status).not.toBe("free")
    expect(Boolean(status)).toBe(true) // ← é ISTO que o `tsc` deixa passar
  })
})

describe("Story 87-18 AC2/AC3/AC6 — checkSlotAvailability sob incerteza", () => {
  const SLOT = new Date("2026-07-20T17:00:00Z") // seg 14:00 BRT
  const ocupado14h: FakeApptRow = {
    id: "appt-house-14h",
    org_id: "org1",
    team: "house",
    status: "scheduled",
    scheduled_at: "2026-07-20T17:00:00.000Z",
  }
  /** Índices das consultas: 0 = primário (14:00), 1 = 14:30, 2 = 15:00, 3 = 15:30, … */
  const IDX_15H = 2
  const IDX_15H30 = 3

  it("AC2-i — primário com erro devolve erroNoPedido, sem afirmar livre nem ocupado", async () => {
    const sb = fakeSupabase([], undefined, ({ index }) => index === 0)
    const { free, alternatives, erroNoPedido } = await checkSlotAvailability(sb, "org1", SLOT)
    expect(erroNoPedido).toBe(true)
    // `free === false` aqui é ausência de informação, não "ocupado" — quem
    // consome precisa de `erroNoPedido` para saber a diferença.
    expect(free).toBe(false)
    expect(alternatives).toEqual([])
  })

  it("🔴 AC2-ii — CURTO-CIRCUITO: exatamente 1 consulta, não ~37, quando o banco inteiro falha", async () => {
    // O cenário de outage é justamente o que faz o primário falhar. Sem o
    // curto-circuito o laço de alternativas nunca alcança `length >= 3` e varre o
    // resto do dia pedido MAIS o dia seguinte INTEIRO, em `for … await`
    // (SEQUENCIAL), contra um banco que acabou de falhar — no caminho da resposta
    // ao lead. É teto de latência (`R8`), não estilo.
    const c = contadorDeConsultas()
    const sb = fakeSupabase([], c.hooks, () => true)
    const { alternatives, erroNoPedido } = await checkSlotAvailability(sb, "org1", SLOT)
    // A CONTAGEM primeiro, de propósito: é ela a asserção que esta AC existe para
    // fazer, e é ela que precisa ser a linha vermelha se o curto-circuito sair.
    expect(c.total()).toBe(1)
    expect(alternatives).toEqual([])
    expect(erroNoPedido).toBe(true)
  })

  it("AC3 — candidato de alternativa com erro é OMITIDO e a busca continua nos seguintes", async () => {
    // Primário `"occupied"` DE VERDADE (linha presente, sem erro) — a incerteza é
    // só numa alternativa do meio. Controle negativo embutido: se a
    // implementação abortasse a busca no primeiro `"unknown"`, `alternatives`
    // viria com 0 ou 1 item em vez dos 3 de depois dele.
    const sb = fakeSupabase([ocupado14h], undefined, ({ index }) => index === IDX_15H)
    const { free, alternatives, erroNoPedido } = await checkSlotAvailability(sb, "org1", SLOT)
    expect(free).toBe(false)
    expect(erroNoPedido).toBe(false) // o PEDIDO foi verificado: está ocupado
    expect(alternatives.map((a) => a.toISOString())).toEqual([
      "2026-07-20T18:30:00.000Z", // 15:30 BRT
      "2026-07-20T19:00:00.000Z", // 16:00 BRT
      "2026-07-20T19:30:00.000Z", // 16:30 BRT
    ])
    // O candidato incerto (15:00 BRT) não aparece como livre — nem como ocupado.
    expect(alternatives.map((a) => a.toISOString())).not.toContain("2026-07-20T18:00:00.000Z")
  })

  it("AC6-ii — pedido OCUPADO + 2 alternativas incertas → UM evento agregado, erroNoPedido false", async () => {
    const eventos: Array<{ event_type: string; category: string; metadata?: Record<string, unknown> }> = []
    const sb = fakeSupabase([ocupado14h], undefined, ({ index }) => index === IDX_15H || index === IDX_15H30)
    const { free, alternatives, erroNoPedido } = await checkSlotAvailability(sb, "org1", SLOT, undefined, (e) =>
      eventos.push({ event_type: e.event_type, category: e.category, metadata: e.metadata })
    )
    expect(eventos).toHaveLength(1)
    expect(eventos[0]!.event_type).toBe("NICOLE_SLOT_QUERY_ERROR")
    expect(eventos[0]!.category).toBe("ai")
    expect(eventos[0]!.metadata?.candidatos_com_erro).toBe(2)
    expect(eventos[0]!.metadata?.primario_com_erro).toBe(false)
    // Incerteza nas ALTERNATIVAS não contamina a afirmação sobre o PEDIDO.
    expect(erroNoPedido).toBe(false)
    expect(free).toBe(false)
    expect(alternatives.map((a) => a.toISOString())).toEqual([
      "2026-07-20T19:00:00.000Z", // 16:00 BRT
      "2026-07-20T19:30:00.000Z", // 16:30 BRT
      "2026-07-20T20:00:00.000Z", // 17:00 BRT
    ])
  })

  it("AC6-iii — primário incerto → UM evento, candidatos_com_erro 1, primario_com_erro true", async () => {
    const eventos: Array<{ event_type: string; metadata?: Record<string, unknown> }> = []
    const sb = fakeSupabase([], undefined, () => true)
    await checkSlotAvailability(sb, "org1", SLOT, undefined, (e) =>
      eventos.push({ event_type: e.event_type, metadata: e.metadata })
    )
    expect(eventos).toHaveLength(1)
    expect(eventos[0]!.event_type).toBe("NICOLE_SLOT_QUERY_ERROR")
    expect(eventos[0]!.metadata?.candidatos_com_erro).toBe(1)
    expect(eventos[0]!.metadata?.primario_com_erro).toBe(true)
  })

  it("AC6 controle negativo — sem incerteza nenhuma, NENHUM evento", async () => {
    const eventos: unknown[] = []
    // Livre: um único caminho, sem alternativa.
    await checkSlotAvailability(fakeSupabase([]), "org1", SLOT, undefined, (e) => eventos.push(e))
    // Ocupado de verdade: varre alternativas, todas resolvem free/occupied.
    await checkSlotAvailability(fakeSupabase([ocupado14h]), "org1", SLOT, undefined, (e) => eventos.push(e))
    expect(eventos).toEqual([])
  })
})

describe("Story 87-18 AC4/AC5/AC6 — freeSlotsInPeriod sob incerteza", () => {
  // Mesma fixture da Ana da `87-17` (`AC1`): 11 candidatos na tarde de 27/08,
  // 8 livres (15:30/16:00/16:30 BRT colidem com a visita das 16h).
  const DIA_ANA = isoToDayParts("2026-08-27")!
  const AGORA = new Date("2026-08-26T22:22:33.815Z")
  const ocupado16h: FakeApptRow = {
    id: "63957a67-35ac-4a33-8796-f7152facbdc6",
    org_id: "org1",
    team: "house",
    status: "scheduled",
    scheduled_at: "2026-08-27T19:00:00.000Z", // 16:00 BRT
  }
  /** 14:00 BRT — um dos 8 livres, nem o primeiro nem o último (`AC4`). */
  const CANDIDATO_14H = "2026-08-27T17:00:00.000Z"

  it("AC4 — 1 dos 8 candidatos incerto: os 7 restantes viram oferta, houveIncerteza true", async () => {
    const sb = fakeSupabase([ocupado16h], undefined, ({ slotUtc }) => slotUtc.toISOString() === CANDIDATO_14H)
    const { slots, houveIncerteza } = await freeSlotsInPeriod(sb, "org1", DIA_ANA, "tarde", AGORA)
    expect(houveIncerteza).toBe(true)
    // Nunca `[]` só porque UM candidato entre vários falhou.
    expect(slots.map((s) => s.toISOString())).toEqual([
      "2026-08-27T15:00:00.000Z", // 12:00 BRT
      "2026-08-27T16:30:00.000Z", // 13:30 BRT
      "2026-08-27T20:00:00.000Z", // 17:00 BRT
    ])
    expect(slots.map((s) => s.toISOString())).not.toContain(CANDIDATO_14H)
  })

  it("AC4 — e a lista COMPLETA dos confirmados livres são 7, não 8: o incerto saiu, os outros ficaram", async () => {
    const sb = fakeSupabase([ocupado16h], undefined, ({ slotUtc }) => slotUtc.toISOString() === CANDIDATO_14H)
    const { slots, houveIncerteza } = await freeSlotsInPeriod(sb, "org1", DIA_ANA, "tarde", AGORA, undefined, 11)
    expect(houveIncerteza).toBe(true)
    expect(slots.map((s) => s.toISOString())).toEqual([
      "2026-08-27T15:00:00.000Z", // 12:00
      "2026-08-27T15:30:00.000Z", // 12:30
      "2026-08-27T16:00:00.000Z", // 13:00
      "2026-08-27T16:30:00.000Z", // 13:30
      "2026-08-27T17:30:00.000Z", // 14:30 (o 14:00 saiu: incerto)
      "2026-08-27T18:00:00.000Z", // 15:00
      "2026-08-27T20:00:00.000Z", // 17:00
    ])
  })

  it("🔴 AC5 — TODOS os candidatos incertos: slots vazio COM houveIncerteza true", async () => {
    // É este par que faz `slots.length === 0` deixar de ter um significado único:
    // "não há horário livre" e "não consegui checar nada" param de colapsar.
    const sb = fakeSupabase([], undefined, () => true)
    const { slots, houveIncerteza } = await freeSlotsInPeriod(sb, "org1", DIA_ANA, "tarde", AGORA)
    expect(slots).toEqual([])
    expect(houveIncerteza).toBe(true)
  })

  it("AC5 controle — lista vazia por REGRA de expediente não é incerteza", async () => {
    // Tarde de sábado: o expediente fecha ao meio-dia. Nenhuma consulta foi feita,
    // logo "não há horário livre" é uma afirmação legítima.
    const SABADO = isoToDayParts("2026-08-01")!
    const c = contadorDeConsultas()
    const { slots, houveIncerteza } = await freeSlotsInPeriod(
      fakeSupabase([], c.hooks),
      "org1",
      SABADO,
      "tarde",
      new Date("2026-07-31T01:05:00Z")
    )
    expect(slots).toEqual([])
    expect(houveIncerteza).toBe(false)
    expect(c.total()).toBe(0)
  })

  it("AC6 — 3 dos 11 candidatos incertos → UMA emissão, com a contagem agregada", async () => {
    // Teto de UM evento por CHAMADA: 11 linhas quase idênticas em `system_events`
    // por um turno de conversa é ruído, não observabilidade (`R2`).
    const eventos: Array<{ event_type: string; category: string; level: string; metadata?: Record<string, unknown> }> = []
    const sb = fakeSupabase([ocupado16h], undefined, ({ index }) => index < 3)
    const { houveIncerteza } = await freeSlotsInPeriod(sb, "org1", DIA_ANA, "tarde", AGORA, undefined, undefined, (e) =>
      eventos.push({ event_type: e.event_type, category: e.category, level: e.level, metadata: e.metadata })
    )
    expect(houveIncerteza).toBe(true)
    expect(eventos).toHaveLength(1)
    expect(eventos[0]!.event_type).toBe("NICOLE_SLOT_QUERY_ERROR")
    expect(eventos[0]!.category).toBe("ai")
    expect(eventos[0]!.level).toBe("error")
    expect(eventos[0]!.metadata?.candidatos_com_erro).toBe(3)
    expect(eventos[0]!.metadata?.candidatos_totais).toBe(11)
    expect(eventos[0]!.metadata?.dia).toBe("2026-08-27")
    expect(eventos[0]!.metadata?.periodo).toBe("tarde")
  })

  it("AC6 controle negativo — período inteiro resolvido, NENHUM evento", async () => {
    const eventos: unknown[] = []
    const { houveIncerteza } = await freeSlotsInPeriod(
      fakeSupabase([ocupado16h]),
      "org1",
      DIA_ANA,
      "tarde",
      AGORA,
      undefined,
      undefined,
      (e) => eventos.push(e)
    )
    expect(houveIncerteza).toBe(false)
    expect(eventos).toEqual([])
  })
})

describe("Story 87-18 AC7 — fronteira com o REL-1: rejeição de rede continua subindo", () => {
  /**
   * Caminho A do §2: o `fetch` LANÇA (rede caiu, DNS falhou). Isso NÃO é o que
   * esta story trata — o remédio dele é decisão do `REL-1` (`docs/backlog.md`),
   * e mapear rejeição para "ocupado" reintroduziria, pela porta do caminho A, a
   * mentira que esta story fecha no caminho B.
   *
   * Estes dois testes reprovam qualquer `try/catch` novo em volta de
   * `isSlotFree`: se a story engolisse a rejeição, `.rejects` não aconteceria.
   */
  function fakeQueRejeita(): SupabaseClient {
    const q: Record<string, unknown> = {}
    for (const m of ["select", "eq", "neq", "in", "gt", "lt", "limit"]) q[m] = () => q
    q.maybeSingle = () => Promise.reject(new Error("fetch failed"))
    return { from: () => q } as unknown as SupabaseClient
  }

  it("freeSlotsInPeriod NÃO engole a rejeição (ela sobe pelo Promise.all, como no HEAD)", async () => {
    await expect(
      freeSlotsInPeriod(fakeQueRejeita(), "org1", isoToDayParts("2026-08-27")!, "tarde", new Date("2026-08-26T22:22:33.815Z"))
    ).rejects.toThrow("fetch failed")
  })

  it("checkSlotAvailability NÃO engole a rejeição (ela sobe direto, como no HEAD)", async () => {
    await expect(
      checkSlotAvailability(fakeQueRejeita(), "org1", new Date("2026-07-20T17:00:00Z"))
    ).rejects.toThrow("fetch failed")
  })
})
