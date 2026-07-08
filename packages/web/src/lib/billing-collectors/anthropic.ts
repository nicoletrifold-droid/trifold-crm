// Story 78-3 — Coletor Anthropic (Epic 78). Primeira implementação concreta do
// contrato `BillingCollector`.
//
// IMPORTANTE — chave e client são DIFERENTES do chat:
//   - packages/ai/src/client/anthropic.ts usa ANTHROPIC_API_KEY (chave de chat,
//     SDK @anthropic-ai/sdk) — NÃO reusar aqui.
//   - este coletor usa ANTHROPIC_ADMIN_KEY (chave admin/organização,
//     sk-ant-admin01-…) via fetch() direto contra a Admin API.
//
// Contrato de API confirmado na documentação oficial da Anthropic Admin API
// (docs.claude.com/en/api/admin-api/usage-cost) — ver Completion Notes da story.

import { logEvent } from "@web/lib/logger"
import type {
  BillingCollector,
  CollectWindow,
  CostSnapshotRow,
} from "@web/lib/billing-collectors/types"

const ANTHROPIC_ADMIN_BASE = "https://api.anthropic.com/v1/organizations"
const ANTHROPIC_VERSION = "2023-06-01"
const REQUEST_TIMEOUT_MS = 20_000
const MAX_PAGES = 40 // guarda de segurança contra loop de paginação

/**
 * Erro tipado para ausência da ANTHROPIC_ADMIN_KEY. A rota de cron trata este
 * caso ANTES de chamar o runner (AC8: 503 sem gravar snapshot). Aqui serve como
 * rede de segurança para uso do coletor fora da rota.
 */
export class MissingAnthropicAdminKeyError extends Error {
  constructor() {
    super("ANTHROPIC_ADMIN_KEY not set")
    this.name = "MissingAnthropicAdminKeyError"
  }
}

/** Um bucket de tempo (diário) retornado pelos endpoints de report da Admin API. */
interface ReportBucket<TResult> {
  starting_at: string // RFC 3339, início (inclusive) do bucket
  ending_at: string // RFC 3339, fim (exclusive) do bucket
  results: TResult[]
}

interface ReportResponse<TResult> {
  data: ReportBucket<TResult>[]
  has_more: boolean
  next_page: string | null
}

interface CostResult {
  amount: string // decimal em MENORES unidades da moeda (centavos) — ex.: "123.45" USD = US$ 1,2345
  currency: string // atualmente sempre "USD"
}

interface UsageResult {
  uncached_input_tokens?: number
  cache_read_input_tokens?: number
  cache_creation?: {
    ephemeral_1h_input_tokens?: number
    ephemeral_5m_input_tokens?: number
  }
  output_tokens?: number
}

function requireAdminKey(): string {
  const key = (process.env.ANTHROPIC_ADMIN_KEY ?? "").trim()
  if (!key) throw new MissingAnthropicAdminKeyError()
  return key
}

/** Soma n dias a uma data civil `YYYY-MM-DD` (aritmética em UTC). */
function addDaysUtc(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Busca todas as páginas de um endpoint de report da Admin API, seguindo
 * `next_page`. Lança em qualquer resposta não-2xx (o runner isola a falha).
 */
async function fetchAllBuckets<TResult>(
  path: "cost_report" | "usage_report/messages",
  window: CollectWindow,
  key: string
): Promise<ReportBucket<TResult>[]> {
  const buckets: ReportBucket<TResult>[] = []
  let page: string | null = null

  for (let i = 0; i < MAX_PAGES; i++) {
    const params = new URLSearchParams({
      // `starting_at`/`ending_at` são RFC 3339; `ending_at` é EXCLUSIVO. Para a
      // janela civil [from, to] inclusiva, ending_at = (to + 1 dia) às 00:00Z.
      starting_at: `${window.from}T00:00:00Z`,
      ending_at: `${addDaysUtc(window.to, 1)}T00:00:00Z`,
      bucket_width: "1d",
    })
    if (page) params.set("page", page)

    const res = await fetch(`${ANTHROPIC_ADMIN_BASE}/${path}?${params.toString()}`, {
      method: "GET",
      headers: {
        "x-api-key": key,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(`Anthropic Admin API ${res.status} on ${path}: ${body.slice(0, 300)}`)
    }

    const json = (await res.json()) as ReportResponse<TResult>
    buckets.push(...(json.data ?? []))
    if (!json.has_more || !json.next_page) break
    page = json.next_page
  }

  return buckets
}

/** Data civil (`YYYY-MM-DD`) coberta por um bucket, a partir do seu `starting_at`. */
function bucketDate(bucket: ReportBucket<unknown>): string {
  return bucket.starting_at.slice(0, 10)
}

/**
 * Custo diário em USD (obrigatório). Soma todos os `amount` de cada bucket
 * (podem vir vários itens por dia) e converte de centavos para dólares (/100).
 */
async function collectCost(window: CollectWindow, key: string): Promise<CostSnapshotRow[]> {
  const buckets = await fetchAllBuckets<CostResult>("cost_report", window, key)
  const rows: CostSnapshotRow[] = []

  for (const bucket of buckets) {
    const totalCents = (bucket.results ?? []).reduce((sum, r) => {
      const cents = Number(r.amount)
      return sum + (Number.isFinite(cents) ? cents : 0)
    }, 0)

    rows.push({
      snapshot_date: bucketDate(bucket),
      metric: "cost_usd",
      // `amount` vem em menores unidades da moeda (centavos) — converter p/ USD.
      value: totalCents / 100,
      currency: "USD",
      collection_status: "ok",
      raw_response: bucket,
    })
  }

  return rows
}

/**
 * Tokens de entrada/saída (opcional/best-effort — AC9). Falha aqui NÃO derruba
 * o custo já obtido (isolada em try/catch no `collect`).
 */
async function collectTokens(window: CollectWindow, key: string): Promise<CostSnapshotRow[]> {
  const buckets = await fetchAllBuckets<UsageResult>("usage_report/messages", window, key)
  const rows: CostSnapshotRow[] = []

  for (const bucket of buckets) {
    let inputTokens = 0
    let outputTokens = 0
    for (const r of bucket.results ?? []) {
      inputTokens +=
        (r.uncached_input_tokens ?? 0) +
        (r.cache_read_input_tokens ?? 0) +
        (r.cache_creation?.ephemeral_1h_input_tokens ?? 0) +
        (r.cache_creation?.ephemeral_5m_input_tokens ?? 0)
      outputTokens += r.output_tokens ?? 0
    }

    const date = bucketDate(bucket)
    rows.push({
      snapshot_date: date,
      metric: "tokens_input",
      value: inputTokens,
      currency: null, // métrica técnica, sem moeda (78-1)
      collection_status: "ok",
      raw_response: bucket,
    })
    rows.push({
      snapshot_date: date,
      metric: "tokens_output",
      value: outputTokens,
      currency: null,
      collection_status: "ok",
      raw_response: bucket,
    })
  }

  return rows
}

/** Coletor Anthropic — implementa o contrato `BillingCollector` (slug 'anthropic'). */
export const anthropicCollector: BillingCollector = {
  serviceSlug: "anthropic",

  async collect(window: CollectWindow): Promise<CostSnapshotRow[]> {
    const key = requireAdminKey()

    // Custo (obrigatório) — se falhar, propaga para o runner isolar (AC3).
    const costRows = await collectCost(window, key)

    // Tokens (opcional) — best-effort, isolado; falha não afeta o custo (AC9/R6).
    let tokenRows: CostSnapshotRow[] = []
    try {
      tokenRows = await collectTokens(window, key)
    } catch (err) {
      logEvent({
        level: "warn",
        category: "cron",
        event_type: "billing_anthropic_tokens_failed",
        message: err instanceof Error ? err.message : String(err),
        metadata: { window },
        source: "lib/billing-collectors/anthropic",
      })
    }

    return [...costRows, ...tokenRows]
  },
}
