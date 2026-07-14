// Story 78-12 — Funções puras de agregação/janela/comparação do resumo mensal e do alerta de
// anomalia de gasto (Epic 78).
//
// Sem I/O — testáveis isoladamente (cost-summary.test.ts), mesmo padrão de extração de
// `reminder-schedule.ts` (78-11) e `collection-health.ts` (78-13). Os crons
// `GET /api/cron/billing-monthly-summary` e `GET /api/cron/billing-cost-anomaly` consomem
// estas funções; toda a lógica de datas/agregação/percentual vive aqui, não nas rotas.
//
// Regra de moeda (NFR-7): NUNCA somar USD com BRL. Todas as agregações são por moeda.

import { pad2, type SaoPauloDate } from "@web/lib/billing/reminder-schedule"

/**
 * Métricas de bookkeeping/coleta que também têm `currency IS NULL` mas NÃO são uso técnico do
 * fornecedor — são marcadores internos de coleta/alerta. Excluídas do bloco "Uso técnico" do
 * resumo mensal (correção @po da coerência cruzada 78-12 ↔ 78-13):
 *   - collection_error            → marcador de falha de coletor (run-collector.ts, Story 78-3)
 *   - collection_health_alert_sent → marcador de dedup do alerta de falha (Story 78-13)
 */
export const BOOKKEEPING_METRICS = ["collection_error", "collection_health_alert_sent"]

/** Limiar default fixo de anomalia MoM: +50% (1,5×). Não configurável por serviço (AC6/AC7). */
export const ANOMALY_MOM_THRESHOLD = 0.5

/** Slug do serviço de mídia (Meta Ads), excluído do total "a pagar" de infraestrutura (CON-8). */
export const MEDIA_BUDGET_SLUG = "meta_ads"

/** Último dia (28-31) do mês (y, m 1-based), via Date.UTC (dia 0 do mês seguinte). */
export function ultimoDiaDoMes(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export type MesAnterior = {
  periodo: string // "YYYY-MM"
  y: number
  m: number
  inicio: string // "YYYY-MM-01"
  fim: string // "YYYY-MM-<último dia>"
}

/**
 * Mês anterior a `hoje` (America/Sao_Paulo), tratando virada de ano (janeiro → dezembro do ano
 * anterior). Retorna período "YYYY-MM" + janela completa [primeiro, último] dia do mês.
 */
export function mesAnterior(hoje: SaoPauloDate): MesAnterior {
  const y = hoje.m === 1 ? hoje.y - 1 : hoje.y
  const m = hoje.m === 1 ? 12 : hoje.m - 1
  const periodo = `${y}-${pad2(m)}`
  return {
    periodo,
    y,
    m,
    inicio: `${periodo}-01`,
    fim: `${periodo}-${pad2(ultimoDiaDoMes(y, m))}`,
  }
}

export type MtdWindows = {
  periodoAtual: string // "YYYY-MM" do mês CORRENTE (não do mês resumido)
  atualInicio: string // "YYYY-MM-01"
  atualFim: string // ontem (hoje.d - 1)
  anteriorInicio: string
  anteriorFim: string // mesmo nº de dia do mês anterior, com clamp para o último dia disponível
}

/**
 * Janelas month-to-date para o alerta de anomalia:
 *   - mês corrente: [dia 1, ontem] (nunca inclui "hoje" — dados do dia corrente em coleta);
 *   - mês anterior: [dia 1, mesmo nº de dia] com clamp (ex.: 31 no mês corrente → 28/29 em fev).
 * Retorna `null` se `hoje.d === 1` (não há "ontem" no mês corrente ainda → nada a avaliar).
 */
export function mtdWindows(hoje: SaoPauloDate): MtdWindows | null {
  if (hoje.d === 1) return null
  const ontem = hoje.d - 1
  const periodoAtual = `${hoje.y}-${pad2(hoje.m)}`
  const prev = mesAnterior(hoje)
  const diaAnterior = Math.min(ontem, ultimoDiaDoMes(prev.y, prev.m))
  return {
    periodoAtual,
    atualInicio: `${periodoAtual}-01`,
    atualFim: `${periodoAtual}-${pad2(ontem)}`,
    anteriorInicio: prev.inicio,
    anteriorFim: `${prev.periodo}-${pad2(diaAnterior)}`,
  }
}

/**
 * Percentual de aumento MoM. Casos de borda (AUTO-DECISION da story):
 *   - mtdAnterior = 0 e mtdAtual > 0 → Infinity (gasto novo sem base → anomalia por definição);
 *   - ambos 0 → 0 (nada a avaliar).
 */
export function percentualMoM(mtdAtual: number, mtdAnterior: number): number {
  if (mtdAnterior === 0) return mtdAtual > 0 ? Infinity : 0
  return (mtdAtual - mtdAnterior) / mtdAnterior
}

/** Linha mínima consumida das queries de snapshots. */
export type CostRow = {
  service_id: string
  metric: string
  value: number | string
  currency: string | null
}

export type MonetarioServicoMoeda = {
  service_id: string
  currency: string
  total: number
}

/** Soma `value` por (service_id, currency), apenas de linhas monetárias (`currency != null`). */
export function somarMonetarioPorServicoMoeda(
  rows: CostRow[]
): Map<string, MonetarioServicoMoeda> {
  const out = new Map<string, MonetarioServicoMoeda>()
  for (const r of rows) {
    if (r.currency == null) continue
    const key = `${r.service_id}:${r.currency}`
    const cur = out.get(key) ?? { service_id: r.service_id, currency: r.currency, total: 0 }
    cur.total += Number(r.value)
    out.set(key, cur)
  }
  return out
}

/**
 * Total monetário por moeda, EXCLUINDO serviços em `excludeServiceIds` (ex.: Meta Ads — CON-8,
 * budget de mídia não entra no total "a pagar" de infraestrutura). Nunca soma moedas diferentes.
 */
export function somarTotalPorMoeda(
  rows: CostRow[],
  excludeServiceIds: Set<string>
): Map<string, number> {
  const out = new Map<string, number>()
  for (const r of rows) {
    if (r.currency == null) continue
    if (excludeServiceIds.has(r.service_id)) continue
    out.set(r.currency, (out.get(r.currency) ?? 0) + Number(r.value))
  }
  return out
}

export type TecnicoServicoMetrica = {
  service_id: string
  metric: string
  total: number
}

/**
 * Soma `value` por (service_id, metric) do bloco de USO TÉCNICO: linhas com `currency IS NULL`
 * EXCLUINDO as métricas de bookkeeping (`collection_error`/`collection_health_alert_sent`), que
 * também têm currency null mas são marcadores internos, não uso do fornecedor (AC4).
 */
export function somarTecnicoPorServicoMetrica(
  rows: CostRow[]
): Map<string, TecnicoServicoMetrica> {
  const out = new Map<string, TecnicoServicoMetrica>()
  for (const r of rows) {
    if (r.currency != null) continue
    if (BOOKKEEPING_METRICS.includes(r.metric)) continue
    const key = `${r.service_id}:${r.metric}`
    const cur = out.get(key) ?? { service_id: r.service_id, metric: r.metric, total: 0 }
    cur.total += Number(r.value)
    out.set(key, cur)
  }
  return out
}

/** Soma monetária por moeda de um único conjunto de linhas (uma janela de um serviço). */
export function somarPorMoeda(rows: CostRow[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const r of rows) {
    if (r.currency == null) continue
    out.set(r.currency, (out.get(r.currency) ?? 0) + Number(r.value))
  }
  return out
}

export type AnomalyAlertType = "cost_anomaly_mom" | "threshold_absolute"

export type AnomalyTrigger = {
  type: AnomalyAlertType
  currency: string
  mtdAtual: number
  mtdAnterior: number
  percentual: number
  threshold?: number
}

/**
 * Avalia os gatilhos de anomalia de um serviço, por moeda, a partir dos totais MTD das duas
 * janelas (mês corrente vs. mesmo período do mês anterior):
 *   - `cost_anomaly_mom`: percentualMoM >= +50% (default fixo);
 *   - `threshold_absolute`: se `thresholdAbsoluto` (override opcional) não-nulo e mtdAtual >= ele.
 * Os dois tipos são independentes (um serviço pode disparar os dois no mesmo mês). O respeito a
 * `cost_alerts_enabled` e o dedup por (serviço, tipo, mês) ficam na rota (I/O), não aqui.
 */
export function avaliarAnomalias(params: {
  atualPorMoeda: Map<string, number>
  anteriorPorMoeda: Map<string, number>
  thresholdAbsoluto: number | null
}): AnomalyTrigger[] {
  const { atualPorMoeda, anteriorPorMoeda, thresholdAbsoluto } = params
  const triggers: AnomalyTrigger[] = []
  for (const [currency, mtdAtual] of atualPorMoeda) {
    const mtdAnterior = anteriorPorMoeda.get(currency) ?? 0
    const percentual = percentualMoM(mtdAtual, mtdAnterior)

    if (percentual >= ANOMALY_MOM_THRESHOLD) {
      triggers.push({ type: "cost_anomaly_mom", currency, mtdAtual, mtdAnterior, percentual })
    }
    if (thresholdAbsoluto != null && mtdAtual >= thresholdAbsoluto) {
      triggers.push({
        type: "threshold_absolute",
        currency,
        mtdAtual,
        mtdAnterior,
        percentual,
        threshold: thresholdAbsoluto,
      })
    }
  }
  return triggers
}

/** Formata um valor monetário em pt-BR com a moeda ("USD 120,00"). */
export function formatMoeda(currency: string, value: number): string {
  const n = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
  return `${currency} ${n}`
}
