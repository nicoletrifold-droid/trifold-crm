// Story 81-4/81-8 (Epic 81) — grade de horários LIVRES de UMA equipe, usada pelo
// link público de imobiliárias (/agendar/[token]) e pelo modal interno da agenda.
//
// Regras:
//  - Slots de 1h em hora cheia (mesma convenção da agenda interna).
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

  // hora cheia: primeiro slot >= abertura; último slot inicia antes do fechamento
  const firstHour = Math.ceil(openMin / 60)
  for (let h = firstHour; h * 60 < closeMin; h++) {
    const startMs = wallToUtcMs(y, mo, d, h * 60, timezone)
    const endMs = startMs + 60 * 60_000
    if (startMs <= now.getTime()) continue // passado não se oferece

    const taken = busy.some((b) => {
      const bStart = new Date(b.scheduled_at).getTime()
      const bEnd = bStart + (b.duration_minutes ?? 60) * 60_000
      return overlaps(startMs, endMs, bStart, bEnd)
    })

    slots.push({
      startIso: new Date(startMs).toISOString(),
      labelLocal: `${String(h).padStart(2, "0")}:00`,
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

/** O instante está dentro do expediente do dia (no fuso) e em hora cheia? */
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
  if (minute !== 0) return false // hora cheia obrigatória

  const day = week[dowOf(y, mo, d, timezone)]
  if (!day?.isOpen) return false
  // Mesma semântica da grade (imobSlotsForDay): slot é válido se começa dentro
  // do expediente ([abertura, fechamento)) — em hora cheia.
  const startMin = hour * 60
  return startMin >= parseHM(day.open) && startMin < parseHM(day.close)
}
