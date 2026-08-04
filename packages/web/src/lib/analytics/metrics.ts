/**
 * Story 75-179 — Fonte única (client) das métricas do Analytics.
 *
 * Tela (`dashboard/analytics/page.tsx`) e PDF (`analytics-report-data.ts`) derivavam
 * as mesmas métricas da RPC `get_analytics_summary_ranged` com código próprio — o que
 * já causou divergência (75-178). Este módulo centraliza o TIPO do retorno da RPC e a
 * derivação das métricas de topo, para as duas pontas lerem exatamente o mesmo cálculo.
 */

import { LOST_REASON_ALL_GROUP_LABELS } from "@web/lib/constants"

export type AnalyticsFunnelEntry = { stage_id: string; name: string; slug: string; color: string; position: number; count: number | string }
export type AnalyticsPropertyEntry = { property_id: string; name: string; count: number | string }
export type AnalyticsBrokerEntry = { user_id: string; name: string; count: number | string; avg_score: number | null }

/** Shape do retorno de `get_analytics_summary_ranged` (mig 109/136/178/213). */
export interface AnalyticsSummary {
  funnel: AnalyticsFunnelEntry[] | null
  by_property: AnalyticsPropertyEntry[] | null
  by_broker: AnalyticsBrokerEntry[] | null
  source_counts: Record<string, number | string> | null
  lost_reasons: Record<string, number | string> | null
  /** Perdidos por GRUPO estruturado/heurístico (mig 213) — mesmo universo de lost_reasons. */
  lost_reason_groups?: Record<string, number | string> | null
  /** Quantos perdidos da janela têm grupo escolhido pelo humano (vs heurística). */
  lost_reason_estruturados?: number | string | null
  /** Todas as entradas da janela (mig 178). */
  total_leads: number | string
  /** Entradas ativas e não-perdidas (subconjunto). */
  new_leads: number | string
}

export interface AnalyticsCoreMetrics {
  /** Todas as entradas do período (inclui perdidos). */
  entradas: number
  /** Entradas ativas e não-perdidas (subconjunto das entradas). */
  ativos: number
  /** Perdidos do período (subconjunto das entradas). */
  perdidos: number
}

/** Converte number|string|null da RPC (jsonb pode vir string) em número seguro. */
export function toCount(v: number | string | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === "string" ? Number(v) : v
  return Number.isFinite(n) ? n : 0
}

/**
 * Deriva as métricas de topo a partir do summary da RPC. Fonte única para tela e PDF.
 * `entradas` ⊇ `ativos` e `entradas` ⊇ `perdidos` (subconjuntos).
 */
export function deriveAnalyticsMetrics(summary: AnalyticsSummary | null | undefined): AnalyticsCoreMetrics {
  return {
    entradas: toCount(summary?.total_leads),
    ativos: toCount(summary?.new_leads),
    perdidos: Object.values(summary?.lost_reasons ?? {}).reduce<number>((s, v) => s + toCount(v), 0),
  }
}

export interface LostReasonGroupEntry {
  grupo: string
  label: string
  count: number
}

/**
 * Story 75-266 — deriva as linhas do card "Motivos de Perda" a partir do mapa
 * grupo→contagem (chave `lost_reason_groups` da RPC de resumo, ou `groups` de
 * `get_lost_reason_groups`). Fonte única para tela e PDF, como as métricas acima.
 * Slug sem label conhecido é exibido cru — nunca some do card.
 */
export function deriveLostReasonGroups(
  groups: Record<string, number | string> | null | undefined,
): LostReasonGroupEntry[] {
  return Object.entries(groups ?? {})
    .map(([grupo, v]) => ({ grupo, label: LOST_REASON_ALL_GROUP_LABELS[grupo] ?? grupo, count: toCount(v) }))
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count)
}
