/**
 * Story 73-1 — parsing do dia/horário pedido pelo cliente (PT-BR) e checagem de
 * disponibilidade na agenda interna (tabela `appointments`, que já recebe Calendly
 * via cron `calendly-sync`). Visita = 60 min, slots de hora em hora.
 *
 * Brasil não tem horário de verão desde 2019 → BRT é fixo em UTC-3.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

const BRT_OFFSET_HOURS = 3
export const VISIT_DURATION_MIN = 60
const OPEN_HOUR = 8

/** Hora de fechamento (BRT) por dia da semana, ou null se fechado (domingo). */
function closeHourFor(weekday: number): number | null {
  if (weekday === 0) return null // domingo
  if (weekday === 6) return 12 // sábado
  return 18 // seg–sex
}

export interface ParsedSlot {
  /** O cliente referenciou um dia (segunda, amanhã, "dia 20"…). */
  hasDay: boolean
  /** O cliente deu um horário explícito (15h, 15:30, "3 da tarde"…). */
  hasTime: boolean
  /** Início pedido em UTC — só quando dia+hora explícitos, no futuro e dentro do horário comercial. */
  startUtc: Date | null
  /** Dia+hora dados, mas fora do horário comercial (ou domingo). */
  outsideHours: boolean
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

function brtToUtc(y: number, m: number, d: number, hour: number, minute = 0): Date {
  return new Date(Date.UTC(y, m, d, hour + BRT_OFFSET_HOURS, minute, 0, 0))
}

function brtParts(now: Date) {
  const brt = new Date(now.getTime() - BRT_OFFSET_HOURS * 3600_000)
  return {
    y: brt.getUTCFullYear(),
    m: brt.getUTCMonth(),
    d: brt.getUTCDate(),
    weekday: brt.getUTCDay(),
  }
}

const WEEKDAYS: Array<{ re: RegExp; dow: number }> = [
  { re: /\bdomingo\b/, dow: 0 },
  { re: /\bsegunda\b/, dow: 1 },
  { re: /\bterca\b/, dow: 2 },
  { re: /\bquarta\b/, dow: 3 },
  { re: /\bquinta\b/, dow: 4 },
  { re: /\bsexta\b/, dow: 5 },
  { re: /\bsabado\b/, dow: 6 },
]

/** Resolve o dia pedido (em componentes BRT) a partir do texto. */
function parseDay(text: string, now: Date): { y: number; m: number; d: number } | null {
  // Story 75-162 — minúsculo: o visit_availability costuma vir capitalizado
  // ("Sábado, 18 de julho…") e os padrões (weekday/dia/amanhã) são case-sensitive.
  const t = stripAccents(text).toLowerCase()
  const today = brtParts(now)

  const addDays = (n: number) => {
    const base = brtToUtc(today.y, today.m, today.d, 12) // meio-dia BRT evita virada
    const target = new Date(base.getTime() + n * 86400_000)
    const p = brtParts(target)
    return { y: p.y, m: p.m, d: p.d }
  }

  if (/\bdepois\s+de\s+amanha\b/.test(t)) return addDays(2)
  if (/\bamanha\b/.test(t)) return addDays(1)
  if (/\bhoje\b/.test(t)) return { y: today.y, m: today.m, d: today.d }

  // "dia 20"
  const diaMatch = t.match(/\bdia\s+(\d{1,2})\b/)
  if (diaMatch) {
    const dd = parseInt(diaMatch[1]!, 10)
    if (dd >= 1 && dd <= 31) {
      let m = today.m
      let y = today.y
      if (dd < today.d) {
        m += 1
        if (m > 11) { m = 0; y += 1 }
      }
      return { y, m, d: dd }
    }
  }

  // dia da semana → próxima ocorrência (inclui hoje)
  for (const { re, dow } of WEEKDAYS) {
    if (re.test(t)) {
      const delta = (dow - today.weekday + 7) % 7
      return addDays(delta)
    }
  }

  return null
}

/** Resolve a hora pedida (BRT, 0-23) a partir do texto, ou null. */
function parseHour(text: string): { hour: number; minute: number } | null {
  const t = stripAccents(text).toLowerCase() // Story 75-162 — robusto a "9H"/capitalização

  if (/\bmeio[\s-]?dia\b/.test(t)) return { hour: 12, minute: 0 }

  // período (tarde/noite) com número: "3 da tarde", "8 da noite"
  const periodMatch = t.match(/\b(\d{1,2})(?:[:h](\d{2}))?\s*(?:da|de|à|a)\s*(tarde|noite|manha)\b/)
  if (periodMatch) {
    let hour = parseInt(periodMatch[1]!, 10)
    const minute = periodMatch[2] ? parseInt(periodMatch[2]!, 10) : 0
    const period = periodMatch[3]!
    if ((period === "tarde" || period === "noite") && hour < 12) hour += 12
    if (hour >= 0 && hour <= 23) return { hour, minute }
  }

  // "15h", "15:30", "15 horas", "15h30"
  const hMatch = t.match(/\b(\d{1,2})\s*(?:[:h]|\s*horas?)\s*(\d{2})?\b/)
  if (hMatch) {
    const hour = parseInt(hMatch[1]!, 10)
    const minute = hMatch[2] ? parseInt(hMatch[2]!, 10) : 0
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute < 60) return { hour, minute }
  }

  return null
}

export type DayParts = { y: number; m: number; d: number } // m = 0-based

/** Extrai só o dia referenciado (ou null). Exposto para combinar dia+hora entre turnos. */
export function parseDayParts(message: string, now: Date): DayParts | null {
  return parseDay(message, now)
}

/** Extrai só o horário referenciado (ou null). Exposto para combinar dia+hora entre turnos. */
export function parseTimeParts(message: string): { hour: number; minute: number } | null {
  return parseHour(message)
}

export type TimeParts = { hour: number; minute: number }

// Story 75-163 — intenção de CANCELAR a visita (sem nova data).
const CANCEL_RE = /\bcancelar?\b|\bcancela\b|\bdesmarcar?\b|\bdesmarca\b|\bnao vou (?:poder|conseguir)? ?(?:mais )?ir\b|\bnao (?:posso|vou) mais\b|\bdesist[oiê]|\bnao quero mais (?:a )?visita\b/
// Story 75-163 — intenção de REMARCAR (trocar dia/horário).
const RESCHEDULE_RE = /\bremarca\w*\b|\breagenda\w*\b|\bmuda\w*\b|\btroca\w*\b|\badia\w*\b|\bantecipa\w*\b|\boutro dia\b|\boutro hor[aá]rio\b|\boutra hora\b|\bpassar para\b|\btransferir\b|\bmudar o (?:dia|hor[aá]rio)\b/

/** Story 75-163 — intenção clara de CANCELAR a visita (texto normalizado). */
export function detectCancelIntent(text: string | null | undefined): boolean {
  if (!text) return false
  return CANCEL_RE.test(stripAccents(text).toLowerCase())
}

/** Story 75-163 — intenção de REMARCAR (trocar dia/horário) a visita. */
export function detectRescheduleIntent(text: string | null | undefined): boolean {
  if (!text) return false
  return RESCHEDULE_RE.test(stripAccents(text).toLowerCase())
}

/**
 * Story 75-162 — resolve dia+hora do slot combinando as fontes, na ordem:
 * 1) mensagem atual do lead, 2) pendências de turnos anteriores, 3) `visit_availability`
 * (slot que a Nicole já capturou, ex.: "Sábado, 18 de julho, às 9h"). Torna o
 * agendamento robusto quando dia e hora vieram em turnos diferentes ou só constam
 * no visit_availability — em vez de depender do frágil flag `visit_proposed`. Puro.
 */
export function resolveVisitSlotParts(input: {
  message: string
  now: Date
  pendingDay?: DayParts | null
  pendingTime?: TimeParts | null
  visitAvailability?: string | null
}): { day: DayParts | null; time: TimeParts | null } {
  const { message, now, pendingDay = null, pendingTime = null, visitAvailability } = input
  let day = parseDayParts(message, now) ?? pendingDay
  let time = parseTimeParts(message) ?? pendingTime
  if ((!day || !time) && visitAvailability) {
    if (!day) day = parseDayParts(visitAvailability, now)
    if (!time) time = parseTimeParts(visitAvailability)
  }
  return { day, time }
}

/** Story 75-163 — DayParts (BRT) de uma data UTC (ex.: dia da visita atual, p/ troca só-de-horário). */
export function dayPartsFromUtc(d: Date): DayParts {
  const p = brtParts(d)
  return { y: p.y, m: p.m, d: p.d }
}

/** "YYYY-MM-DD" (mês 1-based) para persistir o dia pendente em conversation_state. */
export function dayPartsToIso(d: DayParts): string {
  return `${d.y}-${String(d.m + 1).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`
}

/** Inverso de dayPartsToIso. */
export function isoToDayParts(s: string): DayParts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  return { y: parseInt(m[1]!, 10), m: parseInt(m[2]!, 10) - 1, d: parseInt(m[3]!, 10) }
}

/**
 * Dado dia + hora, devolve `startUtc` (se no futuro e dentro do horário comercial)
 * ou marca `outsideHours`. Núcleo compartilhado entre o parse de turno único e a
 * combinação dia+hora ao longo de turnos.
 */
export function evaluateSlot(
  day: DayParts,
  time: { hour: number; minute: number },
  now: Date
): { startUtc: Date | null; outsideHours: boolean } {
  const startUtc = brtToUtc(day.y, day.m, day.d, time.hour, time.minute)

  // Passado → trata como sem slot preciso (Nicole pede de novo)
  if (startUtc.getTime() <= now.getTime()) return { startUtc: null, outsideHours: false }

  const targetWeekday = new Date(startUtc.getTime() - BRT_OFFSET_HOURS * 3600_000).getUTCDay()
  const close = closeHourFor(targetWeekday)
  if (close === null || time.hour < OPEN_HOUR || time.hour >= close) {
    return { startUtc: null, outsideHours: true }
  }
  return { startUtc, outsideHours: false }
}

/**
 * Faz o parse do dia+horário pedidos pelo cliente. Conservador: só devolve
 * `startUtc` quando há dia E hora explícitos, no futuro e dentro do horário comercial.
 */
export function parseRequestedSlot(message: string, now: Date): ParsedSlot {
  const day = parseDay(message, now)
  const time = parseHour(message)

  const result: ParsedSlot = {
    hasDay: !!day,
    hasTime: !!time,
    startUtc: null,
    outsideHours: false,
  }

  if (!day || !time) return result

  const { startUtc, outsideHours } = evaluateSlot(day, time, now)
  result.startUtc = startUtc
  result.outsideHours = outsideHours
  return result
}

/**
 * Slot livre se não há appointment ativo sobrepondo [start, start+60min).
 * Story 75-163 — `excludeAppointmentId` ignora a PRÓPRIA visita do lead ao remarcar
 * (senão mover pra perto do mesmo horário conflitaria consigo mesma).
 */
async function isSlotFree(
  supabase: SupabaseClient,
  orgId: string,
  startUtc: Date,
  excludeAppointmentId?: string | null
): Promise<boolean> {
  const windowStart = new Date(startUtc.getTime() - (VISIT_DURATION_MIN - 1) * 60_000).toISOString()
  const windowEnd = new Date(startUtc.getTime() + (VISIT_DURATION_MIN - 1) * 60_000).toISOString()

  let q = supabase
    .from("appointments")
    .select("id")
    .eq("org_id", orgId)
    .in("status", ["scheduled", "confirmed"])
    .gt("scheduled_at", windowStart)
    .lt("scheduled_at", windowEnd)
  if (excludeAppointmentId) q = q.neq("id", excludeAppointmentId)

  const { data } = await q.limit(1).maybeSingle()

  return !data
}

/**
 * Checa disponibilidade do horário pedido. Se ocupado, devolve até 3 horários
 * livres (mesmo dia depois do pedido; se acabar, manhã do próximo dia útil).
 */
export async function checkSlotAvailability(
  supabase: SupabaseClient,
  orgId: string,
  startUtc: Date,
  excludeAppointmentId?: string | null
): Promise<{ free: boolean; alternatives: Date[] }> {
  if (await isSlotFree(supabase, orgId, startUtc, excludeAppointmentId)) {
    return { free: true, alternatives: [] }
  }

  const alternatives: Date[] = []
  const reqParts = brtParts(startUtc)
  const reqHour = new Date(startUtc.getTime() - BRT_OFFSET_HOURS * 3600_000).getUTCHours()

  // Candidatos: resto do dia pedido + próximo dia útil (manhã)
  const candidates: Date[] = []
  const closeToday = closeHourFor(reqParts.weekday)
  if (closeToday !== null) {
    for (let h = reqHour + 1; h < closeToday; h++) {
      candidates.push(brtToUtc(reqParts.y, reqParts.m, reqParts.d, h))
    }
  }
  // Próximo dia (pula domingo)
  let nextBase = new Date(brtToUtc(reqParts.y, reqParts.m, reqParts.d, 12).getTime() + 86400_000)
  let nextParts = brtParts(nextBase)
  if (nextParts.weekday === 0) {
    nextBase = new Date(nextBase.getTime() + 86400_000)
    nextParts = brtParts(nextBase)
  }
  const closeNext = closeHourFor(nextParts.weekday)
  if (closeNext !== null) {
    for (let h = OPEN_HOUR; h < closeNext; h++) {
      candidates.push(brtToUtc(nextParts.y, nextParts.m, nextParts.d, h))
    }
  }

  for (const c of candidates) {
    if (alternatives.length >= 3) break
    if (await isSlotFree(supabase, orgId, c, excludeAppointmentId)) alternatives.push(c)
  }

  return { free: false, alternatives }
}
