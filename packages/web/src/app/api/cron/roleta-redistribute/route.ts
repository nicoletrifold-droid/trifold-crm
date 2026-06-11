import { NextRequest, NextResponse } from "next/server"
import { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@web/lib/supabase/admin"
import { distributeLeadToNextBroker } from "@web/lib/roleta/distributor"

export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET

// Limite de segurança por org para evitar timeout (Vercel: 60s).
// ~500ms por lead → 50 leads ≈ 25s, margem segura. (Story 46-3, AC6)
const MAX_LEADS_PER_ORG = 50

/**
 * Resolve o stage default DAQUELA org.
 *
 * Reutiliza EXATAMENTE a estratégia de `getDefaultStageId` em
 * `meta-ads/route.ts` (onde os leads do Meta realmente entram), porém com
 * `.maybeSingle()` em vez de `.single()`: em contexto multi-org `.single()`
 * lança em 0 rows, e `is_default` NÃO é único globalmente (é por-org, sem
 * unique constraint). Padrão do projeto: `.maybeSingle()` retorna null em vez
 * de lançar (Story 21.1). (Story 46-3, AC2/AC3)
 */
async function resolveDefaultStageId(
  supabase: SupabaseClient,
  orgId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("kanban_stages")
    .select("id")
    .eq("org_id", orgId)
    .eq("is_default", true)
    .maybeSingle()

  if (data?.id) return data.id

  // Fallback: primeiro estágio por posição (mesmo fallback do meta webhook).
  const { data: firstStage } = await supabase
    .from("kanban_stages")
    .select("id")
    .eq("org_id", orgId)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle()

  return firstStage?.id ?? null
}

/**
 * GET /api/cron/roleta-redistribute
 *
 * Cron de abertura do expediente (08h SP = 11h UTC, ver vercel.json). Redistribui
 * leads represados: `is_active = true`, `assigned_broker_id IS NULL`, no stage
 * default da org. Como roda dentro da janela 08–20h, a verificação de horário
 * interna do `distributor.ts` passa. Toda a lógica de round-robin, limites,
 * notificação e log é herdada de `distributeLeadToNextBroker` (REUSE). (Story 46-3)
 */
export async function GET(request: NextRequest) {
  // Auth via CRON_SECRET — fail-closed (mesmo padrão do followup cron).
  const authHeader = request.headers.get("authorization")
  if (!CRON_SECRET) {
    console.error("[roleta-redistribute] CRON_SECRET not configured — endpoint blocked")
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 })
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Multi-org: derivar as orgs com roleta_config ativa. Robusto p/ multi-org,
  // ainda que a instância atual tenha uma única org.
  const { data: configs, error: configError } = await supabase
    .from("roleta_config")
    .select("org_id")
    .eq("is_active", true)

  if (configError) {
    console.error("[roleta-redistribute] failed to load roleta_config:", configError.message)
    return NextResponse.json({ error: configError.message }, { status: 500 })
  }

  const orgIds = Array.from(
    new Set((configs ?? []).map((c) => c.org_id as string).filter(Boolean))
  )

  let processed = 0
  let distributed = 0
  let failed = 0
  let limited = false

  for (const orgId of orgIds) {
    const stageId = await resolveDefaultStageId(supabase, orgId)
    if (!stageId) {
      console.error("[roleta-redistribute] no default stage for org", orgId)
      continue
    }

    // Leads elegíveis: ativos, sem corretor, no stage default da org.
    // O filtro por stage default exclui automaticamente stages
    // históricos/campanha ("Corretores Antigos", "Ação Muffato"). (AC3)
    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select("id, org_id")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .is("assigned_broker_id", null)
      .eq("stage_id", stageId)
      .limit(MAX_LEADS_PER_ORG)

    if (leadsError) {
      console.error("[roleta-redistribute] failed to query leads for org", orgId, leadsError.message)
      continue
    }

    if (!leads || leads.length === 0) continue

    // Se atingimos exatamente o limite, pode haver mais leads aguardando. (AC6)
    if (leads.length === MAX_LEADS_PER_ORG) limited = true

    for (const lead of leads) {
      processed++
      try {
        const result = await distributeLeadToNextBroker(
          lead.id as string,
          lead.org_id as string
        )
        if (result.status === "distributed") distributed++
      } catch (err) {
        console.error("[roleta-redistribute] lead", lead.id, "error:", err)
        failed++
      }
    }
  }

  return NextResponse.json({ processed, distributed, failed, limited })
}
