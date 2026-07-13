// Story 78-5 — Coletor Vercel (Epic 78). Adapta o contrato `BillingCollector`
// da Story 78-3 (types.ts) e REUSA o runner genérico (run-collector.ts) sem
// modificá-los. O único código novo desta story é: (a) parser JSONL, (b)
// validação de janela <= 1 ano e (c) mapeamento FOCUS -> CostSnapshotRow[].
//
// Endpoint (confirmado na OpenAPI oficial da Vercel — https://openapi.vercel.sh):
//   GET https://api.vercel.com/v1/billing/charges
//   - Content-Type da resposta: application/jsonl (JSON Lines — 1 objeto por
//     linha, NUNCA um array JSON). Por isso: response.text() + split('\n') +
//     JSON.parse por linha; nunca response.json() no corpo inteiro (CON-5/AC2).
//   - Query params confirmados: `from` (ISO 8601 UTC, INCLUSIVO), `to` (ISO 8601
//     UTC, EXCLUSIVO), `teamId`. Ver Completion Notes da story para o dump da spec.
//   - Formato dos registros: FOCUS (FinOps Open Cost & Usage Spec) v1.3.
//   - Auth: Authorization: Bearer ${VERCEL_BILLING_TOKEN}.

import { logEvent } from "@web/lib/logger"
import type {
  BillingCollector,
  CollectWindow,
  CostSnapshotRow,
} from "@web/lib/billing-collectors/types"

const VERCEL_BILLING_URL = "https://api.vercel.com/v1/billing/charges"
const REQUEST_TIMEOUT_MS = 30_000
/** Janela máxima aceita pela API Vercel (CON-5): 1 ano. Folga de 1 dia p/ ano bissexto. */
const MAX_WINDOW_DAYS = 366

/**
 * Erro tipado para ausência das credenciais Vercel. A rota de cron trata este
 * caso ANTES de chamar o runner (AC7: 503 sem gravar snapshot). Aqui serve como
 * rede de segurança caso o coletor seja usado fora da rota.
 */
export class MissingVercelCredentialsError extends Error {
  constructor(missing: "VERCEL_BILLING_TOKEN" | "VERCEL_TEAM_ID") {
    super(`${missing} not set`)
    this.name = "MissingVercelCredentialsError"
  }
}

/**
 * Erro tipado para janela > 1 ano (AC5). A rota captura isto ANTES de delegar
 * ao runCollector() e retorna HTTP 400 (input inválido do chamador), distinto
 * do fluxo de erro do runner (que gravaria collection_status='error').
 */
export class VercelWindowTooLargeError extends Error {
  constructor(days: number) {
    super(`Window of ${days} days exceeds Vercel's 1-year limit (${MAX_WINDOW_DAYS} days)`)
    this.name = "VercelWindowTooLargeError"
  }
}

/**
 * Registro FOCUS v1.3 retornado por linha do JSONL. Todos os campos são
 * declarados opcionais de propósito: o parser é DEFENSIVO — uma linha sem
 * `ChargePeriodStart` ou sem `BilledCost` numérico é ignorada, não inventada.
 * Nomes confirmados na OpenAPI oficial (application/jsonl / FOCUS v1.3).
 */
interface FocusChargeRecord {
  /** Valor que serve de base para faturamento (a métrica de custo principal). */
  BilledCost?: number
  /** Moeda de billing (ISO 4217). Enum na spec: apenas "USD". */
  BillingCurrency?: string
  /** Início (inclusivo) do período de cobrança, ISO 8601 UTC — usado p/ alocar o dia. */
  ChargePeriodStart?: string
  /** Fim (exclusivo) do período de cobrança, ISO 8601 UTC. */
  ChargePeriodEnd?: string
  /** Classificação: Adjustment | Credit | Purchase | Tax | Usage. */
  ChargeCategory?: string
  /** Nome do serviço/produto Vercel. */
  ServiceName?: string
}

function requireCredentials(): { token: string; teamId: string } {
  const token = (process.env.VERCEL_BILLING_TOKEN ?? "").trim()
  if (!token) throw new MissingVercelCredentialsError("VERCEL_BILLING_TOKEN")
  const teamId = (process.env.VERCEL_TEAM_ID ?? "").trim()
  if (!teamId) throw new MissingVercelCredentialsError("VERCEL_TEAM_ID")
  return { token, teamId }
}

/** Soma n dias a uma data civil `YYYY-MM-DD` (aritmética em UTC). */
function addDaysUtc(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Valida a janela <= 1 ano ANTES de qualquer chamada à API (AC5/CON-5). Exportada
 * para a rota poder rejeitar com 400 antes de delegar ao runCollector() (que
 * trataria a exceção como falha de coleta comum, gerando collection_status='error').
 */
export function assertVercelWindow(window: CollectWindow): void {
  const fromMs = new Date(`${window.from}T00:00:00Z`).getTime()
  const toMs = new Date(`${window.to}T00:00:00Z`).getTime()
  const days = (toMs - fromMs) / 86_400_000
  if (days > MAX_WINDOW_DAYS) {
    throw new VercelWindowTooLargeError(Math.round(days))
  }
}

/**
 * Parser JSONL (AC2, ponto técnico central da story). Lê o corpo como texto,
 * separa por `\n`, descarta linhas vazias e faz JSON.parse por linha dentro de
 * try/catch INDIVIDUAL: uma linha malformada é logada e ignorada sem derrubar o
 * parsing das demais. NUNCA usa response.json() no corpo inteiro.
 */
function parseJsonl(text: string): FocusChargeRecord[] {
  const lines = text.split("\n").filter((line) => line.trim().length > 0)
  const records: FocusChargeRecord[] = []
  for (const line of lines) {
    try {
      records.push(JSON.parse(line) as FocusChargeRecord)
    } catch (err) {
      logEvent({
        level: "warn",
        category: "cron",
        event_type: "vercel_jsonl_parse_error",
        message: err instanceof Error ? err.message : String(err),
        metadata: { line: line.slice(0, 500) },
        source: "lib/billing-collectors/vercel",
      })
      // linha malformada é descartada, não interrompe o parsing das demais
    }
  }
  return records
}

/**
 * Mapeamento FOCUS -> CostSnapshotRow[] (AC4). Agrega o `BilledCost` de TODAS as
 * linhas do mesmo dia (por `ChargePeriodStart`) em UMA única linha `cost_usd` /
 * `currency='USD'` — granularidade diária (CON-6), não uma linha por charge bruto.
 * Somar por `BilledCost` respeita o sinal das categorias (Credit/Adjustment podem
 * ser negativos), refletindo o valor líquido que a fatura cobra.
 */
function aggregateDailyCost(records: FocusChargeRecord[]): CostSnapshotRow[] {
  const byDay = new Map<string, { total: number; count: number }>()

  for (const rec of records) {
    const start = rec.ChargePeriodStart
    if (typeof start !== "string" || start.length < 10) {
      // Sem data de período não há como alocar o custo num dia — descarta e loga.
      logEvent({
        level: "warn",
        category: "cron",
        event_type: "vercel_charge_missing_period",
        message: "FOCUS record without usable ChargePeriodStart — skipped",
        metadata: { record: rec },
        source: "lib/billing-collectors/vercel",
      })
      continue
    }

    // A spec trava BillingCurrency no enum ["USD"]; ainda assim, defensivamente
    // não misturamos moeda estrangeira numa soma em USD (Article IV / NFR-7).
    if (rec.BillingCurrency && rec.BillingCurrency !== "USD") {
      logEvent({
        level: "warn",
        category: "cron",
        event_type: "vercel_charge_non_usd",
        message: `Skipping non-USD charge (${rec.BillingCurrency})`,
        metadata: { record: rec },
        source: "lib/billing-collectors/vercel",
      })
      continue
    }

    const cost = Number(rec.BilledCost)
    if (!Number.isFinite(cost)) continue

    const day = start.slice(0, 10)
    const entry = byDay.get(day) ?? { total: 0, count: 0 }
    entry.total += cost
    entry.count += 1
    byDay.set(day, entry)
  }

  const rows: CostSnapshotRow[] = []
  for (const [day, entry] of byDay) {
    rows.push({
      snapshot_date: day,
      metric: "cost_usd",
      value: entry.total,
      currency: "USD",
      collection_status: "ok",
      raw_response: { charge_count: entry.count, billed_cost_total: entry.total },
    })
  }
  return rows
}

/** Coletor Vercel — implementa o contrato `BillingCollector` (slug 'vercel'). */
export const vercelCollector: BillingCollector = {
  serviceSlug: "vercel",

  async collect(window: CollectWindow): Promise<CostSnapshotRow[]> {
    const { token, teamId } = requireCredentials()

    // Rede de segurança: a rota já valida antes (AC5), mas o coletor também
    // recusa janela > 1 ano ANTES de tocar a API Vercel.
    assertVercelWindow(window)

    const params = new URLSearchParams({
      teamId,
      // `from` INCLUSIVO; `to` é EXCLUSIVO na API — para a janela civil [from, to]
      // inclusiva, o `to` do request = (window.to + 1 dia) às 00:00Z.
      from: `${window.from}T00:00:00Z`,
      to: `${addDaysUtc(window.to, 1)}T00:00:00Z`,
    })

    const res = await fetch(`${VERCEL_BILLING_URL}?${params.toString()}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(
        `Vercel Billing API ${res.status} on /v1/billing/charges: ${body.slice(0, 300)}`
      )
    }

    // AC2: JSONL — NUNCA res.json() no corpo inteiro.
    const text = await res.text()
    const records = parseJsonl(text)
    return aggregateDailyCost(records)
  },
}
