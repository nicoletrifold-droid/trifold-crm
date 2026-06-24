/**
 * Story 75-48 — Tempo "de relógio comercial": conta apenas os minutos dentro do
 * horário de funcionamento da roleta (pausa à noite/fora dos dias úteis). Usado
 * pelo alerta de SLA para não punir o corretor pelo tempo em que ninguém trabalha.
 *
 * Lê a config da roleta (mesmos campos de `roleta_config`). Puro/testável.
 */
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
