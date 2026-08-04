import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { buildUpdatePayload, softDelete } from "@web/lib/api-utils"
import { isLostReasonGrupo } from "@web/lib/constants"
import { logAudit, getRequestIp } from "@web/lib/audit"
import { STAGE_IDS } from "@trifold/shared"
import { createAdminClient } from "@web/lib/supabase/admin"
import { syncFutureVisitsWithLeadOwner } from "@web/lib/appointments/sync-visit-owner"

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

  return NextResponse.json({ data: lead })
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
  if (!["admin", "supervisor", "gerente-comercial", "sdr"].includes(appUser.role)) {
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

  const allowedFields = [
    "name",
    "phone",
    "email",
    "channel",
    "stage_id",
    "property_interest_id",
    "has_down_payment",
    "preferred_bedrooms",
    "preferred_floor",
    "preferred_view",
    "preferred_garage_count",
    "qualification_status",
    "qualification_score",
    "interest_level",
    "source",
    "assigned_broker_id",
    "ai_summary",
    "visit_scheduled_at",
    // Story 75-269 — `lost_reason` SAIU da whitelist. Ele aceitava texto livre
    // sem exigir grupo, o que recriava motivo não classificado e desfazia a
    // estruturação da 75-264 um lead por vez. Varredura em packages/ e scripts/:
    // NENHUM caller escrevia por aqui — marcar perdido passa por
    // `/api/leads/[id]/mark-lost` (grava motivo E grupo, route.ts:54-55) e por
    // `/api/leads/bulk` (sempre manda `lost_reason_grupo`); `stage/route.ts:71`,
    // `bulk/route.ts:52,64` e `reativar/route.ts:151` apenas LIMPAM (`= null`).
    // Era capacidade vestigial: fechar a porta é melhor que vigiá-la.
    // Para limpar o motivo, use os endpoints acima (reativar/stage/bulk).
    "lost_reason_grupo",
    // Story 75-112 — enriquecimento do perfil (editável por quem já edita o lead)
    "observacao",
    "finalidade",
    "orcamento",
    "prazo_compra",
    "forma_pagamento",
    // Story 75-181 — perfil p/ marketing
    "profissao",
    "renda_familiar",
    "filhos",
    "estado_civil",
    "faixa_etaria",
    "situacao_moradia",
    "cidade_bairro",
    "tem_pet",
  ]

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

  // Transferência de corretor → o lead volta para "Aguardando atendimento"
  // (STAGE_IDS.novo), independente do estágio anterior. Só aplica se o corretor
  // REALMENTE mudou e o stage não foi definido explicitamente nesta requisição
  // (ex.: arrastar no kanban envia stage_id e não deve ser sobrescrito).
  // Estado atual do lead — precisa dele para DUAS decisões: transferência de
  // corretor (abaixo) e carimbo do calor (Story 75-237). Uma leitura só.
  const precisaEstadoAtual =
    (fields.assigned_broker_id !== undefined && body.stage_id === undefined) ||
    fields.interest_level !== undefined
  type LeadEstadoAtual = { assigned_broker_id: string | null; interest_level: string | null }
  let atual: LeadEstadoAtual | null = null
  if (precisaEstadoAtual) {
    const { data: cur } = await supabase
      .from("leads")
      .select("assigned_broker_id, interest_level")
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

  const forbidden = requireRole(appUser, ["admin"])
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
