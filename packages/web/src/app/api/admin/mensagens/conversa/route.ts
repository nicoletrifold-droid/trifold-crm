import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"

/**
 * Story 75-16 — Conversa do portal: estado de atribuição (atendente) + participantes,
 * e transferência (assign/reassign). Identificada por (obra_id, cliente_id).
 *
 * GET   ?obra_id=&cliente_id=  → { assigned_to, assigned_name, participants[] } (cria preguiçosamente)
 * PATCH { obra_id, cliente_id, assigned_to } → transfere/atribui
 */
const STAFF_ROLES = ["admin", "supervisor", "gerente-relacionamento", "gerente-comercial"]

async function ensureConversa(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  obraId: string,
  clienteId: string
): Promise<string | null> {
  const { data: existing } = await admin
    .from("obra_conversas")
    .select("id")
    .eq("obra_id", obraId)
    .eq("cliente_id", clienteId)
    .maybeSingle()
  if (existing) return existing.id
  const { data: org } = await admin
    .from("organizations")
    .select("portal_atendente_padrao_id")
    .eq("id", orgId)
    .maybeSingle()
  const { data: created } = await admin
    .from("obra_conversas")
    .insert({
      obra_id: obraId,
      org_id: orgId,
      cliente_id: clienteId,
      assigned_to: org?.portal_atendente_padrao_id ?? null,
      status: "aberta",
    })
    .select("id")
    .single()
  return created?.id ?? null
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser } = auth
  if (!STAFF_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const obraId = req.nextUrl.searchParams.get("obra_id")
  const clienteId = req.nextUrl.searchParams.get("cliente_id")
  if (!obraId || !clienteId) {
    return NextResponse.json({ error: "obra_id e cliente_id obrigatórios" }, { status: 400 })
  }

  const admin = createAdminClient()
  const conversaId = await ensureConversa(admin, appUser.org_id, obraId, clienteId)
  if (!conversaId) {
    return NextResponse.json({ error: "Falha ao resolver conversa" }, { status: 500 })
  }

  const { data: conversa } = await admin
    .from("obra_conversas")
    .select("id, assigned_to, status, assigned:users!assigned_to(id, name)")
    .eq("id", conversaId)
    .single()

  const { data: participants } = await admin
    .from("obra_conversas_participants")
    .select("user_id, users:user_id(id, name)")
    .eq("conversa_id", conversaId)

  const assigned = Array.isArray(conversa?.assigned) ? conversa?.assigned[0] : conversa?.assigned

  // Equipe atribuível (staff da org) — alimenta transferência e participantes.
  const { data: staff } = await admin
    .from("users")
    .select("id, name, role")
    .eq("org_id", appUser.org_id)
    .in("role", STAFF_ROLES)
    .eq("is_active", true)
    .order("name")

  return NextResponse.json({
    conversa_id: conversaId,
    assigned_to: conversa?.assigned_to ?? null,
    assigned_name: (assigned as { name?: string } | null)?.name ?? null,
    status: conversa?.status ?? "aberta",
    participants: (participants ?? []).map((p) => {
      const u = Array.isArray(p.users) ? p.users[0] : p.users
      return { id: p.user_id, name: (u as { name?: string } | null)?.name ?? "" }
    }),
    staff: (staff ?? []).map((s) => ({ id: s.id, name: s.name })),
  })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser } = auth
  if (!STAFF_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const obraId = typeof body.obra_id === "string" ? body.obra_id : ""
  const clienteId = typeof body.cliente_id === "string" ? body.cliente_id : ""
  const assignedTo =
    typeof body.assigned_to === "string" && body.assigned_to ? body.assigned_to : null
  if (!obraId || !clienteId) {
    return NextResponse.json({ error: "obra_id e cliente_id obrigatórios" }, { status: 400 })
  }

  const admin = createAdminClient()

  // Valida que o novo atendente pertence à org (quando informado)
  if (assignedTo) {
    const { data: u } = await admin
      .from("users")
      .select("id")
      .eq("id", assignedTo)
      .eq("org_id", appUser.org_id)
      .maybeSingle()
    if (!u) {
      return NextResponse.json({ error: "Usuário inválido" }, { status: 400 })
    }
  }

  const conversaId = await ensureConversa(admin, appUser.org_id, obraId, clienteId)
  if (!conversaId) {
    return NextResponse.json({ error: "Falha ao resolver conversa" }, { status: 500 })
  }

  const { error } = await admin
    .from("obra_conversas")
    .update({ assigned_to: assignedTo, updated_at: new Date().toISOString() })
    .eq("id", conversaId)
    .eq("org_id", appUser.org_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, assigned_to: assignedTo })
}
