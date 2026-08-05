/**
 * Visão Executiva do Analytics — agregações puras dos gráficos executivos.
 *
 * Todas as funções são puras (recebem linhas, devolvem dados prontos para o
 * gráfico) para serem testáveis sem Supabase. Convenção de fuso: BRT = UTC-3
 * fixo, a MESMA da API `leads-by-period` — os dois gráficos de série temporal
 * da página precisam concordar sobre em que dia um lead caiu.
 */

export type ExecGranularity = "day" | "week"

/** Janela ≥ 42 dias agrupa por semana; abaixo disso, por dia. */
export function pickGranularity(days: number): ExecGranularity {
  return days >= 42 ? "week" : "day"
}

/** Date com campos UTC representando o instante em BRT (UTC-3 fixo). */
function brtShift(iso: string | Date): Date {
  const d = typeof iso === "string" ? new Date(iso) : iso
  return new Date(d.getTime() - 3 * 60 * 60 * 1000)
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
}

/** Chave de dia (yyyy-mm-dd) em BRT. */
export function dayKey(iso: string): string {
  return ymd(brtShift(iso))
}

/** Chave de semana (segunda-feira, yyyy-mm-dd) em BRT. */
export function weekKey(iso: string): string {
  const brt = brtShift(iso)
  const day = brt.getUTCDay()
  brt.setUTCDate(brt.getUTCDate() + (day === 0 ? -6 : 1 - day))
  return ymd(brt)
}

export function periodKey(iso: string, granularity: ExecGranularity): string {
  return granularity === "week" ? weekKey(iso) : dayKey(iso)
}

/** Lista de períodos (com zeros) cobrindo [from, to] na granularidade dada. */
export function listPeriods(fromISO: string, toISO: string, granularity: ExecGranularity): string[] {
  const periods: string[] = []
  const start = brtShift(fromISO)
  const end = brtShift(toISO)
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()))
  if (granularity === "week") {
    const day = cur.getUTCDay()
    cur.setUTCDate(cur.getUTCDate() + (day === 0 ? -6 : 1 - day))
  }
  const endSnap = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()))
  const step = granularity === "week" ? 7 : 1
  while (cur <= endSnap) {
    periods.push(ymd(cur))
    cur.setUTCDate(cur.getUTCDate() + step)
  }
  return periods
}

// ── Comparativo atual × período anterior ─────────────────────────────────────

export interface ComparisonPoint {
  /** Dia (índice 1..N dentro da janela — eixo compartilhado entre os períodos). */
  index: number
  date: string
  count: number
  cumulative: number
  prevDate: string | null
  prevCount: number | null
  prevCumulative: number | null
}

export interface ComparisonData {
  points: ComparisonPoint[]
  totals: { current: number; previous: number; deltaPct: number | null }
}

/**
 * Alinha o período atual e o anterior por índice de dia (dia 1 com dia 1, …) e
 * acumula. `currentCreatedAt`/`prevCreatedAt` são os created_at brutos de cada janela.
 */
export function buildComparison(
  currentCreatedAt: string[],
  prevCreatedAt: string[],
  fromISO: string,
  toISO: string,
  prevFromISO: string,
  prevToISO: string
): ComparisonData {
  const days = listPeriods(fromISO, toISO, "day")
  const prevDays = listPeriods(prevFromISO, prevToISO, "day")

  const countBy = (dates: string[]) => {
    const m = new Map<string, number>()
    for (const iso of dates) {
      const k = dayKey(iso)
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return m
  }
  const curMap = countBy(currentCreatedAt)
  const prevMap = countBy(prevCreatedAt)

  let cum = 0
  let prevCum = 0
  const points: ComparisonPoint[] = days.map((date, i) => {
    const count = curMap.get(date) ?? 0
    cum += count
    const prevDate = prevDays[i] ?? null
    const prevCount = prevDate ? (prevMap.get(prevDate) ?? 0) : null
    if (prevCount != null) prevCum += prevCount
    return {
      index: i + 1,
      date,
      count,
      cumulative: cum,
      prevDate,
      prevCount,
      prevCumulative: prevDate ? prevCum : null,
    }
  })

  const current = cum
  const previous = prevCreatedAt.length
  return {
    points,
    totals: {
      current,
      previous,
      deltaPct: previous > 0 ? Math.round(((current - previous) / previous) * 100) : null,
    },
  }
}

// ── Origens ao longo do tempo (empilhado) ────────────────────────────────────

export interface SourceTrendSeries {
  key: string
  label: string
  data: number[]
}

export interface SourceTrendData {
  granularity: ExecGranularity
  periods: string[]
  series: SourceTrendSeries[]
  total: number
  /** Rótulos das origens dobradas em "Demais origens", por volume desc —
   *  exibidos como legenda auxiliar pra conciliar com o Aproveitamento. */
  foldedLabels: string[]
}

/**
 * Top N origens viram séries próprias; o resto dobra em "Demais origens"
 * (nunca gerar mais matizes — regra do guia de dataviz; e "Outros" colidia
 * com a origem real "Outro"/other, que confundia a leitura). A ordem das
 * séries é fixa por volume TOTAL da janela, então a cor segue a origem
 * enquanto o usuário navega.
 */
export function buildSourceTrend(
  rows: { created_at: string; source: string | null }[],
  fromISO: string,
  toISO: string,
  granularity: ExecGranularity,
  labels: Record<string, string>,
  topN = 4
): SourceTrendData {
  const periods = listPeriods(fromISO, toISO, granularity)
  const periodIndex = new Map(periods.map((p, i) => [p, i]))

  const totals = new Map<string, number>()
  for (const r of rows) {
    const s = r.source ?? "other"
    totals.set(s, (totals.get(s) ?? 0) + 1)
  }
  const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN).map(([k]) => k)
  const topSet = new Set(top)

  const mk = () => new Array<number>(periods.length).fill(0)
  const seriesMap = new Map<string, number[]>(top.map((k) => [k, mk()]))
  const outros = mk()
  let hasOutros = false

  for (const r of rows) {
    const i = periodIndex.get(periodKey(r.created_at, granularity))
    if (i == null) continue
    const s = r.source ?? "other"
    if (topSet.has(s)) {
      const arr = seriesMap.get(s)!
      arr[i] = (arr[i] ?? 0) + 1
    } else {
      outros[i] = (outros[i] ?? 0) + 1
      hasOutros = true
    }
  }

  const series: SourceTrendSeries[] = top.map((k) => ({ key: k, label: labels[k] ?? k, data: seriesMap.get(k)! }))
  if (hasOutros) series.push({ key: "__outros", label: "Demais origens", data: outros })

  const foldedLabels = [...totals.entries()]
    .filter(([k]) => !topSet.has(k))
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => labels[k] ?? k)

  return { granularity, periods, series, total: rows.length, foldedLabels }
}

// ── Mapa de calor dia da semana × hora (BRT) ─────────────────────────────────

export interface HeatmapData {
  /** grid[diaSemana][hora] — 0 = domingo (getUTCDay), horas 0–23 em BRT. */
  grid: number[][]
  max: number
  total: number
}

export function buildHeatmap(rows: { created_at: string }[]): HeatmapData {
  const grid = Array.from({ length: 7 }, () => new Array<number>(24).fill(0))
  let max = 0
  for (const r of rows) {
    const brt = brtShift(r.created_at)
    const row = grid[brt.getUTCDay()]!
    const h = brt.getUTCHours()
    const cell = (row[h] ?? 0) + 1
    row[h] = cell
    if (cell > max) max = cell
  }
  return { grid, max, total: rows.length }
}

// ── Aproveitamento (desfecho) por origem / corretor ──────────────────────────

export type Outcome = "visita" | "perdido" | "ativo" | "outro"

export interface OutcomeLead {
  id: string
  lost_reason: string | null
  is_active: boolean | null
}

/**
 * Desfecho do lead, alinhado às definições dos cards de topo (Story 75-178/179):
 * perdido = lost_reason preenchido (card Perdidos); visita = tem visita registrada;
 * ativo = is_active sem lost_reason (card Ativos); outro = inativo sem motivo.
 *
 * Story 75-276 — a faixa "fechado" (etapa de fechamento) virou "visita": Fechados
 * media 0% em TODA linha (zero fechamentos em 7d e 30d na medição de 05/08), e visita
 * é o desfecho que se cobra de origem e de corretor.
 *
 * A visita vem de `appointments` (o lead TEM registro), nunca da ETAPA ATUAL: etapa é
 * foto, não histórico — quem visitou e avançou para Proposta, ou visitou e foi perdido,
 * sairia da conta e a origem pareceria pior do que foi (medido: etapa atual descarta
 * mais da metade do sinal em 30d).
 *
 * Ordem da cascata carrega duas decisões medidas em prod:
 * - `perdido` ANTES de `visita` (decisão do Marcos): quem visitou e depois foi perdido
 *   fica em Perdidos, para a barra vermelha não mudar de sentido.
 * - `visita` ANTES de `outro`: não-lead/cliente com visita conta como visita (0 casos
 *   em 90d, mas a ordem decide — então está escolhido, não sorteado).
 */
export function classifyOutcome(lead: OutcomeLead, visitLeadIds: Set<string>): Outcome {
  if (lead.lost_reason) return "perdido"
  if (visitLeadIds.has(lead.id)) return "visita"
  if (lead.is_active) return "ativo"
  return "outro"
}

export interface OutcomeRow {
  key: string
  label: string
  total: number
  visitas: number
  ativos: number
  perdidos: number
  outros: number
}

/** Agrega desfechos por uma chave (origem, corretor…). Linhas sem chave são ignoradas. */
export function buildOutcomeRows<T extends OutcomeLead>(
  rows: T[],
  visitLeadIds: Set<string>,
  keyOf: (row: T) => string | null,
  labelOf: (key: string) => string
): OutcomeRow[] {
  const map = new Map<string, OutcomeRow>()
  for (const r of rows) {
    const key = keyOf(r)
    if (!key) continue
    let entry = map.get(key)
    if (!entry) {
      entry = { key, label: labelOf(key), total: 0, visitas: 0, ativos: 0, perdidos: 0, outros: 0 }
      map.set(key, entry)
    }
    entry.total++
    const outcome = classifyOutcome(r, visitLeadIds)
    if (outcome === "visita") entry.visitas++
    else if (outcome === "perdido") entry.perdidos++
    else if (outcome === "ativo") entry.ativos++
    else entry.outros++
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
}

// ── Visitas por período (appointments) ───────────────────────────────────────

export interface VisitsData {
  granularity: ExecGranularity
  periods: string[]
  realizadas: number[]
  agendadas: number[]
  noShow: number[]
  canceladas: number[]
  totals: { realizadas: number; agendadas: number; noShow: number; canceladas: number; taxaNoShow: number | null }
}

export function buildVisits(
  appts: { scheduled_at: string; status: string }[],
  fromISO: string,
  toISO: string,
  granularity: ExecGranularity
): VisitsData {
  const periods = listPeriods(fromISO, toISO, granularity)
  const periodIndex = new Map(periods.map((p, i) => [p, i]))
  const mk = () => new Array<number>(periods.length).fill(0)
  const realizadas = mk()
  const agendadas = mk()
  const noShow = mk()
  const canceladas = mk()

  const bump = (arr: number[], i: number) => {
    arr[i] = (arr[i] ?? 0) + 1
  }
  for (const a of appts) {
    const i = periodIndex.get(periodKey(a.scheduled_at, granularity))
    if (i == null) continue
    if (a.status === "completed") bump(realizadas, i)
    else if (a.status === "no_show") bump(noShow, i)
    else if (a.status === "cancelled") bump(canceladas, i)
    else bump(agendadas, i) // scheduled | confirmed
  }

  const sum = (arr: number[]) => arr.reduce((s, n) => s + n, 0)
  const tR = sum(realizadas)
  const tA = sum(agendadas)
  const tN = sum(noShow)
  const tC = sum(canceladas)
  // Taxa de no-show sobre visitas que tiveram desfecho (realizada ou no-show).
  const decided = tR + tN
  return {
    granularity,
    periods,
    realizadas,
    agendadas,
    noShow,
    canceladas,
    totals: { realizadas: tR, agendadas: tA, noShow: tN, canceladas: tC, taxaNoShow: decided > 0 ? Math.round((tN / decided) * 100) : null },
  }
}

// ── Payload completo da API ──────────────────────────────────────────────────

export interface ExecutiveData {
  comparison: ComparisonData
  sourceTrend: SourceTrendData
  heatmap: HeatmapData
  outcomeBySource: OutcomeRow[]
  outcomeByBroker: OutcomeRow[]
  visits: VisitsData
}
