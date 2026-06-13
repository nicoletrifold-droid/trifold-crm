import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { distributeLeadToNextBroker } from "@web/lib/roleta/distributor"

const CRON_SECRET = process.env.CRON_SECRET
const MAX_PER_RUN = 50
// Stage fixo "Aguardando atendimento" (slug: novo)
const NOVO_STAGE_ID = "00000000-0000-0000-0001-000000000001"

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!CRON_SECRET) {
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 })
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient()

  // Busca leads sem corretor na fase inicial, de todos os orgs ativos
  const { data: leads, error } = await admin
    .from("leads")
    .select("id, org_id, name")
    .eq("is_active", true)
    .eq("stage_id", NOVO_STAGE_ID)
    .is("assigned_broker_id", null)
    .order("created_at", { ascending: true })
    .limit(MAX_PER_RUN)

  if (error) {
    console.error("[roleta-retry] fetch error:", error)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }

  const results = { distributed: 0, fora_horario: 0, sem_corretor: 0, outros: 0 }

  for (const lead of leads ?? []) {
    const result = await distributeLeadToNextBroker(lead.id, lead.org_id)
    if (result.status === "distributed") results.distributed++
    else if (result.status === "fora_horario") results.fora_horario++
    else if (result.status === "sem_corretor_disponivel") results.sem_corretor++
    else results.outros++
  }

  console.log(`[roleta-retry] processed ${leads?.length ?? 0} leads:`, results)
  return NextResponse.json({ processed: leads?.length ?? 0, ...results })
}
