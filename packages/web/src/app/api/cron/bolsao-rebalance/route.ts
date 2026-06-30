import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import {
  businessMinutesBetweenSchedule,
  isOpenAtNow,
  getOrgSchedule,
} from "@web/lib/roleta/business-time"
import { sendPushToUser } from "@web/lib/server/push-service"
import { logWhatsappSend } from "@web/lib/whatsapp/log-send"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://crm.trifold.eng.br"

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
const BOLSAO_DIGEST_MIN = 15 // tempo parado no bolsão p/ entrar no resumo da Fernanda
const BOLSAO_DIGEST_WINDOW_S = 30 * 60 // anti-flood: no máx. 1 resumo a cada 30min por org
const RECENT_HOURS = 48 // só leads distribuídos recentemente (evita varrer histórico)

type CfgRow = {
  org_id: string
  bolsao_enabled: boolean
  notify_user_on_fora_horario: string | null
  notify_user_on_distribution: string | null
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

  const { data: configs } = await admin
    .from("roleta_config")
    .select("org_id, bolsao_enabled, notify_user_on_fora_horario, notify_user_on_distribution")
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

    // ── Resumo periódico do bolsão à Fernanda (Story 75-82) ──
    // Conta leads parados no pool há >= BOLSAO_DIGEST_MIN (horário comercial). Anti-flood:
    // claim por (org, 'bolsao_digest') com janela → no máx. 1 resumo a cada 30min por org.
    let digestCount = 0
    let digestSent = false
    const { data: pool } = await admin
      .from("leads")
      .select("bolsao_em")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .not("bolsao_em", "is", null)
      .limit(1000)
    digestCount = ((pool ?? []) as Array<{ bolsao_em: string }>).filter(
      (l) => businessMinutesBetweenSchedule(new Date(l.bolsao_em), now, schedule, scheduleTz) >= BOLSAO_DIGEST_MIN
    ).length

    if (digestCount > 0 && !dryRun) {
      const { data: claimed } = await admin.rpc("claim_obra_notif", {
        p_obra_id: orgId,
        p_evento: "bolsao_digest",
        p_window_seconds: BOLSAO_DIGEST_WINDOW_S,
      })
      if (claimed === true) {
        digestSent = await sendBolsaoDigest(admin, orgId, cfg, digestCount)
      }
    }

    summary.push({
      orgId,
      candidatos: leadRows.length,
      movidos: toMove.length,
      digestCount,
      digestSent,
      dryRun,
      withinHours,
      ...(dryRun ? { wouldMove: toMove.map((m) => ({ lead: m.id, elapsed: m.elapsed })) } : {}),
    })
  }

  return NextResponse.json({ ok: true, summary })
}

// Story 75-82 — resumo do bolsão à Fernanda (gestor configurado na roleta): WhatsApp
// template `aviso_bolsao_gestor` ({{1}}=nome, {{2}}=qtd; botão estático → /dashboard/bolsao)
// + push. Retorna true se ao menos o push ou o WhatsApp foi disparado.
async function sendBolsaoDigest(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  cfg: CfgRow,
  count: number
): Promise<boolean> {
  const gestorUserId = cfg.notify_user_on_fora_horario ?? cfg.notify_user_on_distribution
  if (!gestorUserId) return false

  const { data: gestor } = await admin
    .from("users")
    .select("name, phone")
    .eq("id", gestorUserId)
    .maybeSingle()
  const nome = (gestor?.name as string | undefined) ?? "gestor"
  const phone = (gestor?.phone as string | undefined) ?? null

  let any = false

  if (phone) {
    const { data: wc } = await admin
      .from("whatsapp_config")
      .select("phone_number_id, access_token")
      .eq("org_id", orgId)
      .maybeSingle()
    if (wc?.phone_number_id && wc?.access_token) {
      try {
        const res = await fetch(`https://graph.facebook.com/v21.0/${wc.phone_number_id}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${wc.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: phone,
            type: "template",
            template: {
              name: "aviso_bolsao_gestor",
              language: { code: "pt_BR" },
              components: [{ type: "body", parameters: [{ type: "text", text: nome }, { type: "text", text: String(count) }] }],
            },
          }),
        })
        if (res.ok) {
          const json = (await res.json().catch(() => null)) as { messages?: Array<{ id?: string }> } | null
          void logWhatsappSend(admin, { orgId, template: "aviso_bolsao_gestor", category: "utility", recipientType: "gestor", toPhone: phone, status: "sent", wamId: json?.messages?.[0]?.id ?? null })
          any = true
        } else {
          const err = await res.text()
          void logWhatsappSend(admin, { orgId, template: "aviso_bolsao_gestor", category: "utility", recipientType: "gestor", toPhone: phone, status: "failed", error: `${res.status} ${err.slice(0, 300)}` })
        }
      } catch (e) {
        console.error("[bolsao] digest wpp:", e)
      }
    }
  }

  try {
    await sendPushToUser(admin, gestorUserId, {
      title: "Leads parados no bolsão",
      body: `Há ${count} lead(s) aguardando atendimento no bolsão.`,
      url: `${APP_URL}/dashboard/bolsao`,
    })
    any = true
  } catch (e) {
    console.error("[bolsao] digest push:", e)
  }

  return any
}
