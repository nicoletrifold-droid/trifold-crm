import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { sendPushToUser } from "@web/lib/server/push-service"
import { leadDeepLink } from "@web/lib/leads/lead-url"
import { logAudit, getRequestIp } from "@web/lib/audit"
import { PERDIDO_STAGE_IDS } from "@web/lib/leads/stage-filters"
import { distributeLeadToNextBroker } from "@web/lib/roleta/distributor"
import { STAGE_IDS } from "@trifold/shared"

// Valor sentinela do seletor: em vez de um corretor específico, devolve o lead à roleta
// (distribuição automática na ordem dela).
const ROLETA = "__roleta__"

// Reativar lead perdido — admin/supervisor/gerente-comercial retomam o atendimento de um
// lead que estava em Perdido/Não Qualificado, escolhendo o corretor (do empreendimento do
// lead) e informando o motivo. O lead volta para "Aguardando atendimento" (STAGE_IDS.novo)
// e o relógio de SLA reinicia como se fosse uma distribuição nova (decisão de produto).
//
// Reativar manualmente é a saída PREVISTA do estado Perdido: o guard da automação
// (roleta/distributor) é por ETAPA atual, então ao sair de Perdido o lead volta a fluir sem
// conflito (ver distributor.ts / 156_roleta_pick_no_perdido.sql).

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://crm.trifold.eng.br"
const MANAGER_ROLES = ["admin", "supervisor", "gerente-comercial", "sdr"] as const

type EligibleBroker = { userId: string; name: string }

// GET — corretores elegíveis para reativar este lead (os vinculados ao empreendimento do
// lead via broker_assignments). Fallback: se o lead não tem empreendimento OU nenhum corretor
// vinculado está disponível, retorna todos os corretores ativos (mesma lógica de fallback da
// roleta, Story 75-44).
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser } = auth

  const forbidden = requireRole(appUser, [...MANAGER_ROLES])
  if (forbidden) return forbidden

  const admin = createAdminClient()

  const { data: lead } = await admin
    .from("leads")
    .select("id, org_id, property_interest_id, assigned_broker_id")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .maybeSingle()
  if (!lead) return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 })

  let brokers: EligibleBroker[] = []
  let fallback = false

  if (lead.property_interest_id) {
    const { data: assigns } = await admin
      .from("broker_assignments")
      .select("broker_id")
      .eq("property_id", lead.property_interest_id)
    const brokerIds = (assigns ?? []).map((a) => a.broker_id)
    if (brokerIds.length > 0) {
      const { data: bks } = await admin
        .from("brokers")
        .select("user_id, users!user_id(id, name, is_active)")
        .eq("org_id", appUser.org_id)
        .eq("is_available", true)
        .in("id", brokerIds)
      brokers = (bks ?? [])
        .map((b) => {
          const u = Array.isArray(b.users) ? b.users[0] : b.users
          return u && u.is_active ? { userId: b.user_id as string, name: u.name ?? "Sem nome" } : null
        })
        .filter((x): x is EligibleBroker => x !== null)
        .sort((a, b) => a.name.localeCompare(b.name))
    }
  }

  // Fallback: sem empreendimento ou sem corretor vinculado disponível → todos os ativos.
  if (brokers.length === 0) {
    fallback = true
    const { data: all } = await admin
      .from("users")
      .select("id, name")
      .eq("org_id", appUser.org_id)
      .eq("is_active", true)
      .in("role", ["broker", "gerente-comercial", "sdr"])
      .order("name")
    brokers = (all ?? []).map((u) => ({ userId: u.id, name: u.name ?? "Sem nome" }))
  }

  return NextResponse.json({
    brokers,
    fallback,
    currentBrokerId: lead.assigned_broker_id ?? null,
  })
}

// POST — executa a reativação.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser } = auth

  const forbidden = requireRole(appUser, [...MANAGER_ROLES])
  if (forbidden) return forbidden

  const body = (await request.json().catch(() => null)) as
    | { broker_id?: string; motivo?: string }
    | null
  const brokerUserId = body?.broker_id
  const motivo = body?.motivo?.trim()
  if (!brokerUserId) return NextResponse.json({ error: "Selecione o corretor." }, { status: 400 })
  if (!motivo) return NextResponse.json({ error: "O motivo da reativação é obrigatório." }, { status: 400 })

  const admin = createAdminClient()

  const { data: lead } = await admin
    .from("leads")
    .select("id, org_id, name, stage_id, assigned_broker_id, lost_reason, lost_reason_grupo")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .maybeSingle()
  if (!lead) return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 })
  if (!PERDIDO_STAGE_IDS.includes(lead.stage_id)) {
    return NextResponse.json({ error: "Este lead não está perdido." }, { status: 422 })
  }

  const now = new Date().toISOString()

  // ── Modo ROLETA: devolve o lead à roleta (distribuição automática na ordem dela) ──────
  if (brokerUserId === ROLETA) {
    // Coloca o lead em estado distribuível (sem corretor, fora de Perdido, SLA zerado). A
    // roleta só pega leads assim (distributor.ts bail se assigned_broker_id/bolsao_em/perdido).
    const { error: updateErr } = await admin
      .from("leads")
      .update({
        assigned_broker_id: null,
        stage_id: STAGE_IDS.novo,
        distribuido_em: null, // a roleta carimba ao distribuir
        primeiro_atendimento_em: null,
        sla_alerta_corretor_em: null,
        sla_alerta_gestor_em: null,
        bolsao_em: null,
        lost_reason: null,
        lost_reason_grupo: null, // Story 75-264: grupo não pode ficar residual
        updated_at: now,
      })
      .eq("id", id)
      .eq("org_id", appUser.org_id)
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    await admin.from("conversations").update({ is_ai_active: false }).eq("lead_id", id)

    // Chama a roleta (usa admin client próprio; carimba corretor + distribuido_em + stage).
    const result = await distributeLeadToNextBroker(id, appUser.org_id)
    const distributed = result.status === "distributed"

    await admin.from("activities").insert({
      org_id: lead.org_id,
      lead_id: id,
      user_id: appUser.id,
      type: "lead_reactivated",
      description: distributed
        ? "Lead reativado e distribuído pela roleta"
        : "Lead reativado e devolvido à roleta (aguardando distribuição)",
      metadata: {
        motivo,
        via_roleta: true,
        roleta_status: result.status,
        to_broker_id: result.brokerUserId ?? null,
        from_broker_id: lead.assigned_broker_id,
        previous_lost_reason: lead.lost_reason ?? null,
        previous_lost_reason_grupo: lead.lost_reason_grupo ?? null,
      },
    })

    void logAudit({
      org_id: lead.org_id,
      user_id: appUser.id,
      user_name: appUser.name,
      action: "lead.reactivate",
      entity_type: "lead",
      entity_id: id,
      entity_name: lead.name ?? id,
      metadata: { motivo, via_roleta: true, roleta_status: result.status, previous_lost_reason: lead.lost_reason ?? null, previous_lost_reason_grupo: lead.lost_reason_grupo ?? null },
      ip_address: getRequestIp(request.headers),
    })

    return NextResponse.json({ ok: true, via_roleta: true, status: result.status })
  }

  // ── Modo CORRETOR específico ──────────────────────────────────────────────────────────
  // Valida o corretor destino (usuário ativo da org, corretor ou gerente-comercial).
  const { data: target } = await admin
    .from("users")
    .select("id, name, role, is_active")
    .eq("id", brokerUserId)
    .eq("org_id", appUser.org_id)
    .maybeSingle()
  if (!target || !target.is_active || !["broker", "gerente-comercial", "sdr"].includes(target.role)) {
    return NextResponse.json({ error: "Corretor destino inválido." }, { status: 422 })
  }

  // Reabre o lead: atribui corretor, volta para "Aguardando atendimento" e reinicia o
  // relógio de SLA (trata como distribuição nova — decisão de produto).
  const { error: updateErr } = await admin
    .from("leads")
    .update({
      assigned_broker_id: brokerUserId,
      stage_id: STAGE_IDS.novo,
      distribuido_em: now,
      primeiro_atendimento_em: null, // reinicia "aguardando primeiro atendimento"
      sla_alerta_corretor_em: null, // permite o alerta de SLA disparar de novo
      sla_alerta_gestor_em: null,
      bolsao_em: null, // garante que não fique preso como "em bolsão"
      lost_reason: null, // não está mais perdido
      lost_reason_grupo: null, // Story 75-264: grupo não pode ficar residual
      updated_at: now,
    })
    .eq("id", id)
    .eq("org_id", appUser.org_id)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // Transferência manual → IA não reassume a conversa (só corretor atende agora).
  await admin.from("conversations").update({ is_ai_active: false }).eq("lead_id", id)

  await admin.from("activities").insert({
    org_id: lead.org_id,
    lead_id: id,
    user_id: appUser.id,
    type: "lead_reactivated",
    description: `Lead reativado para ${target.name ?? "corretor"}`,
    metadata: {
      motivo,
      to_broker_id: brokerUserId,
      from_broker_id: lead.assigned_broker_id,
      previous_lost_reason: lead.lost_reason ?? null,
      previous_lost_reason_grupo: lead.lost_reason_grupo ?? null,
    },
  })

  void logAudit({
    org_id: lead.org_id,
    user_id: appUser.id,
    user_name: appUser.name,
    action: "lead.reactivate",
    entity_type: "lead",
    entity_id: id,
    entity_name: lead.name ?? id,
    metadata: { motivo, to_broker_id: brokerUserId, previous_lost_reason: lead.lost_reason ?? null, previous_lost_reason_grupo: lead.lost_reason_grupo ?? null },
    ip_address: getRequestIp(request.headers),
  })

  void sendPushToUser(admin, brokerUserId, {
    title: "Lead reativado para você",
    body: `${lead.name ?? "Um lead"} voltou para atendimento. Motivo: ${motivo}`,
    url: leadDeepLink(APP_URL, target.role as string, id), // Story 75-226: sdr → /dashboard
  }).catch((e: unknown) => console.error("[reativar] push:", e))

  return NextResponse.json({ ok: true })
}
