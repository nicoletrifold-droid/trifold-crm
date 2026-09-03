import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireCapability } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { sendEmail } from "@web/lib/email"
import { renderPasswordActionEmail } from "@web/lib/email-layout"
import { logAudit, getRequestIp } from "@web/lib/audit"


export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = await requireCapability(appUser, "clientes.resetar_senha")
  if (roleError) return roleError

  const { id } = await params

  // Buscar o usuário portal pelo ID da tabela users, validando org e role
  const { data: portalUser, error: userErr } = await supabase
    .from("users")
    .select("id, auth_id, email, name, role")
    .eq("id", id)
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
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://crm.trifold.eng.br"

    // generateLink (sem envio nativo) + Resend, substituindo resetPasswordForEmail.
    // redirectTo corrigido de /portal/reset-password (inexistente) para /reset-senha (AC2).
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email: portalUser.email,
      options: { redirectTo: `${siteUrl}/reset-senha` },
    })

    if (linkError || !linkData?.properties?.hashed_token) {
      return NextResponse.json(
        { error: linkError?.message ?? "Erro ao gerar link de recuperação." },
        { status: 500 }
      )
    }

    // O `action_link` do generateLink usa o fluxo /auth/v1/verify (verify + fragment)
    // que não chega em /reset-senha. Montamos o link direto para o /auth/callback do
    // app com `hashed_token`, consumido via verifyOtp({ token_hash, type }). [Story 75-139]
    const actionLink = `${siteUrl}/auth/callback?token_hash=${linkData.properties.hashed_token}&type=recovery&next=/reset-senha`

    const { subject, html } = renderPasswordActionEmail({
      userName: portalUser.name ?? "Cliente",
      actionLink,
      siteUrl,
      mode: "reset",
      orgId: appUser.org_id,
    })

    // Rota staff-autenticada: mantém `await` para propagar erro de envio (não há
    // preocupação de enumeração aqui — o admin já pode consultar usuários da própria org).
    const sendResult = await sendEmail({
      to: portalUser.email,
      subject,
      html,
      tags: [{ name: "type", value: "cliente_password_reset" }],
      orgId: appUser.org_id,
    })

    if (sendResult.error) {
      return NextResponse.json({ error: sendResult.error }, { status: 500 })
    }

    void logAudit({
      org_id: appUser.org_id,
      user_id: appUser.id,
      user_name: appUser.name,
      action: "cliente.senha.reset_email_sent",
      entity_type: "user",
      entity_id: id,
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
    entity_id: id,
    entity_name: portalUser.name,
    ip_address: getRequestIp(request.headers),
  })

  return NextResponse.json({ success: true, message: "Senha atualizada com sucesso" })
}
