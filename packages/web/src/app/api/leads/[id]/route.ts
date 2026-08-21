import { NextRequest, NextResponse } from "next/server"
import { can } from "@web/lib/permissions"
import { requireAuth, requireCapability } from "@web/lib/api-auth"
import { LEAD_PATCH_ALLOWED_FIELDS } from "@web/lib/leads/patch-allowed-fields"
import { buildUpdatePayload, softDelete } from "@web/lib/api-utils"
import { isLostReasonGrupo } from "@web/lib/constants"
import { logAudit, getRequestIp } from "@web/lib/audit"
import { canAccess } from "@web/lib/permissions"
import { STAGE_IDS } from "@trifold/shared"
import { createAdminClient } from "@web/lib/supabase/admin"
import { syncFutureVisitsWithLeadOwner } from "@web/lib/appointments/sync-visit-owner"
import { resolverNomesUtm } from "@web/lib/leads/meta-utm"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const { data: lead, error } = await supabase
    .from("leads")
    .select(
      `
      *,
      stage:kanban_stages(id, name, slug, type, color),
      property_interest:properties!property_interest_id(id, name, slug),
      broker:users!assigned_broker_id(id, name, email, avatar_url)
    `
    )
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .single()

  if (error || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 })
  }

  // Story 75-365 — tráfego pago grava os MACROS do Meta nos UTMs
  // (utm_campaign={{campaign.id}}), então "Origem" mostrava "120246224161970741".
  // Resolve para o nome via sync do Agente Meta Ads; best-effort (nulls em falha).
  const nomesUtm = await resolverNomesUtm(supabase, appUser.org_id, {
    utm_campaign: (lead as { utm_campaign?: string | null }).utm_campaign ?? null,
    utm_content: (lead as { utm_content?: string | null }).utm_content ?? null,
  })

  return NextResponse.json({ data: { ...lead, ...nomesUtm } })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  // Check permission: admin/supervisor/gerente-comercial, assigned broker, or
  // imob editing an imob-world lead (Story 75-199 — espelha o canEdit da página)
  if (!(await can(appUser.id, appUser.org_id, "leads.editar_qualquer"))) {
    const { data: lead } = await supabase
      .from("leads")
      .select("assigned_broker_id, segmento")
      .eq("id", id)
      .eq("org_id", appUser.org_id)
      .eq("is_active", true)
      .single()

    const isImobLeadEditor = appUser.role === "imob" && lead?.segmento === "imob"
    if (!lead || (lead.assigned_broker_id !== appUser.id && !isImobLeadEditor)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  const body = await request.json()

  // Story 75-273 — a whitelist saiu daqui para um módulo testável, para que
  // ninguém reintroduza `lost_reason` sem o teste acusar (QA-002 da 75-269).
  // Story 84-1 — `qualificacao_comercial` foi adicionado ao módulo (não aqui).
  const allowedFields = LEAD_PATCH_ALLOWED_FIELDS

  // QA 75-269 (QA-001) — `lost_reason` saiu da whitelist, e `buildUpdatePayload`
  // IGNORA EM SILÊNCIO campo não permitido: um PATCH com `lost_reason` junto de
  // outro campo válido responderia 200 tendo descartado o motivo. Rejeitar
  // explicitamente torna o contrato audível — quem tentar escreve por aqui
  // descobre na hora, em vez de achar que gravou.
  if ("lost_reason" in body) {
    return NextResponse.json(
      {
        error:
          "lost_reason não é editável por este endpoint. Use POST /api/leads/[id]/mark-lost (grava motivo e grupo juntos) ou os fluxos de reativação/etapa para limpar.",
      },
      { status: 400 }
    )
  }

  const { fields, error: payloadError } = buildUpdatePayload(body, allowedFields)
  if (payloadError) return payloadError

  // Story 75-264 — grupo de motivo de perda só aceita a whitelist (ou null p/ limpar).
  if (fields.lost_reason_grupo != null && !isLostReasonGrupo(fields.lost_reason_grupo)) {
    return NextResponse.json({ error: "lost_reason_grupo inválido" }, { status: 400 })
  }

  // Story 84-1 — Qualificação Comercial é manual e independente do gate de edição
  // geral do lead (linha 54 acima): exige a permissão específica `leads.qualificacao`
  // além de já poder editar o lead.
  if (
    fields.qualificacao_comercial !== undefined &&
    !(await canAccess(appUser.id, appUser.org_id, "leads.qualificacao"))
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Transferência de corretor → o lead volta para "Aguardando atendimento"
  // (STAGE_IDS.novo), independente do estágio anterior. Só aplica se o corretor
  // REALMENTE mudou e o stage não foi definido explicitamente nesta requisição
  // (ex.: arrastar no kanban envia stage_id e não deve ser sobrescrito).
  // Estado atual do lead — precisa dele para TRÊS decisões: transferência de
  // corretor (abaixo), carimbo do calor (Story 75-237) e old_value do audit da
  // Qualificação Comercial (Story 84-1). Uma leitura só.
  const precisaEstadoAtual =
    (fields.assigned_broker_id !== undefined && body.stage_id === undefined) ||
    fields.interest_level !== undefined ||
    fields.qualificacao_comercial !== undefined
  type LeadEstadoAtual = {
    assigned_broker_id: string | null
    interest_level: string | null
    qualificacao_comercial: string | null
  }
  let atual: LeadEstadoAtual | null = null
  if (precisaEstadoAtual) {
    const { data: cur } = await supabase
      .from("leads")
      .select("assigned_broker_id, interest_level, qualificacao_comercial")
      .eq("id", id)
      .eq("org_id", appUser.org_id)
      .single()
    atual = (cur as LeadEstadoAtual | null) ?? null
  }

  if (fields.assigned_broker_id !== undefined && body.stage_id === undefined) {
    if (atual && atual.assigned_broker_id !== fields.assigned_broker_id) {
      fields.stage_id = STAGE_IDS.novo
    }
  }

  // Story 75-237 — quem passa por AQUI é humano (corretor/gestor pelas telas; a
  // Nicole e o cron escrevem direto no banco). Carimba a escolha como manual e a
  // IA para de recalcular. Limpar p/ "Não definido" devolve o controle à IA.
  // 🔥 QA: só quando o valor MUDA. Os forms reenviam o calor atual em TODO save
  // (mexendo só no telefone, por exemplo) — carimbar aí congelaria a IA num
  // valor que ela mesma calculou, e o lead nunca mais esquentaria sozinho.
  if (fields.interest_level !== undefined && atual) {
    const novo = (fields.interest_level as string | null) ?? null
    if (novo !== (atual.interest_level ?? null)) {
      fields.interest_level_manual = novo !== null
    }
  }

  const { data: lead, error } = await supabase
    .from("leads")
    .update(fields)
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .select()
    .single()

  if (error || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 })
  }

  // Story 75-247/75-249 — trocou de dono por aqui (form do lead / seletor de
  // corretor): a visita futura acompanha o novo responsável. Só roda quando o
  // corretor foi realmente mexido nesta requisição.
  if (typeof fields.assigned_broker_id === "string" && fields.assigned_broker_id) {
    await syncFutureVisitsWithLeadOwner({
      admin: createAdminClient(),
      orgId: appUser.org_id,
      leadId: id,
      brokerUserId: fields.assigned_broker_id,
      origem: "edição do lead",
    })
  }

  void logAudit({
    org_id: appUser.org_id,
    user_id: appUser.id,
    user_name: appUser.name,
    action: "lead.update",
    entity_type: "lead",
    entity_id: id,
    entity_name: (lead.name as string | null) ?? undefined,
    ip_address: getRequestIp(request.headers),
  })

  // Story 84-1 — audit específico da Qualificação Comercial (além do genérico acima),
  // com old_value/new_value para o histórico de mudanças (84-2).
  if (fields.qualificacao_comercial !== undefined) {
    void logAudit({
      org_id: appUser.org_id,
      user_id: appUser.id,
      user_name: appUser.name,
      action: "lead.qualificacao_comercial_updated",
      entity_type: "lead",
      entity_id: id,
      entity_name: (lead.name as string | null) ?? undefined,
      metadata: {
        old_value: atual?.qualificacao_comercial ?? null,
        new_value: (fields.qualificacao_comercial as string | null) ?? null,
      },
      ip_address: getRequestIp(request.headers),
    })
  }

  return NextResponse.json({ data: lead })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = await requireCapability(appUser, "leads.apagar")
  if (forbidden) return forbidden

  // Snapshot ANTES do softDelete — a função não retorna o nome.
  const { data: leadSnapshot } = await supabase
    .from("leads")
    .select("id, name")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .maybeSingle()

  const result = await softDelete(supabase, "leads", id, appUser.org_id)
  if (result.error) return result.error

  void logAudit({
    org_id: appUser.org_id,
    user_id: appUser.id,
    user_name: appUser.name,
    action: "lead.delete",
    entity_type: "lead",
    entity_id: id,
    entity_name: leadSnapshot?.name ?? id,
    ip_address: getRequestIp(_req.headers),
  })

  return NextResponse.json({ data: { message: "Lead deleted" } })
}
