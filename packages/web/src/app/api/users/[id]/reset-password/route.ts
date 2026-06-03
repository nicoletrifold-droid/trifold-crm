import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { sendEmail } from "@web/lib/email"
import { renderBaseLayout, renderButton } from "@web/lib/email-layout"

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = requireRole(appUser, ["admin", "gerente-comercial"])
  if (forbidden) return forbidden

  const { data: targetUser, error: fetchError } = await supabase
    .from("users")
    .select("id, name, email, auth_id")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .single()

  if (fetchError || !targetUser) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 })
  }

  if (!targetUser.auth_id) {
    return NextResponse.json(
      { error: "Este usuário não tem conta de acesso criada. Entre em contato com o suporte para criá-la manualmente." },
      { status: 422 }
    )
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://crm.trifold.eng.br"
  const adminSupabase = createAdminClient()

  const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
    type: "recovery",
    email: targetUser.email as string,
    options: { redirectTo: `${siteUrl}/reset-senha` },
  })

  if (linkError || !linkData?.properties?.action_link) {
    return NextResponse.json({ error: "Erro ao gerar link de recuperação." }, { status: 500 })
  }

  const brokerName = (targetUser.name as string) ?? "Corretor"
  const actionLink = linkData.properties.action_link

  const html = renderBaseLayout(
    `
    <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#111827;">Olá, ${brokerName}!</p>
    <p style="margin:0 0 24px;color:#6b7280;">
      O administrador solicitou a redefinição da sua senha no sistema da <strong>Trifold</strong>.
      Clique no botão abaixo para criar uma nova senha de acesso.
    </p>
    ${renderButton("Redefinir minha senha", actionLink)}
    <p style="margin:24px 0 0;font-size:13px;color:#6b7280;">
      Após redefinir sua senha, acesse o sistema em:<br>
      <a href="${siteUrl}" style="color:#4f46e5;text-decoration:none;font-weight:600;">${siteUrl.replace("https://", "")}</a>
    </p>
    <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">
      Este link expira em 24 horas. Se você não esperava este e-mail, pode ignorá-lo.
    </p>
    `,
    { orgName: "Trifold CRM", previewText: `${brokerName}, redefina sua senha de acesso ao Trifold CRM` }
  )

  await sendEmail({
    to: targetUser.email as string,
    subject: "Redefina sua senha — Trifold CRM",
    html,
    tags: [{ name: "type", value: "broker_password_reset" }],
    orgId: appUser.org_id,
  })

  return NextResponse.json({ data: { ok: true } })
}
