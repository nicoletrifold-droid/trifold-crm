// Story 78-7 — Coletor de USO TÉCNICO Resend (Epic 78, camada FRACA).
// Adapta o contrato `BillingCollector` da Story 78-3 (types.ts) e REUSA o runner
// genérico (run-collector.ts) sem modificá-los. IDS: ADAPT (não recria contrato).
//
// INVARIANTE CENTRAL (AC4): este coletor grava USO TÉCNICO, nunca CUSTO em $.
// TODA linha produzida aqui tem `currency: null` — garantindo que a query de
// "gasto do mês" da Story 78-9 (`WHERE currency IS NOT NULL`) NUNCA inclua estas
// linhas. Resend não tem endpoint de fatura (CON-3) — valor/vencimento é 100%
// manual (Story 78-8). NÃO inventar custo aqui.
//
// Duas sub-chamadas (isoladas — AC6):
//   1. QUOTA (limite do plano, NÃO consumo): chamada autenticada de baixo custo
//      a GET https://api.resend.com/domains lendo o header de resposta
//      `x-resend-monthly-quota`. Métrica: `resend_monthly_quota_limit`.
//      Auth: Authorization: Bearer ${RESEND_API_KEY} (env var JÁ existente).
//   2. CONTAGEM DE ENVIOS (parcial — ver limitação abaixo): COUNT direto em
//      `email_logs` (status != 'failed' AND sent_at na janela). Métrica:
//      `resend_emails_sent_count_email_logs`.
//
// LIMITAÇÃO CONHECIDA E ACEITA (AC10 / Article IV) — contagem de envios PARCIAL:
//   `email_logs` é populada por `sendTemplateEmail()` (fluxo de template) e
//   atualizada pelo webhook /api/webhook/resend. O caminho LEGADO de campanhas
//   (`sendEmail()` chamado direto, sem passar por `sendTemplateEmail()`) NÃO grava
//   linha em `email_logs` — ele é rastreado via `campaign_entries`/`campaign_events`.
//   Portanto `resend_emails_sent_count_email_logs` SUBCONTA o uso real do Resend
//   quando campanhas legadas estiverem ativas no período. O nome da métrica
//   (`..._email_logs`, não `..._total`) comunica esse escopo parcial no próprio
//   dado — não reivindicamos uma contagem completa que a fonte atual não sustenta.
//
// NOTA (T1.5, incerteza documentada): o header `x-resend-monthly-quota` só aparece
// em respostas autenticadas com sucesso; não foi possível confirmá-lo empiricamente
// sem uma RESEND_API_KEY válida (resposta 400 não-autenticada não expõe headers de
// quota). Por isso o parsing é DEFENSIVO: se o header estiver ausente, a linha de
// quota é PULADA (não inventada) e um warn é logado — a contagem via email_logs
// segue independente. Ver Completion Notes.

import type { SupabaseClient } from "@supabase/supabase-js"
import { logEvent } from "@web/lib/logger"
import type {
  BillingCollector,
  CollectWindow,
  CostSnapshotRow,
} from "@web/lib/billing-collectors/types"

const RESEND_API_BASE = "https://api.resend.com"
const RESEND_QUOTA_ENDPOINT = "/domains" // endpoint leve, autenticado, read-only
const RESEND_QUOTA_HEADER = "x-resend-monthly-quota"
const REQUEST_TIMEOUT_MS = 15_000

/**
 * Erro tipado para ausência da RESEND_API_KEY. A rota de cron trata este caso
 * ANTES de chamar o coletor via `runCollector` na parte de quota (AC5). Aqui
 * serve como rede de segurança caso o coletor seja usado fora da rota.
 */
export class MissingResendApiKeyError extends Error {
  constructor() {
    super("RESEND_API_KEY not set")
    this.name = "MissingResendApiKeyError"
  }
}

/** Soma n dias a uma data civil `YYYY-MM-DD` (aritmética em UTC). */
function addDaysUtc(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Sub-chamada de QUOTA (AC3a). Faz uma chamada autenticada de baixo custo ao
 * Resend e lê o header `x-resend-monthly-quota`. Se a RESEND_API_KEY não estiver
 * setada, a linha é pulada (a rota já degrada com 503 na parte de quota — AC5).
 * Se o header estiver ausente/não-numérico, a linha é pulada com warn (T1.5).
 */
async function collectQuota(window: CollectWindow): Promise<CostSnapshotRow[]> {
  const apiKey = (process.env.RESEND_API_KEY ?? "").trim()
  if (!apiKey) {
    logEvent({
      level: "warn",
      category: "cron",
      event_type: "resend_usage_api_key_missing",
      message: "RESEND_API_KEY not set — skipping quota sub-call (email_logs count still collected)",
      metadata: { window },
      source: "lib/billing-collectors/resend-usage",
    })
    return []
  }

  const res = await fetch(`${RESEND_API_BASE}${RESEND_QUOTA_ENDPOINT}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Resend API ${res.status} on ${RESEND_QUOTA_ENDPOINT}: ${body.slice(0, 300)}`)
  }

  const rawHeader = res.headers.get(RESEND_QUOTA_HEADER)
  const quota = Number(rawHeader)
  if (rawHeader == null || !Number.isFinite(quota)) {
    logEvent({
      level: "warn",
      category: "cron",
      event_type: "resend_usage_quota_header_missing",
      message: `Header ${RESEND_QUOTA_HEADER} absent/non-numeric on ${RESEND_QUOTA_ENDPOINT} response — skipping quota row (not invented)`,
      metadata: { window, raw_header: rawHeader },
      source: "lib/billing-collectors/resend-usage",
    })
    return []
  }

  return [
    {
      snapshot_date: window.to,
      metric: "resend_monthly_quota_limit",
      value: quota,
      currency: null, // AC4 — limite de plano (uso técnico), nunca custo.
      collection_status: "ok",
      raw_response: { header: RESEND_QUOTA_HEADER, value: rawHeader },
    },
  ]
}

/**
 * Sub-chamada de CONTAGEM DE ENVIOS (AC3b). COUNT direto em `email_logs`:
 * `status != 'failed' AND sent_at` na janela `[from, to]` (inclusiva). A janela
 * é interpretada em America/Sao_Paulo (BRT = UTC-3), coerente com o "ontem" das
 * rotas de cron. Contagem PLATFORM-WIDE (sem filtro de org — é uso da plataforma).
 * Ver limitação de parcialidade no cabeçalho do arquivo.
 */
async function collectEmailLogsCount(
  admin: SupabaseClient,
  window: CollectWindow
): Promise<CostSnapshotRow[]> {
  // Janela civil [from, to] inclusiva em BRT: [from 00:00:00-03:00, (to+1) 00:00:00-03:00).
  const fromIso = `${window.from}T00:00:00-03:00`
  const toExclusiveIso = `${addDaysUtc(window.to, 1)}T00:00:00-03:00`

  const { count, error } = await admin
    .from("email_logs")
    .select("*", { count: "exact", head: true })
    .neq("status", "failed")
    .gte("sent_at", fromIso)
    .lt("sent_at", toExclusiveIso)

  if (error) {
    throw new Error(`email_logs count query failed: ${error.message}`)
  }

  return [
    {
      snapshot_date: window.to,
      metric: "resend_emails_sent_count_email_logs",
      value: count ?? 0,
      currency: null, // AC4 — contagem de uso, nunca custo.
      collection_status: "ok",
      raw_response: { source: "email_logs", from: fromIso, to_exclusive: toExclusiveIso },
    },
  ]
}

/**
 * Fábrica do coletor Resend. Precisa do admin client (para o COUNT em email_logs),
 * por isso é uma factory — diferente dos coletores anthropic/vercel, que só usam
 * fetch. O runCollector chama `collect(window)` normalmente.
 */
export function createResendUsageCollector(admin: SupabaseClient): BillingCollector {
  return {
    serviceSlug: "resend",

    async collect(window: CollectWindow): Promise<CostSnapshotRow[]> {
      // AC6: as 2 sub-chamadas isoladas — quota (Resend API) e contagem (email_logs)
      // são independentes; falha de uma não derruba a outra. Se AMBAS falharem,
      // propaga para o runCollector isolar (collection_status='error').
      const results = await Promise.allSettled([
        collectQuota(window),
        collectEmailLogsCount(admin, window),
      ])

      const rows: CostSnapshotRow[] = []
      let anySuccess = false
      let lastError: unknown = null

      for (const r of results) {
        if (r.status === "fulfilled") {
          anySuccess = true
          rows.push(...r.value)
        } else {
          lastError = r.reason
          logEvent({
            level: "warn",
            category: "cron",
            event_type: "resend_usage_subcall_failed",
            message: r.reason instanceof Error ? r.reason.message : String(r.reason),
            metadata: { window },
            source: "lib/billing-collectors/resend-usage",
          })
        }
      }

      if (!anySuccess) {
        throw lastError instanceof Error ? lastError : new Error(String(lastError))
      }

      return rows
    },
  }
}
