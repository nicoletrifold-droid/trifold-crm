import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { logAudit, getRequestIp } from "@web/lib/audit"

const ALLOWED_ROLES = ["admin", "supervisor", "obras"]

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ user_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = requireRole(appUser, ALLOWED_ROLES)
  if (roleError) return roleError

  const { user_id } = await params

  // Buscar o usuário portal pelo ID da tabela users, validando org e role
  const { data: portalUser, error: userErr } = await supabase
    .from("users")
    .select("id, auth_id, email, name, role")
    .eq("id", user_id)
    .eq("org_id", appUser.org_id)
    .maybeSingle()

  if (userErr) {
    return NextResponse.json({ error: userErr.message }, { status: 500 })
  }

  if (!portalUser) {
    return NextResponse.json(
      { error: "Usuário não encontrado" },
      { status: 404 }
    )
  }

  if (portalUser.role !== "cliente") {
    return NextResponse.json(
      { error: "Operação permitida apenas para usuários com role=cliente" },
      { status: 403 }
    )
  }

  if (!portalUser.auth_id) {
    return NextResponse.json(
      { error: "Usuário não possui conta de autenticação vinculada" },
      { status: 422 }
    )
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const action = body.action

  if (action !== "send_reset_email" && action !== "set_password") {
    return NextResponse.json(
      { error: "action deve ser 'send_reset_email' ou 'set_password'" },
      { status: 400 }
    )
  }

  const adminClient = createAdminClient()

  // ── Opção 1: Enviar e-mail de redefinição ─────────────────────────────
  if (action === "send_reset_email") {
    const { error: resetErr } = await adminClient.auth.resetPasswordForEmail(
      portalUser.email,
      {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/portal/reset-password`,
      }
    )

    if (resetErr) {
      return NextResponse.json({ error: resetErr.message }, { status: 500 })
    }

    void logAudit({
      org_id: appUser.org_id,
      user_id: appUser.id,
      user_name: appUser.name,
      action: "cliente.senha.reset_email_sent",
      entity_type: "user",
      entity_id: user_id,
      entity_name: portalUser.name,
      ip_address: getRequestIp(request.headers),
    })

    return NextResponse.json({ success: true, message: "E-mail enviado com sucesso" })
  }

  // ── Opção 2: Definir nova senha ───────────────────────────────────────
  const password = typeof body.password === "string" ? body.password : ""

  if (!password || password.length < 6) {
    return NextResponse.json(
      { error: "A senha deve ter no mínimo 6 caracteres" },
      { status: 400 }
    )
  }

  const { error: updateErr } = await adminClient.auth.admin.updateUserById(
    portalUser.auth_id,
    { password, email_confirm: true }
  )

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  void logAudit({
    org_id: appUser.org_id,
    user_id: appUser.id,
    user_name: appUser.name,
    action: "cliente.senha.set_password",
    entity_type: "user",
    entity_id: user_id,
    entity_name: portalUser.name,
    ip_address: getRequestIp(request.headers),
  })

  return NextResponse.json({ success: true, message: "Senha atualizada com sucesso" })
}
