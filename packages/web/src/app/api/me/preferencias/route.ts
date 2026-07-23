import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"

// Story 75-210 — preferências self-service do usuário logado.
// A RLS de users só dá UPDATE a admin/gerente-comercial; aqui o usuário grava
// APENAS as próprias colunas de preferência (allowlist), via admin client
// depois da autenticação — a rota é a fronteira, padrão do lancamentosGuard.

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const { data, error } = await supabase
    .from("users")
    .select("notif_obra_aprovacao_email")
    .eq("id", appUser.id)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    notif_obra_aprovacao_email: data?.notif_obra_aprovacao_email ?? true,
  })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser } = auth

  const body = (await req.json().catch(() => null)) as {
    notif_obra_aprovacao_email?: unknown
  } | null

  if (typeof body?.notif_obra_aprovacao_email !== "boolean") {
    return NextResponse.json(
      { error: "Campo 'notif_obra_aprovacao_email' deve ser booleano" },
      { status: 400 }
    )
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from("users")
    .update({ notif_obra_aprovacao_email: body.notif_obra_aprovacao_email })
    .eq("id", appUser.id)
    .eq("org_id", appUser.org_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    notif_obra_aprovacao_email: body.notif_obra_aprovacao_email,
  })
}
