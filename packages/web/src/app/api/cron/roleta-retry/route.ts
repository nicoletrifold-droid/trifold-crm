import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { distributeLeadToNextBroker } from "@web/lib/roleta/distributor"
import { classifyLeadFirstMessage } from "@web/lib/roleta/classify-lead"

const MAX_PER_RUN = 50
const RETRY_WINDOW_DAYS = 30

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get("authorization")
  if (!cronSecret) {
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 })
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient()

  const thirtyDaysAgo = new Date(
    Date.now() - RETRY_WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString()

  // Busca leads ativos sem corretor dos últimos 30 dias
  const { data: leads, error } = await admin
    .from("leads")
    .select("id, org_id, name")
    .eq("is_active", true)
    .is("assigned_broker_id", null)
    .gte("created_at", thirtyDaysAgo)
    .order("created_at", { ascending: true })
    .limit(MAX_PER_RUN)

  if (error) {
    console.error("[roleta-retry] fetch error:", error)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }

  const results = { distributed: 0, fora_horario: 0, sem_corretor: 0, skipped: 0, nao_lead: 0, outros: 0 }

  for (const lead of leads ?? []) {
    // Guard de idempotência: re-verifica no banco antes de distribuir.
    // Protege contra execuções concorrentes do cron (duas instâncias Vercel
    // podem buscar o mesmo batch e processar o mesmo lead em paralelo).
    const { data: current } = await admin
      .from("leads")
      .select("assigned_broker_id")
      .eq("id", lead.id)
      .maybeSingle()

    if (!current || current.assigned_broker_id !== null) {
      results.skipped++
      continue
    }

    // Triagem não-lead (Story 67-1): o cron é um caminho de distribuição
    // automática e DEVE aplicar a mesma classificação do webhook. Não-lead
    // (candidato a emprego, parceria, fornecedor, mídia) é arquivado
    // (is_active=false) e NÃO distribuído — sai do batch e não retorna.
    const classification = await classifyLeadFirstMessage(admin, lead.id)
    if (!classification.isLead) {
      await admin.from("leads").update({ is_active: false }).eq("id", lead.id)
      console.log(
        `[roleta-retry] não-lead arquivado (${classification.category}): ${lead.id} — ${classification.reason}`
      )
      results.nao_lead++
      continue
    }

    const result = await distributeLeadToNextBroker(lead.id, lead.org_id)
    if (result.status === "distributed") results.distributed++
    else if (result.status === "fora_horario") results.fora_horario++
    else if (result.status === "sem_corretor_disponivel") results.sem_corretor++
    else results.outros++
  }

  console.log(`[roleta-retry] processed ${leads?.length ?? 0} leads:`, results)
  return NextResponse.json({ processed: leads?.length ?? 0, ...results })
}
