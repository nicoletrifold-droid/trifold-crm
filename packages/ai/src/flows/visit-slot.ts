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
  const t = stripAccents(text)
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
  const t = stripAccents(text)

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

  const startUtc = brtToUtc(day.y, day.m, day.d, time.hour, time.minute)

  // Passado → trata como sem slot preciso (Nicole pede de novo)
  if (startUtc.getTime() <= now.getTime()) return result

  // Horário comercial do dia-alvo
  const targetWeekday = new Date(startUtc.getTime() - BRT_OFFSET_HOURS * 3600_000).getUTCDay()
  const close = closeHourFor(targetWeekday)
  if (close === null || time.hour < OPEN_HOUR || time.hour >= close) {
    result.outsideHours = true
    return result
  }

  result.startUtc = startUtc
  return result
}

/** Slot livre se não há appointment ativo sobrepondo [start, start+60min). */
async function isSlotFree(
  supabase: SupabaseClient,
  orgId: string,
  startUtc: Date
): Promise<boolean> {
  const windowStart = new Date(startUtc.getTime() - (VISIT_DURATION_MIN - 1) * 60_000).toISOString()
  const windowEnd = new Date(startUtc.getTime() + (VISIT_DURATION_MIN - 1) * 60_000).toISOString()

  const { data } = await supabase
    .from("appointments")
    .select("id")
    .eq("org_id", orgId)
    .in("status", ["scheduled", "confirmed"])
    .gt("scheduled_at", windowStart)
    .lt("scheduled_at", windowEnd)
    .limit(1)
    .maybeSingle()

  return !data
}

/**
 * Checa disponibilidade do horário pedido. Se ocupado, devolve até 3 horários
 * livres (mesmo dia depois do pedido; se acabar, manhã do próximo dia útil).
 */
export async function checkSlotAvailability(
  supabase: SupabaseClient,
  orgId: string,
  startUtc: Date
): Promise<{ free: boolean; alternatives: Date[] }> {
  if (await isSlotFree(supabase, orgId, startUtc)) {
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
    if (await isSlotFree(supabase, orgId, c)) alternatives.push(c)
  }

  return { free: false, alternatives }
}
