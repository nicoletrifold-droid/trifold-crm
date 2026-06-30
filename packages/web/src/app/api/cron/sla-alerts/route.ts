import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { logWhatsappSend } from "@web/lib/whatsapp/log-send"
import {
  businessMinutesBetweenSchedule,
  isOpenAtNow,
  getOrgSchedule,
} from "@web/lib/roleta/business-time"
import { sendPushToUser } from "@web/lib/server/push-service"
import { formatDuration } from "@web/lib/reports/daily-leads-report"

// Story 75-50 — escalonamento pro gestor por WhatsApp (template alerta_sla_gestor),
// enviado a cada telefone de SLA_ESCALATION_PHONES (Fernanda + Alexandre).
async function sendGestorSlaWhatsApp(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  config: { phone_number_id: string; access_token: string },
  phones: string[],
  vars: { leadName: string; brokerName: string; tempo: string }
): Promise<void> {
  const url = `https://graph.facebook.com/v21.0/${config.phone_number_id}/messages`
  const params = [vars.leadName, vars.brokerName, vars.tempo]
  for (const to of phones) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: "alerta_sla_gestor",
            language: { code: "pt_BR" },
            components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }],
          },
        }),
      })
      if (!res.ok) {
        const err = await res.text()
        console.error("[sla] gestor wpp:", res.status, err)
        void logWhatsappSend(admin, { orgId, template: "alerta_sla_gestor", category: "utility", recipientType: "gestor", toPhone: to, status: "failed", error: `${res.status} ${err.slice(0, 300)}` })
      } else {
        const json = (await res.json().catch(() => null)) as { messages?: Array<{ id?: string }> } | null
        void logWhatsappSend(admin, { orgId, template: "alerta_sla_gestor", category: "utility", recipientType: "gestor", toPhone: to, status: "sent", wamId: json?.messages?.[0]?.id ?? null })
      }
    } catch (e) {
      console.error("[sla] gestor wpp:", e)
      void logWhatsappSend(admin, { orgId, template: "alerta_sla_gestor", category: "utility", recipientType: "gestor", toPhone: to, status: "failed", error: String(e).slice(0, 300) })
    }
  }
}

// Story 75-48 — alerta de SLA de atendimento. Roda a cada 10 min (vercel.json).
// Para cada lead ainda em "Aguardando atendimento": se passou X min de expediente
// desde a distribuição → alerta o corretor (push); se passou Y min → escala pro
// gestor. Tempo conta só dentro do horário da roleta (business-time). Idempotente
// via sla_alerta_corretor_em / sla_alerta_gestor_em. Kill-switch sla_alertas_enabled.
// Dry-run: GET ?dry=1 (calcula e relata, NÃO envia/marca) — para validar antes de ligar.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://crm.trifold.eng.br"
const RECENT_HOURS = 48 // evita rajada: só leads distribuídos recentemente

type CfgRow = {
  org_id: string
  sla_alertas_enabled: boolean
  bolsao_enabled: boolean
  sla_alerta_corretor_min: number | null
  sla_alerta_gestor_min: number | null
  notify_user_on_fora_horario: string | null
  notify_user_on_distribution: string | null
  business_days: number[] | null
  business_hour_start: string | null
  business_hour_end: string | null
  weekend_hour_start: string | null
  weekend_hour_end: string | null
  timezone: string | null
}

type LeadRow = {
  id: string
  name: string | null
  phone: string | null
  assigned_broker_id: string | null
  bolsao_em: string | null
  sla_alerta_corretor_em: string | null
  sla_alerta_gestor_em: string | null
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get("authorization")
  if (!cronSecret) return NextResponse.json({ error: "Cron not configured" }, { status: 503 })
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const dryRun = new URL(request.url).searchParams.get("dry") === "1"
  const escalationPhones = (process.env.SLA_ESCALATION_PHONES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  const admin = createAdminClient()
  const now = new Date()

  const { data: configs } = await admin.from("roleta_config").select("*")
  const summary: Array<Record<string, unknown>> = []

  for (const cfg of (configs ?? []) as CfgRow[]) {
    const orgId = cfg.org_id
    if (!cfg.sla_alertas_enabled && !dryRun) {
      summary.push({ orgId, skipped: "sla_alertas_enabled=false" })
      continue
    }

    // Story 75-59: horário pela AGENDA por dia (mesma fonte da distribuição/contagem).
    const { week: schedule, timezone: scheduleTz } = await getOrgSchedule(orgId, admin)
    const withinHours = isOpenAtNow(now, schedule, scheduleTz)
    if (!withinHours && !dryRun) {
      summary.push({ orgId, skipped: "fora do horario comercial" })
      continue
    }

    const corretorMin = cfg.sla_alerta_corretor_min ?? 30
    const gestorMin = cfg.sla_alerta_gestor_min ?? 60
    const gestorUserId = cfg.notify_user_on_fora_horario ?? cfg.notify_user_on_distribution ?? null

    // Config do WhatsApp (uma vez por org) p/ o template de escalonamento ao gestor.
    let wppConfig: { phone_number_id: string; access_token: string } | null = null
    if (escalationPhones.length > 0) {
      const { data: wc } = await admin
        .from("whatsapp_config")
        .select("phone_number_id, access_token")
        .eq("org_id", orgId)
        .maybeSingle()
      if (wc?.phone_number_id && wc?.access_token) {
        wppConfig = { phone_number_id: wc.phone_number_id as string, access_token: wc.access_token as string }
      }
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

    const recentIso = new Date(now.getTime() - RECENT_HOURS * 3600 * 1000).toISOString()
    const { data: leads } = await admin
      .from("leads")
      .select("id, name, phone, assigned_broker_id, bolsao_em, sla_alerta_corretor_em, sla_alerta_gestor_em")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .eq("stage_id", novoId)
      .is("primeiro_atendimento_em", null)
      // Story 75-82: inclui leads no bolsão (sem dono) → a escalada de 60min (absoluta)
      // continua valendo pra lead que caiu no pool e segue sem atendimento.
      .or("assigned_broker_id.not.is.null,bolsao_em.not.is.null")
      .gte("created_at", recentIso)
      .limit(500)
    const leadRows = (leads ?? []) as LeadRow[]
    if (leadRows.length === 0) {
      summary.push({ orgId, candidatos: 0 })
      continue
    }

    const { data: distLog } = await admin
      .from("lead_distribution_log")
      .select("lead_id, created_at")
      .eq("org_id", orgId)
      .eq("status", "distributed")
      .in(
        "lead_id",
        leadRows.map((l) => l.id)
      )
    const distByLead = new Map<string, number[]>()
    for (const d of (distLog ?? []) as Array<{ lead_id: string; created_at: string }>) {
      const arr = distByLead.get(d.lead_id) ?? []
      arr.push(new Date(d.created_at).getTime())
      distByLead.set(d.lead_id, arr)
    }

    const brokerIds = [...new Set(leadRows.map((l) => l.assigned_broker_id).filter((x): x is string => !!x))]
    const { data: brokerUsers } = await admin.from("users").select("id, name").in("id", brokerIds)
    const brokerName = new Map<string, string>()
    for (const u of (brokerUsers ?? []) as Array<{ id: string; name: string }>) {
      brokerName.set(u.id, u.name)
    }

    let alertasCorretor = 0
    let escalonamentos = 0
    const wouldAlert: Array<Record<string, unknown>> = []
    const markCorretor: string[] = []
    const markGestor: string[] = []

    for (const lead of leadRows) {
      const dists = (distByLead.get(lead.id) ?? []).filter((t) => t <= now.getTime())
      if (dists.length === 0) continue
      // Corretor: relógio da ÚLTIMA distribuição (clock do dono atual). Gestor: relógio
      // da PRIMEIRA distribuição (60min ABSOLUTO desde a 1ª entrega — Story 75-82).
      const corretorElapsed = businessMinutesBetweenSchedule(new Date(Math.max(...dists)), now, schedule, scheduleTz)
      const gestorElapsed = businessMinutesBetweenSchedule(new Date(Math.min(...dists)), now, schedule, scheduleTz)

      // Alerta ao corretor: só p/ lead COM dono (lead no bolsão não tem corretor a avisar).
      if (lead.assigned_broker_id && corretorElapsed >= corretorMin && !lead.sla_alerta_corretor_em) {
        wouldAlert.push({ lead: lead.id, tipo: "corretor", elapsed: corretorElapsed })
        if (!dryRun) {
          await sendPushToUser(admin, lead.assigned_broker_id, {
            title: "⏱ Lead aguardando atendimento",
            body: `${lead.name ?? "Um lead"} está há ${corretorElapsed} min sem atendimento. Atenda agora.`,
            url: `${APP_URL}/broker/leads/${lead.id}`,
          }).catch((e: unknown) => console.error("[sla] push corretor:", e))
          markCorretor.push(lead.id)
          alertasCorretor++
        }
      }

      if (gestorElapsed >= gestorMin && !lead.sla_alerta_gestor_em) {
        wouldAlert.push({ lead: lead.id, tipo: "gestor", elapsed: gestorElapsed })
        if (!dryRun) {
          const tempo = formatDuration(gestorElapsed)
          const brokerNm = lead.assigned_broker_id ? (brokerName.get(lead.assigned_broker_id) ?? "corretor") : "bolsão"
          // WhatsApp (template) p/ os gestores em SLA_ESCALATION_PHONES.
          if (wppConfig) {
            await sendGestorSlaWhatsApp(admin, orgId, wppConfig, escalationPhones, {
              leadName: lead.name ?? "Lead",
              brokerName: brokerNm,
              tempo,
            })
          }
          // Push p/ o gestor-usuário (Fernanda) — Story 75-82: SÓ enquanto o bolsão está
          // OFF. Com o bolsão ligado, a Fernanda recebe o resumo do bolsão (30min) no lugar.
          if (gestorUserId && !cfg.bolsao_enabled) {
            await sendPushToUser(admin, gestorUserId, {
              title: "Lead sem atendimento (SLA)",
              body: `${lead.name ?? "Lead"} (${brokerNm}) está há ${tempo} sem atendimento.`,
              url: `${APP_URL}/dashboard/leads/${lead.id}`,
            }).catch((e: unknown) => console.error("[sla] push gestor:", e))
          }
          markGestor.push(lead.id)
          escalonamentos++
        }
      }
    }

    if (!dryRun) {
      if (markCorretor.length > 0) {
        await admin
          .from("leads")
          .update({ sla_alerta_corretor_em: now.toISOString() })
          .in("id", markCorretor)
      }
      if (markGestor.length > 0) {
        await admin
          .from("leads")
          .update({ sla_alerta_gestor_em: now.toISOString() })
          .in("id", markGestor)
      }
    }

    summary.push({
      orgId,
      candidatos: leadRows.length,
      alertasCorretor,
      escalonamentos,
      dryRun,
      withinHours,
      ...(dryRun ? { wouldAlert } : {}),
    })
  }

  return NextResponse.json({ ok: true, summary })
}
