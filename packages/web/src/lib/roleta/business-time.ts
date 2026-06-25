/**
 * Story 75-48 — Tempo "de relógio comercial": conta apenas os minutos dentro do
 * horário de funcionamento da roleta (pausa à noite/fora dos dias úteis). Usado
 * pelo alerta de SLA para não punir o corretor pelo tempo em que ninguém trabalha.
 *
 * Story 75-58 — Motor de AGENDA POR DIA DA SEMANA (WeekSchedule), fonte única
 * consumida pela distribuição (isOpenAtNow) e pela contagem por dia comercial
 * (commercialDayRange). Mantém as funções `BusinessHoursCfg` acima para o SLA
 * (retrocompatível). Puro/testável; `getOrgSchedule` é o único com I/O.
 *
 * Lê a config da roleta (mesmos campos de `roleta_config`). Puro/testável.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

export interface BusinessHoursCfg {
  business_days: number[] // 0=Dom … 6=Sáb
  business_hour_start: string // "08:00" ou "08:00:00"
  business_hour_end: string
  weekend_hour_start: string | null
  weekend_hour_end: string | null
  timezone: string // ex.: "America/Sao_Paulo"
}

function parseHM(s: string | null | undefined, fallbackMin: number): number {
  if (!s) return fallbackMin
  const [hStr, mStr] = s.split(":")
  const h = Number(hStr)
  const m = Number(mStr ?? 0)
  if (!Number.isFinite(h)) return fallbackMin
  return h * 60 + (Number.isFinite(m) ? m : 0)
}

/** Componentes de calendário (ano/mês/dia/dia-da-semana) de um instante NO fuso. */
function tzParts(instant: Date, timeZone: string): { y: number; mo: number; d: number; dow: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(instant)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ""
  const wk: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return { y: Number(get("year")), mo: Number(get("month")), d: Number(get("day")), dow: wk[get("weekday")] ?? 0 }
}

/** Minutos desde a meia-noite de um instante NO fuso (0..1439). */
function tzMinutesOfDay(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instant)
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0)
  return h * 60 + m
}

/** Offset do fuso (ms a somar ao UTC para obter a parede do fuso) num instante. */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const utc = new Date(instant.toLocaleString("en-US", { timeZone: "UTC" })).getTime()
  const tz = new Date(instant.toLocaleString("en-US", { timeZone })).getTime()
  return tz - utc
}

/** Converte um horário de parede (y-mo-d + minutos do dia) no fuso para epoch ms (UTC). */
function wallToUtcMs(y: number, mo: number, d: number, minutes: number, timeZone: string): number {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const guess = Date.UTC(y, mo - 1, d, h, m)
  const offset = tzOffsetMs(new Date(guess), timeZone)
  return guess - offset
}

function windowMinutes(dow: number, cfg: BusinessHoursCfg): { start: number; end: number } {
  const isWeekend = dow === 0 || dow === 6
  const start = isWeekend
    ? parseHM(cfg.weekend_hour_start ?? cfg.business_hour_start, 8 * 60)
    : parseHM(cfg.business_hour_start, 8 * 60)
  const end = isWeekend
    ? parseHM(cfg.weekend_hour_end ?? cfg.business_hour_end, 18 * 60)
    : parseHM(cfg.business_hour_end, 18 * 60)
  return { start, end }
}

/** Minutos de expediente decorridos entre `from` e `to` (pausa fora do horário/dias úteis). */
export function businessMinutesBetween(from: Date, to: Date, cfg: BusinessHoursCfg): number {
  if (to.getTime() <= from.getTime()) return 0
  let total = 0
  let cur = tzParts(from, cfg.timezone)
  for (let i = 0; i < 120; i++) {
    if (cfg.business_days.includes(cur.dow)) {
      const { start, end } = windowMinutes(cur.dow, cfg)
      const winStart = wallToUtcMs(cur.y, cur.mo, cur.d, start, cfg.timezone)
      const winEnd = wallToUtcMs(cur.y, cur.mo, cur.d, end, cfg.timezone)
      const oStart = Math.max(from.getTime(), winStart)
      const oEnd = Math.min(to.getTime(), winEnd)
      if (oEnd > oStart) total += (oEnd - oStart) / 60000
    }
    // avança 1 dia de calendário no fuso (usa meio-dia UTC p/ evitar bordas)
    const nextNoon = Date.UTC(cur.y, cur.mo - 1, cur.d, 12, 0) + 24 * 60 * 60 * 1000
    cur = tzParts(new Date(nextNoon), cfg.timezone)
    if (wallToUtcMs(cur.y, cur.mo, cur.d, 0, cfg.timezone) > to.getTime()) break
  }
  return Math.round(total)
}

/** Está dentro do horário de funcionamento agora? (para não notificar à noite) */
export function isWithinBusinessHoursNow(cfg: BusinessHoursCfg, now: Date = new Date()): boolean {
  const { dow } = tzParts(now, cfg.timezone)
  if (!cfg.business_days.includes(dow)) return false
  const { start, end } = windowMinutes(dow, cfg)
  const cur = tzMinutesOfDay(now, cfg.timezone)
  return cur >= start && cur < end
}

// ─────────────────── Agenda por dia da semana (Story 75-58) ───────────────────

export interface DaySchedule {
  isOpen: boolean
  open: string // "HH:MM"
  close: string // "HH:MM"
}
/** 7 posições; índice = dia da semana no fuso (0=Dom … 6=Sáb). */
export type WeekSchedule = DaySchedule[]

export interface DayRange {
  /** Início inclusivo (use `.gte`). */
  from: Date
  /** Fim exclusivo (use `.lt`). */
  to: Date
}

const DEFAULT_DAY: DaySchedule = { isOpen: true, open: "08:00", close: "20:00" }

type CalParts = { y: number; mo: number; d: number; dow: number }

/** Deriva as 7 linhas a partir da config antiga (transição/fallback). Puro. */
export function deriveScheduleFromConfig(cfg: BusinessHoursCfg | null | undefined): WeekSchedule {
  return Array.from({ length: 7 }, (_, dow): DaySchedule => {
    if (!cfg) return { ...DEFAULT_DAY }
    const isWeekend = dow === 0 || dow === 6
    const open = isWeekend && cfg.weekend_hour_start ? cfg.weekend_hour_start : cfg.business_hour_start
    const close = isWeekend && cfg.weekend_hour_end ? cfg.weekend_hour_end : cfg.business_hour_end
    return {
      isOpen: cfg.business_days.includes(dow),
      open: (open ?? "08:00").slice(0, 5),
      close: (close ?? "20:00").slice(0, 5),
    }
  })
}

function stepParts(p: CalParts, dir: 1 | -1, tz: string): CalParts {
  const noon = Date.UTC(p.y, p.mo - 1, p.d, 12, 0) + dir * 24 * 60 * 60 * 1000
  return tzParts(new Date(noon), tz)
}

function closeMsOf(p: CalParts, day: DaySchedule, tz: string): number {
  return wallToUtcMs(p.y, p.mo, p.d, parseHM(day.close, 20 * 60), tz)
}

/** Está dentro do expediente agora, segundo a agenda por dia? (fonte única) */
export function isOpenAtNow(now: Date, week: WeekSchedule, tz: string): boolean {
  const p = tzParts(now, tz)
  const day = week[p.dow]
  if (!day?.isOpen) return false
  const cur = tzMinutesOfDay(now, tz)
  return cur >= parseHM(day.open, 8 * 60) && cur < parseHM(day.close, 20 * 60)
}

/**
 * Dia comercial (fechamento→fechamento, ciente da agenda) que CONTÉM `now`.
 * Pula dias fechados: lead em dia fechado ou após o fechamento rola pro próximo
 * dia útil. Retorna { from (inclusivo), to (exclusivo) }.
 */
export function commercialDayRange(now: Date, week: WeekSchedule, tz: string): DayRange {
  const nowMs = now.getTime()
  // Âncora A = primeiro dia ABERTO >= hoje cujo fechamento > now.
  let cur = tzParts(now, tz)
  let aClose: number | null = null
  let aParts = cur
  for (let i = 0; i < 14; i++) {
    const day = week[cur.dow]
    if (day?.isOpen) {
      const c = closeMsOf(cur, day, tz)
      if (c > nowMs) {
        aClose = c
        aParts = cur
        break
      }
    }
    cur = stepParts(cur, 1, tz)
  }
  if (aClose === null) {
    // Defensivo: agenda toda fechada — janela de 24h terminando "agora".
    return { from: new Date(nowMs - 86_400_000), to: new Date(nowMs) }
  }
  // from = fechamento do dia aberto imediatamente ANTERIOR a A.
  let p = stepParts(aParts, -1, tz)
  let fromMs: number | null = null
  for (let i = 0; i < 14; i++) {
    const day = week[p.dow]
    if (day?.isOpen) {
      fromMs = closeMsOf(p, day, tz)
      break
    }
    p = stepParts(p, -1, tz)
  }
  return { from: new Date(fromMs ?? aClose - 86_400_000), to: new Date(aClose) }
}

/** Dia comercial COMPLETO anterior ao que contém `now` (relatório roda antes da abertura). */
export function previousCommercialDayRange(now: Date, week: WeekSchedule, tz: string): DayRange {
  const curr = commercialDayRange(now, week, tz)
  return commercialDayRange(new Date(curr.from.getTime() - 1), week, tz)
}

/**
 * Carrega a agenda (7 linhas) + timezone do org. Fallback defensivo: deriva da
 * roleta_config se a tabela ainda não tiver linhas (pré-migração).
 */
export async function getOrgSchedule(
  orgId: string,
  supabase: SupabaseClient
): Promise<{ week: WeekSchedule; timezone: string }> {
  const [{ data: rows }, { data: cfg }] = await Promise.all([
    supabase.from("roleta_schedule").select("weekday, is_open, open_time, close_time").eq("org_id", orgId),
    supabase
      .from("roleta_config")
      .select("business_days, business_hour_start, business_hour_end, weekend_hour_start, weekend_hour_end, timezone")
      .eq("org_id", orgId)
      .maybeSingle(),
  ])
  const timezone = (cfg?.timezone as string | undefined) || "America/Sao_Paulo"
  if (rows && rows.length > 0) {
    const week: WeekSchedule = Array.from({ length: 7 }, () => ({ ...DEFAULT_DAY }))
    for (const r of rows as Array<{ weekday: number; is_open: boolean; open_time: string; close_time: string }>) {
      if (r.weekday >= 0 && r.weekday <= 6) {
        week[r.weekday] = {
          isOpen: r.is_open,
          open: String(r.open_time).slice(0, 5),
          close: String(r.close_time).slice(0, 5),
        }
      }
    }
    return { week, timezone }
  }
  return { week: deriveScheduleFromConfig(cfg as unknown as BusinessHoursCfg | null), timezone }
}
