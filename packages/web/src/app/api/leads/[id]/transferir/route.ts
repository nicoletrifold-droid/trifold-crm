import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { syncFutureVisitsWithLeadOwner } from "@web/lib/appointments/sync-visit-owner"
import { sendPushToUser } from "@web/lib/server/push-service"
import { leadDeepLink } from "@web/lib/leads/lead-url"

// Story 75-84 (Epic 75) — admin/supervisor transfere a conversa de um lead para outro
// usuário (corretor OU atendente de chat). Reatribui o dono (assigned_broker_id), roteia
// a conversa (corretor → /broker; chat → /dashboard/chat via is_relationship), registra o
// motivo (obrigatório) em activities e notifica o destino por push.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://crm.trifold.eng.br"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser } = auth

  const forbidden = requireRole(appUser, ["admin", "supervisor"])
  if (forbidden) return forbidden

  const body = (await request.json().catch(() => null)) as
    | { target_user_id?: string; motivo?: string }
    | null
  const targetUserId = body?.target_user_id
  const motivo = body?.motivo?.trim()
  if (!targetUserId) return NextResponse.json({ error: "target_user_id é obrigatório" }, { status: 400 })
  if (!motivo) return NextResponse.json({ error: "O motivo da transferência é obrigatório." }, { status: 400 })

  const admin = createAdminClient()

  const { data: lead } = await admin
    .from("leads")
    .select("id, org_id, assigned_broker_id, name")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .maybeSingle()
  if (!lead) return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 })

  const { data: target } = await admin
    .from("users")
    .select("id, name, role")
    .eq("id", targetUserId)
    .eq("org_id", appUser.org_id)
    .maybeSingle()
  if (!target) return NextResponse.json({ error: "Usuário destino não encontrado" }, { status: 404 })

  // Roles que têm o módulo "chat" (atendem em /dashboard/chat).
  const { data: chatRows } = await admin
    .from("role_permissions")
    .select("roles!inner(name)")
    .eq("org_id", appUser.org_id)
    .eq("module", "chat")
    .eq("can_access", true)
  const chatRoles = new Set(
    ((chatRows ?? []) as Array<{ roles: { name: string } | { name: string }[] }>)
      .map((r) => (Array.isArray(r.roles) ? r.roles[0]?.name : r.roles?.name))
      .filter((n): n is string => !!n)
  )

  // Story 75-226: sdr recebe lead da roleta → também é destino válido de
  // transferência e roteia como corretor (fluxo normal do lead, não relacionamento).
  const isLeadRecipient = target.role === "broker" || target.role === "sdr"
  const hasChat = chatRoles.has(target.role as string)
  if (!isLeadRecipient && !hasChat) {
    return NextResponse.json(
      { error: "Esse usuário não atende conversas (não é corretor nem tem o módulo Chat)." },
      { status: 422 }
    )
  }
  if (targetUserId === lead.assigned_broker_id) {
    return NextResponse.json({ error: "A conversa já pertence a esse usuário." }, { status: 400 })
  }

  // destino com módulo chat (não-corretor) → caixa de relacionamento; corretor → /broker.
  const isRelationship = hasChat && !isLeadRecipient

  await admin.from("leads").update({ assigned_broker_id: targetUserId }).eq("id", id)

  // Story 75-247 — decisão do Marcos: a visita vai COM o lead. Move as visitas
  // futuras (team house) para o novo dono, tenham corretor ou não, e avisa os
  // dois lados — quem recebe e quem perdeu o compromisso da agenda.
  await syncFutureVisitsWithLeadOwner({
    admin, orgId: lead.org_id as string, leadId: id, brokerUserId: targetUserId, origem: "transferência",
  })
  // Roteia a(s) conversa(s) do lead + tira a IA (não reassume após transferência manual).
  await admin.from("conversations").update({ is_relationship: isRelationship, is_ai_active: false }).eq("lead_id", id)

  await admin.from("activities").insert({
    org_id: lead.org_id,
    lead_id: id,
    user_id: appUser.id,
    type: "transfer",
    description: `Conversa transferida para ${target.name ?? "outro usuário"}`,
    metadata: { from_user_id: lead.assigned_broker_id, to_user_id: targetUserId, motivo },
  })

  const url = isRelationship ? `${APP_URL}/dashboard/chat` : leadDeepLink(APP_URL, target.role as string, id)
  void sendPushToUser(admin, targetUserId, {
    title: "Conversa transferida para você",
    body: `${lead.name ?? "Um lead"} foi transferido para você. Motivo: ${motivo}`,
    url,
  }).catch((e: unknown) => console.error("[transferir] push:", e))

  return NextResponse.json({ ok: true, isRelationship })
}
