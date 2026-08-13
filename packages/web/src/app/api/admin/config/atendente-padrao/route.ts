import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireCapability } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"

/**
 * Story 75-16 (AC7) — Atendente padrão do portal por organização.
 * GET   → { atendente_padrao_id, staff[] }
 * PATCH { atendente_padrao_id } → define (null = nenhum)
 */

// 75-312: gate = capabilities; esta lista fica SÓ para a SELEÇÃO dos candidatos
// a atendente padrão (.in("role", …)) — CONGELADA ao seed de
// configuracoes.atendente_padrao_ver por teste (capabilities.test.ts).
const STAFF_ROLES = ["admin", "supervisor", "obras", "gerente-relacionamento", "gerente-comercial"]

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser } = auth
  if (await requireCapability(appUser, "configuracoes.atendente_padrao_ver")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const admin = createAdminClient()
  const [{ data: org }, { data: staff }] = await Promise.all([
    admin
      .from("organizations")
      .select("portal_atendente_padrao_id")
      .eq("id", appUser.org_id)
      .maybeSingle(),
    admin
      .from("users")
      .select("id, name")
      .eq("org_id", appUser.org_id)
      .in("role", STAFF_ROLES)
      .eq("is_active", true)
      .order("name"),
  ])

  return NextResponse.json({
    atendente_padrao_id: org?.portal_atendente_padrao_id ?? null,
    staff: (staff ?? []).map((s) => ({ id: s.id, name: s.name })),
  })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser } = auth
  if (await requireCapability(appUser, "configuracoes.atendente_padrao_editar")) {
    return NextResponse.json({ error: "Apenas admin/supervisor configuram." }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const atendenteId =
    typeof body.atendente_padrao_id === "string" && body.atendente_padrao_id
      ? body.atendente_padrao_id
      : null

  const admin = createAdminClient()
  if (atendenteId) {
    const { data: u } = await admin
      .from("users")
      .select("id")
      .eq("id", atendenteId)
      .eq("org_id", appUser.org_id)
      .maybeSingle()
    if (!u) return NextResponse.json({ error: "Usuário inválido" }, { status: 400 })
  }

  const { error } = await admin
    .from("organizations")
    .update({ portal_atendente_padrao_id: atendenteId })
    .eq("id", appUser.org_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, atendente_padrao_id: atendenteId })
}
