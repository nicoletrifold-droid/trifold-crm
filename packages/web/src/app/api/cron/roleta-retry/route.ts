import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { distributeLeadToNextBroker } from "@web/lib/roleta/distributor"
import { loadLeadInboundForClassification } from "@web/lib/roleta/classify-lead"
import { detectPropertyInterestId } from "@web/lib/roleta/detect-property"
import { classifyContactIntent, createAnthropicClient } from "@trifold/ai"
import { routeLeadIdToRelationship } from "@web/lib/relacionamento/route-inbound"

const MAX_PER_RUN = 50
const RETRY_WINDOW_DAYS = 30
// A conversa precisa estar parada há pelo menos isto para decidir (Story 71-1).
const IDLE_MINUTES = 5

/**
 * Motor único de distribuição (Story 71-1). A distribuição NÃO acontece mais
 * na primeira mensagem do WhatsApp. Este cron roda com frequência e, para cada
 * lead ativo sem corretor:
 *  - se a conversa ainda está "quente" (última mensagem do lead há < 5 min) → espera.
 *  - quando esfria (≥ 5 min sem nova mensagem), classifica o DIÁLOGO INTEIRO:
 *      lead real → distribui pela roleta; não-lead → arquiva (is_active=false).
 *  - lead sem nenhuma mensagem inbound → distribui (default seguro; ex.: importados).
 */
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
  const idleCutoffMs = IDLE_MINUTES * 60 * 1000

  // Leads ativos sem corretor dos últimos 30 dias.
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

  const results = {
    distributed: 0,
    fora_horario: 0,
    sem_corretor: 0,
    skipped: 0,
    aguardando: 0,
    nao_lead: 0,
    relacionamento: 0,
    outros: 0,
  }

  for (const lead of leads ?? []) {
    // Guard de idempotência: re-verifica antes de distribuir (execuções concorrentes).
    const { data: current } = await admin
      .from("leads")
      .select("assigned_broker_id")
      .eq("id", lead.id)
      .maybeSingle()

    if (!current || current.assigned_broker_id !== null) {
      results.skipped++
      continue
    }

    // Carrega o diálogo inteiro do lead.
    const convo = await loadLeadInboundForClassification(admin, lead.id)

    // Conversa ainda quente? última mensagem do lead há < IDLE_MINUTES → espera.
    if (convo.lastInboundAt) {
      const idleMs = Date.now() - new Date(convo.lastInboundAt).getTime()
      if (idleMs < idleCutoffMs) {
        results.aguardando++
        continue
      }
    }

    // Conversa esfriou (ou não há mensagem) → classifica o diálogo inteiro.
    // Sem texto inbound → default seguro: trata como lead e distribui.
    if (convo.text) {
      const classification = await classifyContactIntent(
        createAnthropicClient(),
        convo.text,
        { hasDocument: convo.hasDocument }
      )
      // Story 76-3 — diálogo indica CLIENTE EXISTENTE → relacionamento (Samara), não roleta.
      if (classification.category === "cliente_existente") {
        const routed = await routeLeadIdToRelationship(admin, lead.id, lead.org_id)
        console.log(
          `[roleta-retry] cliente existente → relacionamento (${routed ? "ok" : "skip"}): ${lead.id} — ${classification.reason}`
        )
        if (routed) {
          results.relacionamento++
          continue
        }
      }
      if (!classification.isLead) {
        await admin.from("leads").update({ is_active: false }).eq("id", lead.id)
        console.log(
          `[roleta-retry] não-lead arquivado (${classification.category}): ${lead.id} — ${classification.reason}`
        )
        results.nao_lead++
        continue
      }
    }

    // Story 75-44: detectar empreendimento mencionado no diálogo e gravar
    // property_interest_id (só se ainda não definido) ANTES de distribuir → a
    // roleta passa a filtrar pelos corretores habilitados. Não identificado → null.
    if (convo.text) {
      const detectedPropertyId = await detectPropertyInterestId(admin, lead.org_id, convo.text)
      if (detectedPropertyId) {
        await admin
          .from("leads")
          .update({ property_interest_id: detectedPropertyId })
          .eq("id", lead.id)
          .is("property_interest_id", null)
      }
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
