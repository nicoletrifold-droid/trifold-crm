import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"

/**
 * Story 75-17 — Participantes de uma conversa do portal.
 * POST   { obra_id, cliente_id, user_id } → adiciona participante
 * DELETE { obra_id, cliente_id, user_id } → remove participante
 */
const STAFF_ROLES = ["admin", "supervisor", "gerente-relacionamento", "gerente-comercial"]

async function resolveConversaId(
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

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser } = auth
  if (!STAFF_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const obraId = typeof body.obra_id === "string" ? body.obra_id : ""
  const clienteId = typeof body.cliente_id === "string" ? body.cliente_id : ""
  const userId = typeof body.user_id === "string" ? body.user_id : ""
  if (!obraId || !clienteId || !userId) {
    return NextResponse.json({ error: "obra_id, cliente_id e user_id obrigatórios" }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: u } = await admin
    .from("users")
    .select("id, name")
    .eq("id", userId)
    .eq("org_id", appUser.org_id)
    .maybeSingle()
  if (!u) return NextResponse.json({ error: "Usuário inválido" }, { status: 400 })

  const conversaId = await resolveConversaId(admin, appUser.org_id, obraId, clienteId)
  if (!conversaId) return NextResponse.json({ error: "Falha ao resolver conversa" }, { status: 500 })

  const { error } = await admin
    .from("obra_conversas_participants")
    .upsert(
      { conversa_id: conversaId, user_id: userId, added_by: appUser.id },
      { onConflict: "conversa_id,user_id", ignoreDuplicates: true }
    )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, participant: { id: u.id, name: u.name } }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser } = auth
  if (!STAFF_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const obraId = typeof body.obra_id === "string" ? body.obra_id : ""
  const clienteId = typeof body.cliente_id === "string" ? body.cliente_id : ""
  const userId = typeof body.user_id === "string" ? body.user_id : ""
  if (!obraId || !clienteId || !userId) {
    return NextResponse.json({ error: "obra_id, cliente_id e user_id obrigatórios" }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: conversa } = await admin
    .from("obra_conversas")
    .select("id")
    .eq("obra_id", obraId)
    .eq("cliente_id", clienteId)
    .maybeSingle()
  if (!conversa) return NextResponse.json({ ok: true })

  const { error } = await admin
    .from("obra_conversas_participants")
    .delete()
    .eq("conversa_id", conversa.id)
    .eq("user_id", userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
