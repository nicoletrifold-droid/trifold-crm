// Story 78-13 — Funções puras de detecção de falha de coleta persistente (Epic 78).
//
// Sem I/O — testáveis isoladamente (collection-health.test.ts), mesmo padrão de extração
// de `reminder-schedule.ts` (Story 78-11). O cron `GET /api/cron/billing-collection-health`
// consome estas funções; toda a lógica de "N dias consecutivos" vive aqui, não na rota.
//
// Sinal-fonte: `service_cost_snapshots.metric='collection_error'` (collection_status='error'),
// gravado por `run-collector.ts` (78-3) em toda falha isolada de coletor. Uma credencial
// revogada ou cobrança recusada tende a se manifestar como falha PERSISTENTE (dia após dia),
// não como erro isolado de 1 dia (timeout/instabilidade pontual). Detectamos esse padrão.

import { pad2, toIsoDate, type SaoPauloDate } from "@web/lib/billing/reminder-schedule"

/**
 * Limiar de dias corridos consecutivos de `collection_error` para disparar alerta.
 * Constante de código nesta primeira versão (não configurável por serviço — Article IV,
 * escopo não solicitado). 1 dia é ruidoso (timeout de rede); 3 dias equilibra detecção
 * rápida com baixa fadiga de alerta. Ver AUTO-DECISION nas Dev Notes da Story 78-13.
 */
export const CONSECUTIVE_ERROR_THRESHOLD_DAYS = 3

/**
 * Subtrai `n` dias de calendário de um {y,m,d}, via Date.UTC (evita o bug de ±1 dia do fuso).
 * Pura — não depende de "agora". Usada para calcular os dias-alvo a partir de "hoje".
 */
export function subtrairDias(dt: SaoPauloDate, n: number): SaoPauloDate {
  const ms = Date.UTC(dt.y, dt.m - 1, dt.d) - n * 86_400_000
  const d = new Date(ms)
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }
}

/**
 * Os N dias-alvo consecutivos ANTERIORES a "hoje": [hoje-1, hoje-2, ..., hoje-N] em
 * America/Sao_Paulo, como strings "YYYY-MM-DD" (reusa toIsoDate de reminder-schedule).
 *
 * IMPORTANTE (alinhamento temporal — evita off-by-one): os coletores diários (78-3/78-5/78-7)
 * gravam, no dia D, `snapshot_date = D-1` (janela default = "ontem"). Por isso o cron desta
 * story, rodando no dia D (agendado DEPOIS de todos os coletores do dia), checa [D-1, D-2, D-3]
 * — exatamente o que os 3 últimos ciclos de coleta escreveram. Checar [D, D-1, D-2] seria um
 * bug, pois nenhum coletor ainda gravou `snapshot_date = D` hoje.
 */
export function diasAlvoConsecutivos(
  hoje: SaoPauloDate,
  threshold: number = CONSECUTIVE_ERROR_THRESHOLD_DAYS
): string[] {
  const dias: string[] = []
  for (let n = 1; n <= threshold; n++) {
    dias.push(toIsoDate(subtrairDias(hoje, n)))
  }
  return dias
}

/**
 * Linha mínima consumida da query de snapshots (só o que a detecção precisa).
 */
export type SnapshotErrorRow = {
  service_id: string
  snapshot_date: string
}

/**
 * PURA: dado um conjunto de linhas de erro `{service_id, snapshot_date}` e a lista de
 * `diasAlvo`, retorna o conjunto de `service_id` que têm erro em TODOS os `diasAlvo`
 * (falha consecutiva completa), não apenas em alguns.
 *
 * - Agrupa por `service_id` o conjunto de `snapshot_date` observados.
 * - Datas fora de `diasAlvo` na entrada são ignoradas (defensivo — a query pode trazer
 *   linhas a mais; a decisão só considera os dias-alvo).
 * - Normaliza a parte de data de um eventual timestamp ("...T..." → "YYYY-MM-DD").
 * - `diasAlvo` vazio → nunca detecta (evita falso positivo por conjunto-vazio ⊆ qualquer).
 */
export function detectarFalhaConsecutiva(
  rows: SnapshotErrorRow[],
  diasAlvo: string[]
): Set<string> {
  const detectados = new Set<string>()
  if (diasAlvo.length === 0) return detectados

  const alvoSet = new Set(diasAlvo)
  const porServico = new Map<string, Set<string>>()

  for (const row of rows) {
    if (!row.service_id || !row.snapshot_date) continue
    const dia = row.snapshot_date.split("T")[0] ?? row.snapshot_date
    if (!alvoSet.has(dia)) continue
    let dias = porServico.get(row.service_id)
    if (!dias) {
      dias = new Set<string>()
      porServico.set(row.service_id, dias)
    }
    dias.add(dia)
  }

  for (const [serviceId, diasComErro] of porServico) {
    if (diasAlvo.every((d) => diasComErro.has(d))) {
      detectados.add(serviceId)
    }
  }
  return detectados
}

/** Formata "YYYY-MM-DD" → "DD/MM/YYYY" para exibição em mensagens (helper de UI puro). */
export function formatDateBr(iso: string): string {
  const [y, m, d] = (iso.split("T")[0]?.split("-") ?? []).map(Number)
  return y && m && d ? `${pad2(d)}/${pad2(m)}/${y}` : iso
}
