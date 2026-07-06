"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { createClient } from "@web/lib/supabase/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { sendEmail } from "@web/lib/email"
import { renderPasswordActionEmail } from "@web/lib/email-layout"
import {
  isPasswordResetThrottled,
  recordPasswordResetAttempt,
} from "@web/lib/auth/password-reset-throttle"
import { logAudit } from "@web/lib/audit"

export async function login(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get("email") as string
  const password = formData.get("password") as string

  if (!email || !password) {
    return { error: "Email e senha sao obrigatorios" }
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { error: "Email ou senha incorretos" }
  }

  // Get user role to redirect correctly
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Erro ao autenticar" }
  }

  // Need both the public.users.id (for cliente_obras lookup) and role.
  const { data: appUser } = await supabase
    .from("users")
    .select("id, name, role, org_id")
    .eq("auth_id", user.id)
    .single()

  // Log session.login — após auth bem-sucedido, antes do redirect.
  // Aguardamos para garantir que o insert complete antes do throw do redirect().
  if (appUser?.id && appUser?.org_id) {
    await logAudit({
      org_id: appUser.org_id,
      user_id: appUser.id,
      user_name: appUser.name ?? "unknown",
      action: "session.login",
      entity_type: "session",
      metadata: { role: appUser.role },
      // ip_address omitido — server action não expõe request object
    })
  }

  let destination: string

  if (appUser?.role === "broker") {
    destination = "/broker"
  } else if (appUser?.role === "cliente") {
    // Fetch up to 2 obras to decide: 1 → go directly, 2+ → selection screen.
    const { data: vinculos } = await supabase
      .from("cliente_obras")
      .select("obra_id")
      .eq("user_id", appUser.id)
      .order("is_primary", { ascending: false })
      .limit(2)

    const firstObra = vinculos?.[0]?.obra_id
    if (!vinculos || vinculos.length === 0 || !firstObra) {
      destination = "/cliente/sem-obra"
    } else if (vinculos.length === 1) {
      destination = `/cliente/${firstObra}`
    } else {
      destination = "/cliente/selecionar"
    }
  } else if (appUser?.role === "obras" || appUser?.role === "gerente-relacionamento") {
    destination = "/dashboard/obras"
  } else {
    // admin, supervisor, or anything else: dashboard.
    destination = "/dashboard"
  }

  revalidatePath("/", "layout")
  redirect(destination)
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath("/", "layout")
  redirect("/login")
}

export async function requestPasswordReset(
  formData: FormData
): Promise<{ error: string } | { sent: true; email: string }> {
  const rawEmail = formData.get('email') as string
  if (!rawEmail) return { error: 'Email é obrigatório' }
  const email = rawEmail.trim().toLowerCase()

  // Resposta SEMPRE genérica — anti-enumeração (AC3). `email` retornado é o valor
  // exatamente como o usuário digitou (rawEmail), não o normalizado.
  const genericSuccess = { sent: true as const, email: rawEmail }

  // AC4 — throttle por e-mail normalizado. Acima do limite: descarta silenciosamente
  // (nenhum generateLink/sendEmail) mas responde de forma genérica (não revela).
  const throttled = await isPasswordResetThrottled(email)
  if (throttled) return genericSuccess

  const headersList = await headers()
  const origin =
    headersList.get('origin') ??
    process.env.NEXT_PUBLIC_APP_URL ??
    'http://localhost:3000'

  const adminSupabase = createAdminClient() // AC5 — service-role, nunca client anônimo

  // Busca o usuário app correspondente — só prossegue se existir (AC3).
  // .ilike para comparação case-insensitive (padrão da Story 20-10).
  const { data: appUser } = await adminSupabase
    .from('users')
    .select('id, name, email, auth_id, org_id')
    .ilike('email', email)
    .maybeSingle()

  if (!appUser) {
    return genericSuccess // e-mail não cadastrado — não revela (AC3)
  }

  let authId = appUser.auth_id
  if (!authId) {
    // Usuário legado sem conta no Supabase Auth — cria antes de gerar o link
    // (mesmo padrão de brokers/route.ts e users/[id]/reset-password/route.ts).
    const { data: newAuth, error: createError } = await adminSupabase.auth.admin.createUser({
      email: appUser.email as string,
      email_confirm: true,
      password: crypto.randomUUID(),
    })
    if (createError || !newAuth?.user?.id) {
      return genericSuccess // falha silenciosa — não revela detalhes internos
    }
    await adminSupabase.from('users').update({ auth_id: newAuth.user.id }).eq('id', appUser.id)
    authId = newAuth.user.id
  }

  const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
    type: 'recovery',
    email: appUser.email as string,
    options: { redirectTo: `${origin}/auth/callback?next=/reset-senha` },
  })

  if (linkError || !linkData?.properties?.action_link) {
    return genericSuccess // falha silenciosa — não revela detalhes internos
  }

  await recordPasswordResetAttempt(email) // AC4 — registra tentativa não bloqueada

  const { subject, html } = renderPasswordActionEmail({
    userName: appUser.name ?? 'usuário',
    actionLink: linkData.properties.action_link,
    siteUrl: origin,
    mode: 'reset',
  })

  // Fire-and-forget (correção PO item B): não aguardar o round-trip ao Resend nem o
  // logAudit encurta a janela de timing side-channel da anti-enumeração — a latência
  // entre e-mail existente e inexistente deixa de vazar pelo tempo de resposta.
  // Mesmo tradeoff já aceito para `logAudit` neste repo.
  void sendEmail({
    to: appUser.email as string,
    subject,
    html,
    tags: [{ name: 'type', value: 'login_password_reset' }],
    orgId: appUser.org_id ?? undefined,
  })

  if (appUser.org_id) {
    void logAudit({
      org_id: appUser.org_id,
      user_id: appUser.id,
      user_name: appUser.name ?? 'unknown',
      action: 'session.password_reset_requested',
      entity_type: 'session',
    })
  }

  return genericSuccess
}
