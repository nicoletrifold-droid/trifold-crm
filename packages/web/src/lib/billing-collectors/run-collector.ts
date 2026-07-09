// Story 78-3 — Runner genérico de coletor de billing (Epic 78).
//
// Isola do coletor as três responsabilidades idênticas para qualquer
// fornecedor: (1) resolver `service_id` pelo slug, (2) upsert idempotente em
// `service_cost_snapshots` (onConflict service_id,snapshot_date,metric) e
// (3) isolamento de falha (NFR-3) — nunca propaga exceção para o cron, grava
// uma linha degradada `collection_status='error'` e loga o evento.
//
// Reusado (não recriado) pelas Stories 78-4/78-5/78-6/78-7/78-10.

import type { SupabaseClient } from "@supabase/supabase-js"
import { logEvent } from "@web/lib/logger"
import type {
  BillingCollector,
  CollectWindow,
  CollectorResult,
} from "@web/lib/billing-collectors/types"

/**
 * Executa um coletor e persiste o resultado de forma idempotente e à prova de
 * falha. Nunca lança — sempre devolve um `CollectorResult` (a rota de cron
 * decide o status HTTP a partir dele, mas nunca deve virar 500 por falha
 * isolada de coletor).
 */
export async function runCollector(
  admin: SupabaseClient,
  collector: BillingCollector,
  window: CollectWindow
): Promise<CollectorResult> {
  // (1) Resolve service_id pelo slug. .maybeSingle() nunca lança em 0 rows
  // (regra do projeto: .single() lança exceção quando não há linha).
  const { data: service, error: serviceError } = await admin
    .from("platform_services")
    .select("id")
    .eq("slug", collector.serviceSlug)
    .maybeSingle()

  if (serviceError || !service) {
    const message = serviceError?.message ?? "service not found in catalog"
    logEvent({
      level: "error",
      category: "cron",
      event_type: "billing_collector_service_missing",
      message,
      metadata: { service: collector.serviceSlug },
      source: "lib/billing-collectors/run-collector",
    })
    return {
      service_slug: collector.serviceSlug,
      window,
      rows_upserted: 0,
      status: "error",
      error: message,
    }
  }

  const serviceId = service.id as string
  const collectedAt = new Date().toISOString()

  try {
    // (2) Coleta + upsert idempotente do payload completo.
    const rows = await collector.collect(window)
    const payload = rows.map((r) => ({
      service_id: serviceId,
      snapshot_date: r.snapshot_date,
      metric: r.metric,
      value: r.value,
      currency: r.currency,
      // Campo correto no PAYLOAD (upsert sobrescreve a linha inteira). Jamais
      // usar `EXCLUDED.collected_at` para collection_status — typo documentado
      // no Dev Notes da Story 78-1.
      collection_status: r.collection_status,
      collected_at: collectedAt,
      raw_response: r.raw_response ?? null,
    }))

    if (payload.length > 0) {
      const { error } = await admin
        .from("service_cost_snapshots")
        .upsert(payload, { onConflict: "service_id,snapshot_date,metric" })
      if (error) throw error
    }

    return {
      service_slug: collector.serviceSlug,
      window,
      rows_upserted: payload.length,
      status: "ok",
    }
  } catch (err) {
    // (3) Isolamento de falha — nunca propaga. Grava linha degradada + loga.
    const message = err instanceof Error ? err.message : String(err)
    logEvent({
      level: "error",
      category: "cron",
      event_type: "billing_collector_failed",
      message,
      metadata: { service: collector.serviceSlug, window },
      source: "lib/billing-collectors/run-collector",
    })

    try {
      await admin.from("service_cost_snapshots").upsert(
        [
          {
            service_id: serviceId,
            snapshot_date: window.to,
            metric: "collection_error",
            value: 0,
            currency: null,
            collection_status: "error",
            collected_at: collectedAt,
            raw_response: { error: message },
          },
        ],
        { onConflict: "service_id,snapshot_date,metric" }
      )
    } catch (persistErr) {
      // Falha ao gravar a própria linha de erro não deve derrubar o cron.
      logEvent({
        level: "error",
        category: "cron",
        event_type: "billing_collector_error_persist_failed",
        message: persistErr instanceof Error ? persistErr.message : String(persistErr),
        metadata: { service: collector.serviceSlug, window },
        source: "lib/billing-collectors/run-collector",
      })
    }

    return {
      service_slug: collector.serviceSlug,
      window,
      rows_upserted: 0,
      status: "error",
      error: message,
    }
  }
}
