// Story 78-11 — Funções puras de agenda do motor de lembretes de billing.
//
// Extraídas de `packages/web/src/app/api/cron/billing-reminders/route.ts` (78-8), onde eram
// locais, para serem REUSADAS pelo cron E pelo PATCH `/api/admin/billing-reminders/[id]`
// (recorrência-ao-pagar, 78-11). Sem I/O — testáveis isoladamente (reminder-schedule.test.ts).
//
// [ATENÇÃO AO SINAL — NOTA @po 2026-07-13] Há DUAS convenções de "distância de dias" aqui:
//   - `diffDias(due, hoje)`        = hoje - due  → POSITIVO = já VENCIDA   (herdado da 78-8)
//   - `diffDiasAteVencer(due, hoje)` = due - hoje → POSITIVO = ainda FALTA vencer (usado por deveAlertar)
// São o INVERSO uma da outra. Os gatilhos D-N/D-0/vencida usam `diffDiasAteVencer`. Usar
// `diffDias` cru no lugar inverteria os gatilhos — por isso a função dedicada + teste de sinal.

export type BillingCycleRecurring = "monthly" | "annual"

export type SaoPauloDate = { y: number; m: number; d: number }

/** "Hoje" (y/m/d inteiros) em America/Sao_Paulo — nunca UTC cru (mesmo padrão de boleto-scan). */
export function hojeSaoPaulo(now: Date): SaoPauloDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  return { y: get("year"), m: get("month"), d: get("day") }
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

/** "YYYY-MM-DD" de um {y,m,d}. */
export function toIsoDate(dt: SaoPauloDate): string {
  return `${dt.y}-${pad2(dt.m)}-${pad2(dt.d)}`
}

/**
 * Diferença inteira de dias de calendário: `hoje - due_date`. POSITIVO = já VENCIDA.
 * Compara via Date.UTC nos dois lados (evita o bug de ±1 dia do fuso). null se inválida.
 * Mantido com a MESMA semântica da 78-8 para não quebrar consumidores existentes.
 */
export function diffDias(dueDateIso: string, hoje: SaoPauloDate): number | null {
  const [y, m, d] = (dueDateIso.split("T")[0]?.split("-") ?? []).map(Number)
  if (!y || !m || !d) return null
  const dueUTC = Date.UTC(y, m - 1, d)
  const hojeUTC = Date.UTC(hoje.y, hoje.m - 1, hoje.d)
  return Math.round((hojeUTC - dueUTC) / 86_400_000)
}

/**
 * Distância em dias ATÉ o vencimento: `due_date - hoje` (sinal INVERSO de `diffDias`).
 * POSITIVO = ainda faltam N dias para vencer; 0 = vence hoje; NEGATIVO = vencida há N dias.
 * É esta convenção que os gatilhos D-N/D-0/vencida usam. null se `due_date` inválida.
 */
export function diffDiasAteVencer(dueDateIso: string, hoje: SaoPauloDate): number | null {
  const d = diffDias(dueDateIso, hoje)
  if (d === null) return null
  return d === 0 ? 0 : -d // evita -0 (mantém Object.is(0) para comparações estritas)
}

/**
 * Avança due_date um ciclo (monthly = +1 mês, annual = +12 meses), tratando overflow de
 * dia-do-mês por clamp para o último dia do mês de destino (ex.: 31/01 mensal → 28/02 ou
 * 29/02 em ano bissexto). Projeto não usa date-fns — cálculo manual documentado.
 */
export function avancarCiclo(dueDateIso: string, cycle: BillingCycleRecurring): string | null {
  const [y, m, d] = (dueDateIso.split("T")[0]?.split("-") ?? []).map(Number)
  if (!y || !m || !d) return null
  const monthsToAdd = cycle === "annual" ? 12 : 1
  const total0 = m - 1 + monthsToAdd // mês 0-based acumulado
  const ny = y + Math.floor(total0 / 12)
  const nm0 = ((total0 % 12) + 12) % 12 // 0-based
  // Último dia do mês de destino (dia 0 do mês seguinte).
  const lastDay = new Date(Date.UTC(ny, nm0 + 1, 0)).getUTCDate()
  const nd = Math.min(d, lastDay)
  return `${ny}-${pad2(nm0 + 1)}-${pad2(nd)}`
}

export type AlertDecisionRow = {
  due_date: string
  alert_days_before: number
  last_alerted_on: string | null
}

/**
 * Decide se uma linha deve disparar alerta HOJE. Gatilhos discretos (Story 78-11):
 *   - D-N exato:  distanciaAteVencer === alert_days_before (usuário configura N=3);
 *   - D-0 exato:  distanciaAteVencer === 0;
 *   - vencida:    distanciaAteVencer < 0  → TODO dia (D+1, D+2, ...).
 * Dedup POR DIA: não dispara de novo se `last_alerted_on` já é hoje.
 */
export function deveAlertar(row: AlertDecisionRow, hoje: SaoPauloDate): boolean {
  const distancia = diffDiasAteVencer(row.due_date, hoje)
  if (distancia === null) return false
  const gatilho =
    distancia === row.alert_days_before || distancia === 0 || distancia < 0
  const jaAlertouHoje =
    row.last_alerted_on != null &&
    (row.last_alerted_on.split("T")[0] ?? row.last_alerted_on) === toIsoDate(hoje)
  return gatilho && !jaAlertouHoje
}
