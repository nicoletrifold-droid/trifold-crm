import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { buildLeadSearchOrFilter } from "@web/lib/leads/search"
import { triggerAutomations } from "@web/lib/email-automations"
import { logAudit, getRequestIp } from "@web/lib/audit"
import { canAccess } from "@web/lib/permissions"
import { createAdminClient } from "@web/lib/supabase/admin"
import { normalizePhoneBR } from "@trifold/shared"

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const url = new URL(request.url)
  const rawSearch = url.searchParams.get("search")
  const search = rawSearch && rawSearch.length <= 100 ? rawSearch : null
  const stageId = url.searchParams.get("stage_id")
  const propertyId = url.searchParams.get("property_id")
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"))
  const limit = Math.min(Math.max(1, parseInt(url.searchParams.get("limit") || "50")), 100)
  const from = (page - 1) * limit
  const to = from + limit - 1

  // Segmento: default 'principal' (Story 75-98 — IMOB tem tela própria e é isolado do funil).
  // A Agenda é uma ferramenta compartilhada e precisa vincular leads de ambos os mundos, então
  // aceita 'imob' ou 'all' — mas só para quem tem acesso ao módulo IMOB (canAccess). Sem acesso,
  // qualquer valor cai só no 'principal', preservando o isolamento em todo o resto.
  const segmentoParam = url.searchParams.get("segmento")
  let wantPrincipal = true
  let wantImob = false
  if (segmentoParam === "imob") {
    wantPrincipal = false
    wantImob = true
  } else if (segmentoParam === "all") {
    wantImob = true
  }
  if (wantImob && !(await canAccess(appUser.id, appUser.org_id, "imob"))) {
    // Sem acesso ao módulo IMOB → só o funil principal.
    wantImob = false
    wantPrincipal = true
  }

  // Story 75-167 — filtro de busca sem acento (name_search) + fuzzy/typo (RPC),
  // computado uma vez (async) e reusado no buildQuery (que é síncrono).
  const searchOr = search ? await buildLeadSearchOrFilter(supabase, appUser.org_id, search) : ""

  // Monta a query de leads de um segmento, aplicando os mesmos filtros de busca.
  // `client` decide o escopo de visibilidade (ver abaixo por que IMOB usa admin).
  const buildQuery = (
    client: typeof supabase,
    segmento: "principal" | "imob"
  ) => {
    let q = client
      .from("leads")
      .select(
        "id, name, phone, email, stage_id, qualification_score, interest_level, property_interest_id, assigned_broker_id, source, created_at, updated_at",
        { count: "exact" }
      )
      .eq("org_id", appUser.org_id)
      .eq("segmento", segmento)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .range(from, to)

    if (searchOr) q = q.or(searchOr)
    if (stageId) q = q.eq("stage_id", stageId)
    if (propertyId) q = q.eq("property_interest_id", propertyId)
    return q
  }

  const queries = []
  // Principal: cliente RLS — corretor vê só os próprios leads; admin/supervisor veem todos.
  if (wantPrincipal) queries.push(buildQuery(supabase, "principal"))
  // IMOB: os leads são geridos COLETIVAMENTE por quem tem acesso ao módulo (não por
  // assigned_broker_id). A RLS de `leads` só libera não-admin/supervisor a ver os próprios
  // leads atribuídos, então esconderia os leads IMOB (normalmente sem corretor) de um usuário
  // com perfil 'imob'. Usamos o admin client — autorizado pelo gate canAccess("imob") acima —
  // como já faz a tela de Leads do IMOB (dashboard/imob/leads/page.tsx).
  if (wantImob)
    queries.push(buildQuery(createAdminClient() as typeof supabase, "imob"))

  const results = await Promise.all(queries)
  const failed = results.find((r) => r.error)
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 })
  }

  // Uma única fonte → passa direto. Duas (segmento=all) → intercala por updated_at desc.
  const leads =
    results.length === 1
      ? results[0]?.data ?? []
      : results
          .flatMap((r) => r.data ?? [])
          .sort((a, b) =>
            a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0
          )
          .slice(0, limit)
  const count = results.reduce((sum, r) => sum + (r.count ?? 0), 0)

  return NextResponse.json({ data: leads, count, page, limit })
}

export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const isBroker = appUser.role === "broker"
  if (!isBroker) {
    const forbidden = requireRole(appUser, ["admin", "supervisor"])
    if (forbidden) return forbidden
  }

  const body = await request.json()

  // Validation
  if (!body.phone?.trim()) {
    return NextResponse.json(
      { error: "phone is required" },
      { status: 400 }
    )
  }

  // Check uniqueness by phone + org_id (Story 75-10: por phone_normalized, fallback ao cru)
  const normalizedPhone = normalizePhoneBR(body.phone.trim())
  const dedupeQuery = supabase
    .from("leads")
    .select("id")
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
  const { data: existing } = await (
    normalizedPhone
      ? dedupeQuery.eq("phone_normalized", normalizedPhone)
      : dedupeQuery.eq("phone", body.phone.trim())
  ).maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: "Lead with this phone already exists" },
      { status: 409 }
    )
  }

  // Brokers can only create leads assigned to themselves
  const assignedBrokerId = isBroker ? appUser.id : (body.assigned_broker_id || null)

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      name: body.name?.trim() || null,
      phone: body.phone.trim(),
      email: body.email?.trim() || null,
      channel: body.channel || "whatsapp",
      stage_id: body.stage_id || null,
      property_interest_id: body.property_interest_id || null,
      has_down_payment: body.has_down_payment ?? null,
      preferred_bedrooms: body.preferred_bedrooms ?? null,
      preferred_floor: body.preferred_floor?.trim() || null,
      preferred_view: body.preferred_view?.trim() || null,
      preferred_garage_count: body.preferred_garage_count ?? null,
      interest_level: body.interest_level || null,
      source: body.source || "other",
      utm_campaign: body.utm_campaign?.trim() || null,
      observacao: body.observacao?.trim() || null,
      // Story 75-181 — perfil p/ marketing (todos opcionais)
      profissao: body.profissao?.trim() || null,
      renda_familiar: body.renda_familiar || null,
      filhos: body.filhos || null,
      estado_civil: body.estado_civil || null,
      faixa_etaria: body.faixa_etaria || null,
      situacao_moradia: body.situacao_moradia || null,
      cidade_bairro: body.cidade_bairro?.trim() || null,
      tem_pet: body.tem_pet || null,
      assigned_broker_id: assignedBrokerId,
      org_id: appUser.org_id,
      is_active: true,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (lead) {
    void triggerAutomations("lead.created", {
      id: lead.id,
      email: lead.email ?? null,
      name: lead.name ?? null,
      phone: lead.phone ?? null,
      org_id: lead.org_id as string,
    })

    void logAudit({
      org_id: appUser.org_id,
      user_id: appUser.id,
      user_name: appUser.name,
      action: "lead.create",
      entity_type: "lead",
      entity_id: lead.id as string,
      entity_name: (lead.name as string | null) ?? undefined,
      ip_address: getRequestIp(request.headers),
    })
  }

  return NextResponse.json({ data: lead }, { status: 201 })
}
