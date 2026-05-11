import { createAdminClient } from "@web/lib/supabase/admin"
import { sendEmail } from "@web/lib/email"
import { renderBaseLayout } from "@web/lib/email-layout"
import { renderButton } from "@web/lib/email-layout/components/button"

interface AutoVincularInput {
  unitId: string
  orgId: string
  clientEmail: string | null
  clientName: string | null
}

export interface AutoVincularResult {
  vinculado: boolean
  nova_conta: boolean
  erro?: string
}

export async function autoVincularClienteObra(
  input: AutoVincularInput
): Promise<AutoVincularResult> {
  const { unitId, orgId, clientEmail, clientName } = input

  if (!clientEmail?.trim()) {
    return { vinculado: false, nova_conta: false }
  }

  const supabaseAdmin = createAdminClient()

  const { data: unit } = await supabaseAdmin
    .from("units")
    .select("property_id")
    .eq("id", unitId)
    .single()

  if (!unit?.property_id) {
    return { vinculado: false, nova_conta: false }
  }

  const { data: obra } = await supabaseAdmin
    .from("obras")
    .select("id, name")
    .eq("property_id", unit.property_id)
    .eq("org_id", orgId)
    .maybeSingle()

  if (!obra) {
    return { vinculado: false, nova_conta: false }
  }

  const email = clientEmail.trim().toLowerCase()

  const { data: existingUser } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("email", email)
    .eq("org_id", orgId)
    .eq("role", "cliente")
    .maybeSingle()

  let userId: string
  let novaConta = false
  let senhaTemporaria: string | undefined

  if (existingUser) {
    userId = existingUser.id
  } else {
    senhaTemporaria =
      Math.random().toString(36).slice(2, 10) +
      Math.random().toString(36).slice(2, 6)

    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: senhaTemporaria,
        email_confirm: true,
        app_metadata: { role: "cliente" },
        user_metadata: { full_name: clientName?.trim() ?? "" },
      })

    if (authError) {
      return { vinculado: false, nova_conta: false, erro: authError.message }
    }

    const { data: newUser, error: userError } = await supabaseAdmin
      .from("users")
      .insert({
        auth_id: authData.user.id,
        org_id: orgId,
        name: clientName?.trim() || email,
        email,
        role: "cliente",
      })
      .select("id")
      .single()

    if (userError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      return { vinculado: false, nova_conta: false, erro: userError.message }
    }

    userId = newUser.id
    novaConta = true
  }

  const { count: existingCount } = await supabaseAdmin
    .from("cliente_obras")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)

  const isPrimary = (existingCount ?? 0) === 0

  const { error: linkError } = await supabaseAdmin
    .from("cliente_obras")
    .insert({ user_id: userId, obra_id: obra.id, is_primary: isPrimary })

  if (linkError) {
    const isDuplicate =
      linkError.code === "23505" ||
      linkError.message.toLowerCase().includes("duplicate")
    if (!isDuplicate) {
      return { vinculado: false, nova_conta: novaConta, erro: linkError.message }
    }
    return { vinculado: true, nova_conta: false }
  }

  if (novaConta && senhaTemporaria) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""
    const portalUrl = appUrl ? `${appUrl}/cliente` : ""
    const nomeExibido = clientName?.trim() || email

    const html = renderBaseLayout(
      `<h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a1a1a;">Bem-vindo ao portal de acompanhamento!</h2>
      <p style="margin:0 0 12px;">Olá, ${nomeExibido}!</p>
      <p style="margin:0 0 16px;">Você foi adicionado ao portal de acompanhamento da obra <strong>${obra.name}</strong>. Acompanhe o progresso da sua unidade em tempo real.</p>
      <p style="margin:0 0 4px;font-size:14px;"><strong>Email:</strong> ${email}</p>
      <p style="margin:0 0 20px;font-size:14px;"><strong>Senha temporária:</strong> <code>${senhaTemporaria}</code></p>
      ${portalUrl ? renderButton("Acessar o portal", portalUrl) : ""}
      <p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Recomendamos que você altere a senha no primeiro acesso.</p>`,
      { orgName: "Portal de Obras" }
    )

    await sendEmail({
      to: email,
      subject: `Acompanhe a obra do seu imóvel — Acesso ao Portal`,
      html,
      orgId,
    })
  }

  return { vinculado: true, nova_conta: novaConta }
}
