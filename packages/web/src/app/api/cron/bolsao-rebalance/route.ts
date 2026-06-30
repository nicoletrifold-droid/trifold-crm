import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import {
  businessMinutesBetweenSchedule,
  isOpenAtNow,
  getOrgSchedule,
} from "@web/lib/roleta/business-time"

// Story 75-80 (Epic 64) — Bolsão de Leads: rebalanceamento.
// Lead distribuído e NÃO atendido por >= BOLSAO_REBALANCE_MIN minutos de horário
// comercial (contados da última distribuição) sai da base do corretor e vai pro
// bolsão (assigned_broker_id = null, bolsao_em = now()). De lá, qualquer corretor
// pode puxá-lo (Story 75-81). Idempotente, gated por roleta_config.bolsao_enabled.
// Dry-run: GET ?dry=1 (calcula e relata o que faria, sem mover nada).
//
// Naturalmente idempotente: ao mover, assigned_broker_id vira null → o lead deixa
// de casar com o filtro de candidatos (.not assigned_broker_id is null).
//
// ⚠️ A escalada de 60min do SLA (lead nunca atendido) precisa passar a considerar
// leads no bolsão (sem dono) — isso é tratado na Story 75-82. Por isso este cron
// nasce gated (bolsao_enabled default false): só ligar após a 75-82.

const BOLSAO_REBALANCE_MIN = 15
const RECENT_HOURS = 48 // só leads distribuídos recentemente (evita varrer histórico)

type CfgRow = {
  org_id: string
  bolsao_enabled: boolean
}

type LeadRow = {
  id: string
  name: string | null
  assigned_broker_id: string
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get("authorization")
  if (!cronSecret) return NextResponse.json({ error: "Cron not configured" }, { status: 503 })
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const dryRun = new URL(request.url).searchParams.get("dry") === "1"
  const admin = createAdminClient()
  const now = new Date()

  const { data: configs } = await admin.from("roleta_config").select("org_id, bolsao_enabled")
  const summary: Array<Record<string, unknown>> = []

  for (const cfg of (configs ?? []) as CfgRow[]) {
    const orgId = cfg.org_id
    if (!cfg.bolsao_enabled && !dryRun) {
      summary.push({ orgId, skipped: "bolsao_enabled=false" })
      continue
    }

    // Horário pela agenda por dia (mesma fonte do SLA/distribuição). Relógio pausa fora do expediente.
    const { week: schedule, timezone: scheduleTz } = await getOrgSchedule(orgId, admin)
    const withinHours = isOpenAtNow(now, schedule, scheduleTz)
    if (!withinHours && !dryRun) {
      summary.push({ orgId, skipped: "fora do horario comercial" })
      continue
    }

    const { data: novoStage } = await admin
      .from("kanban_stages")
      .select("id")
      .eq("org_id", orgId)
      .eq("slug", "novo")
      .maybeSingle()
    const novoId = (novoStage?.id as string | undefined) ?? null
    if (!novoId) {
      summary.push({ orgId, skipped: "sem stage 'novo'" })
      continue
    }

    // Candidatos: em "Aguardando atendimento", não atendidos, COM dono, fora do bolsão, recentes.
    const recentIso = new Date(now.getTime() - RECENT_HOURS * 3600 * 1000).toISOString()
    const { data: leads } = await admin
      .from("leads")
      .select("id, name, assigned_broker_id")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .eq("stage_id", novoId)
      .is("primeiro_atendimento_em", null)
      .is("bolsao_em", null)
      .not("assigned_broker_id", "is", null)
      .gte("created_at", recentIso)
      .limit(500)
    const leadRows = (leads ?? []) as LeadRow[]
    if (leadRows.length === 0) {
      summary.push({ orgId, candidatos: 0 })
      continue
    }

    // Última distribuição por lead (mesma lógica do SLA).
    const { data: distLog } = await admin
      .from("lead_distribution_log")
      .select("lead_id, created_at")
      .eq("org_id", orgId)
      .eq("status", "distributed")
      .in("lead_id", leadRows.map((l) => l.id))
    const distByLead = new Map<string, number[]>()
    for (const d of (distLog ?? []) as Array<{ lead_id: string; created_at: string }>) {
      const arr = distByLead.get(d.lead_id) ?? []
      arr.push(new Date(d.created_at).getTime())
      distByLead.set(d.lead_id, arr)
    }

    const toMove: Array<{ id: string; broker: string; elapsed: number; name: string | null }> = []
    for (const lead of leadRows) {
      const dists = (distByLead.get(lead.id) ?? []).filter((t) => t <= now.getTime())
      if (dists.length === 0) continue
      const distribuido = new Date(Math.max(...dists))
      const elapsed = businessMinutesBetweenSchedule(distribuido, now, schedule, scheduleTz)
      if (elapsed >= BOLSAO_REBALANCE_MIN) {
        toMove.push({ id: lead.id, broker: lead.assigned_broker_id, elapsed, name: lead.name })
      }
    }

    if (!dryRun && toMove.length > 0) {
      await admin
        .from("leads")
        .update({ assigned_broker_id: null, bolsao_em: now.toISOString() })
        .in("id", toMove.map((m) => m.id))

      await admin.from("activities").insert(
        toMove.map((m) => ({
          org_id: orgId,
          lead_id: m.id,
          type: "bolsao_in",
          description: `Lead foi para o bolsão (sem atendimento em ${m.elapsed} min)`,
          metadata: { from_broker_id: m.broker, elapsed_min: m.elapsed },
        }))
      )
    }

    summary.push({
      orgId,
      candidatos: leadRows.length,
      movidos: toMove.length,
      dryRun,
      withinHours,
      ...(dryRun ? { wouldMove: toMove.map((m) => ({ lead: m.id, elapsed: m.elapsed })) } : {}),
    })
  }

  return NextResponse.json({ ok: true, summary })
}
