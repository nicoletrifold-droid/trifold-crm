import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import {
  buildCapiUserData,
  buildVisitouEvent,
  sendCapiEvents,
  type CapiEvent,
} from "@trifold/shared"

const CRON_SECRET = process.env.CRON_SECRET

// Story 86-4 — drena a `meta_capi_outbox` (populada pelo trigger da Story 86-2)
// e envia o evento "Visitou" (Meta standard event `Schedule`) à Conversions API
// via o módulo de payload/hashing da Story 86-3.
//
// Padrão herdado de `meta-leads-retry/route.ts` (Story 75-214): cron autenticado
// por `CRON_SECRET`, busca em lote de pendentes, `MAX_ATTEMPTS`, resumo de retorno.
//
// Idempotência (AC7 + AC10):
//   - `event_id` determinístico gerado na outbox (86-2) → o Meta deduplica no lado
//     dele (janela de 48h) mesmo se reenviarmos após um falso negativo de rede.
//   - update de status é CONDICIONAL em `status = 'pending'` → duas execuções
//     concorrentes do cron não marcam a mesma linha como `sent` duas vezes.
const MAX_ATTEMPTS = 3 // mesmo valor de meta-leads-retry
const BATCH_SIZE = 50 // volume baixo (~22 leads/mês); lote nunca cheio na prática

interface OutboxRow {
  id: string
  lead_id: string
  event_id: string
  event_name: string
  attempts: number
  created_at: string
}

interface LeadRow {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  metadata: Record<string, unknown> | null
}

// A captura de fbc/fbp/client_ip/client_ua é a Story 86-6 (ainda não feita).
// Antes dela, `metadata.meta_ad` estará ausente — estado válido: o evento é
// enviado só com external_id/em/ph/fn/ln. `buildCapiUserData` aceita esses
// campos como opcionais.
function extractAttribution(metadata: Record<string, unknown> | null): {
  fbc?: string
  fbp?: string
  clientIp?: string
  clientUserAgent?: string
} {
  const metaAd = (metadata?.meta_ad ?? {}) as Record<string, unknown>
  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.length > 0 ? v : undefined
  return {
    fbc: str(metaAd.fbc),
    fbp: str(metaAd.fbp),
    clientIp: str(metaAd.client_ip),
    clientUserAgent: str(metaAd.client_ua),
  }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!CRON_SECRET) {
    console.error("[META-CAPI-DISPATCH] CRON_SECRET not configured")
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 })
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createAdminClient()

  // AC2 — busca em lote de pendentes, mais antigos primeiro.
  const { data: rows, error } = await supabase
    .from("meta_capi_outbox")
    .select("id, lead_id, event_id, event_name, attempts, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE)

  if (error) {
    console.error("[META-CAPI-DISPATCH] Failed to query meta_capi_outbox:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const outbox = (rows ?? []) as OutboxRow[]
  const summary = { scanned: outbox.length, sent: 0, failed: 0, skipped: 0 }

  if (outbox.length === 0) {
    return NextResponse.json({ ok: true, ...summary })
  }

  // AC3 — enriquecimento: buscar os dados dos leads correspondentes em um único
  // query (evita N round-trips). `metadata` pode estar null/sem meta_ad (86-6).
  const leadIds = [...new Set(outbox.map((r) => r.lead_id))]
  const { data: leadRows, error: leadsError } = await supabase
    .from("leads")
    .select("id, name, email, phone, metadata")
    .in("id", leadIds)

  if (leadsError) {
    console.error("[META-CAPI-DISPATCH] Failed to query leads:", leadsError.message)
    return NextResponse.json({ error: leadsError.message }, { status: 500 })
  }

  const leadById = new Map<string, LeadRow>(
    ((leadRows ?? []) as LeadRow[]).map((l) => [l.id, l]),
  )

  // AC4 — um único POST com todos os eventos do lote (a API do Meta aceita array
  // no campo `data`). Monta os eventos preservando o mapeamento evento→linha.
  const events: CapiEvent[] = []
  const rowsForEvents: OutboxRow[] = []

  for (const row of outbox) {
    const lead = leadById.get(row.lead_id)
    if (!lead) {
      // Lead sumiu (ON DELETE CASCADE deveria ter limpado a outbox, mas defensivo):
      // marca skipped e não tenta de novo.
      await supabase
        .from("meta_capi_outbox")
        .update({ status: "skipped", last_error: "lead not found" })
        .eq("id", row.id)
        .eq("status", "pending")
      summary.skipped++
      continue
    }

    const attribution = extractAttribution(lead.metadata)
    const userData = buildCapiUserData({
      leadId: lead.id,
      name: lead.name ?? undefined,
      email: lead.email ?? undefined,
      phone: lead.phone ?? undefined,
      ...attribution,
    })

    events.push(
      buildVisitouEvent({
        eventId: row.event_id,
        eventTime: Math.floor(new Date(row.created_at).getTime() / 1000),
        userData,
      }),
    )
    rowsForEvents.push(row)
  }

  if (events.length === 0) {
    return NextResponse.json({ ok: true, ...summary })
  }

  // AC4 — envio. `sendCapiEvents` retorna { success:false, error } se o token
  // (META_CAPI_ACCESS_TOKEN / DATASET_ID, provisionados na 86-1) estiver ausente
  // — tratamos como falha normal (retry limitado), sem lançar exceção.
  const testEventCode = process.env.META_CAPI_TEST_EVENT_CODE
  const result = await sendCapiEvents(
    events,
    testEventCode ? { testEventCode } : undefined,
  )

  const receivedOk =
    result.success && (result.eventsReceived ?? events.length) === events.length

  if (receivedOk) {
    // AC5 — sucesso: marca todas as linhas do lote como sent.
    // AC10 — update condicional em status='pending' evita double-dispatch.
    for (const row of rowsForEvents) {
      await supabase
        .from("meta_capi_outbox")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("status", "pending")
      summary.sent++
    }
  } else {
    // AC6 — falha: incrementa attempts + last_error; ao esgotar → failed.
    const errorMsg = result.success
      ? `events_received mismatch: expected ${events.length}, got ${result.eventsReceived ?? 0}`
      : result.error ?? "unknown CAPI error"
    console.error("[META-CAPI-DISPATCH] send failed:", errorMsg)

    for (const row of rowsForEvents) {
      const nextAttempts = row.attempts + 1
      const nextStatus = nextAttempts >= MAX_ATTEMPTS ? "failed" : "pending"
      await supabase
        .from("meta_capi_outbox")
        .update({
          attempts: nextAttempts,
          last_error: errorMsg,
          status: nextStatus,
        })
        .eq("id", row.id)
        .eq("status", "pending")
      summary.failed++
    }
  }

  // AC9 — observabilidade.
  if (summary.sent > 0 || summary.failed > 0 || summary.skipped > 0) {
    console.log("[META-CAPI-DISPATCH]", JSON.stringify(summary))
  }

  return NextResponse.json({ ok: true, ...summary })
}
