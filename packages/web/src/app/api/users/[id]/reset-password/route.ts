import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireCapability } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { sendEmail } from "@web/lib/email"
import { renderPasswordActionEmail } from "@web/lib/email-layout"

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = await requireCapability(appUser, "usuarios.editar")
  if (forbidden) return forbidden

  const { data: targetUser, error: fetchError } = await supabase
    .from("users")
    .select("id, name, email, auth_id, role")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .single()

  if (fetchError || !targetUser) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 })
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://crm.trifold.eng.br"
  const adminSupabase = createAdminClient()

  // Usuário sem auth_id (fluxo legado) — cria conta no Supabase Auth antes de gerar o link.
  if (!targetUser.auth_id) {
    if (!targetUser.email) {
      return NextResponse.json({ error: "Usuário sem e-mail cadastrado — não é possível criar conta de acesso." }, { status: 422 })
    }
    const { data: newAuth, error: createError } = await adminSupabase.auth.admin.createUser({
      email: targetUser.email as string,
      email_confirm: true,
      password: crypto.randomUUID(), // senha temporária — será sobrescrita pelo link de recovery
      // Story 75-205: role no JWT desde a criação (fonte = public.users)
      ...(targetUser.role ? { app_metadata: { role: targetUser.role } } : {}),
    })
    if (createError || !newAuth?.user?.id) {
      return NextResponse.json({ error: createError?.message ?? "Erro ao criar conta de acesso." }, { status: 500 })
    }
    await supabase.from("users").update({ auth_id: newAuth.user.id }).eq("id", id)
    targetUser.auth_id = newAuth.user.id
  }

  const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
    type: "recovery",
    email: targetUser.email as string,
    options: { redirectTo: `${siteUrl}/reset-senha` },
  })

  if (linkError || !linkData?.properties?.hashed_token) {
    return NextResponse.json({ error: "Erro ao gerar link de recuperação." }, { status: 500 })
  }

  // `action_link` usa /auth/v1/verify (verify + fragment) e não chega em /reset-senha.
  // Link direto para /auth/callback com `hashed_token` (verifyOtp). [Story 75-139]
  const actionLink = `${siteUrl}/auth/callback?token_hash=${linkData.properties.hashed_token}&type=recovery&next=/reset-senha`

  const brokerName = (targetUser.name as string) ?? "Corretor"
  const { subject, html } = renderPasswordActionEmail({
    userName: brokerName,
    actionLink,
    siteUrl,
    mode: "reset",
    orgId: appUser.org_id,
  })

  await sendEmail({
    to: targetUser.email as string,
    subject,
    html,
    tags: [{ name: "type", value: "broker_password_reset" }],
    orgId: appUser.org_id,
  })

  return NextResponse.json({ data: { ok: true } })
}
