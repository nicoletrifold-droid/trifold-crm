// Story 81-4/81-8 (Epic 81) — grade de horários LIVRES de UMA equipe, usada pelo
// link público de imobiliárias (/agendar/[token]) e pelo modal interno da agenda.
//
// Regras:
//  - Slots de 1h com início a cada 30min (8:00, 8:30, 9:00…) — a visita continua
//    durando 1h; só o passo do INÍCIO é de meia hora (pedido do Marcos 2026-07-23).
//    O compromisso inteiro precisa caber no expediente (início + 60min ≤ fechamento).
//  - Grade segue o horário comercial da org (roleta_schedule/WeekSchedule) no
//    fuso da org — dia fechado = sem slots.
//  - Um slot está OCUPADO se QUALQUER compromisso ATIVO **da mesma equipe**
//    sobrepõe o horário — o local/empreendimento NÃO importa (Story 81-9:
//    1 compromisso por horário por equipe; antes filtrava por local e a grade
//    oferecia horário já comprometido em outro decorado). O chamador passa SÓ
//    appointments da equipe em questão, com status ativo.
//  - Pura/testável; sem I/O.

import type { WeekSchedule } from "@web/lib/roleta/business-time"
import { overlaps } from "./governance"

/** Passo do INÍCIO dos slots (min). A duração da visita segue sendo 60min. */
export const SLOT_STEP_MIN = 30
const SLOT_DURATION_MIN = 60

export interface ImobBusySlot {
  scheduled_at: string // ISO
  duration_minutes: number | null
}

export interface SlotOption {
  /** Início do slot em ISO UTC. */
  startIso: string
  /** Hora local (org) do slot, ex.: "14:00". */
  labelLocal: string
  free: boolean
}

function parseHM(s: string): number {
  const [h, m] = s.split(":")
  return Number(h) * 60 + Number(m ?? 0)
}

/** Offset (ms) a somar ao UTC para obter a parede do fuso num instante. */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const utc = new Date(instant.toLocaleString("en-US", { timeZone: "UTC" })).getTime()
  const tz = new Date(instant.toLocaleString("en-US", { timeZone })).getTime()
  return tz - utc
}

/** Converte parede do fuso (y-m-d + minutos do dia) em epoch ms UTC. */
function wallToUtcMs(y: number, mo: number, d: number, minutes: number, timeZone: string): number {
  const guess = Date.UTC(y, mo - 1, d, Math.floor(minutes / 60), minutes % 60)
  return guess - tzOffsetMs(new Date(guess), timeZone)
}

/** Dia da semana (0=Dom) de uma data-calendário no fuso. */
function dowOf(y: number, mo: number, d: number, timeZone: string): number {
  const noon = new Date(Date.UTC(y, mo - 1, d, 12))
  const wk: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const name = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(noon)
  return wk[name] ?? 0
}

/**
 * Grade de slots (hora cheia) de UM dia-calendário (no fuso da org) de UMA equipe,
 * marcando livre/ocupado contra os compromissos ativos fornecidos (Story 81-9:
 * qualquer local da equipe ocupa o slot).
 * `now` remove slots já passados (slot cujo início <= now não é oferecido).
 */
export function imobSlotsForDay(params: {
  y: number
  mo: number // 1-12
  d: number
  week: WeekSchedule
  timezone: string
  busy: ImobBusySlot[]
  now: Date
}): SlotOption[] {
  const { y, mo, d, week, timezone, busy, now } = params
  const day = week[dowOf(y, mo, d, timezone)]
  if (!day?.isOpen) return []

  const openMin = parseHM(day.open)
  const closeMin = parseHM(day.close)
  const slots: SlotOption[] = []

  // Início a cada SLOT_STEP_MIN a partir da abertura; a visita de 60min precisa
  // caber inteira no expediente (início + duração ≤ fechamento) — com fechamento
  // em hora cheia o último slot é o mesmo de antes (ex.: 17:00 p/ fechar às 18:00,
  // agora também 17:00... com 17:30 só se fechar às 18:30+).
  const firstSlot = Math.ceil(openMin / SLOT_STEP_MIN) * SLOT_STEP_MIN
  for (let m = firstSlot; m + SLOT_DURATION_MIN <= closeMin; m += SLOT_STEP_MIN) {
    const startMs = wallToUtcMs(y, mo, d, m, timezone)
    const endMs = startMs + SLOT_DURATION_MIN * 60_000
    if (startMs <= now.getTime()) continue // passado não se oferece

    const taken = busy.some((b) => {
      const bStart = new Date(b.scheduled_at).getTime()
      const bEnd = bStart + (b.duration_minutes ?? 60) * 60_000
      return overlaps(startMs, endMs, bStart, bEnd)
    })

    slots.push({
      startIso: new Date(startMs).toISOString(),
      labelLocal: `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`,
      free: !taken,
    })
  }
  return slots
}

export interface DayOption {
  date: string // YYYY-MM-DD (no fuso da org)
  label: string // ex.: "seg., 20/07"
}

/**
 * Próximos 14 dias (no fuso da org), só os ABERTOS na agenda. Story 81-8: movido
 * da página pública para cá — o modal interno usa a mesma lista via API.
 */
export function buildDayOptions(timezone: string, week: WeekSchedule, now: Date = new Date()): DayOption[] {
  const out: DayOption[] = []
  const wk: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  for (let i = 0; i < 14; i++) {
    const instant = new Date(now.getTime() + i * 86_400_000)
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    }).formatToParts(instant)
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ""
    const dow = wk[get("weekday")] ?? 0
    if (!week[dow]?.isOpen) continue
    const label = new Intl.DateTimeFormat("pt-BR", {
      timeZone: timezone,
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
    }).format(instant)
    out.push({ date: `${get("year")}-${get("month")}-${get("day")}`, label })
  }
  return out
}

/** O instante está dentro do expediente do dia (no fuso) e alinhado ao passo de 30min? */
export function isValidImobSlot(startUtc: Date, week: WeekSchedule, timezone: string): boolean {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(startUtc)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  const y = get("year")
  const mo = get("month")
  const d = get("day")
  const hour = get("hour") % 24
  const minute = get("minute")
  if (minute % SLOT_STEP_MIN !== 0) return false // início alinhado a :00/:30

  const day = week[dowOf(y, mo, d, timezone)]
  if (!day?.isOpen) return false
  // Mesma semântica da grade (imobSlotsForDay): início >= abertura e a visita
  // de 60min cabendo inteira no expediente.
  const startMin = hour * 60 + minute
  return startMin >= parseHM(day.open) && startMin + SLOT_DURATION_MIN <= parseHM(day.close)
}
