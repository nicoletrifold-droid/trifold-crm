"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { after } from "next/server"
import { createClient } from "@web/lib/supabase/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { sendEmail } from "@web/lib/email"
import { renderPasswordActionEmail } from "@web/lib/email-layout"
import {
  isPasswordResetThrottled,
  recordPasswordResetAttempt,
} from "@web/lib/auth/password-reset-throttle"
import { logAudit } from "@web/lib/audit"
import { tentarAppUrl } from "@web/lib/tenancy/app-url-fallback"

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
  // `is_platform_admin` entra aqui, e não numa segunda consulta, porque é a MESMA linha:
  // uma consulta extra abriria a janela em que as duas leituras discordam.
  const { data: appUser } = await supabase
    .from("users")
    .select("id, name, role, org_id, is_platform_admin")
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

  // Story 900-56 (defeito da porta de entrada) — `is_platform_admin` vem ANTES de todos os
  // ramos por `role`, e a ordem é decidida, não acidental.
  //
  // ## Por que a coluna é ortogonal ao `role`, e por que isso exige precedência declarada
  //
  // `users.role` diz o que a pessoa faz DENTRO de uma empresa; `users.is_platform_admin` diz
  // que ela opera a plataforma, ACIMA das empresas (é a mesma autoridade da função SQL
  // `is_platform_admin()` das policies do Epic 78, e de `lib/tenancy/platform-guard.ts`). Um
  // valor não implica nada sobre o outro: um platform admin pode ter qualquer `role`, e sem
  // ordem explícita o desfecho de quem casa dois ramos seria decidido pela ordem em que os
  // `else if` foram escritos — que é acidente, não decisão.
  //
  // ## O que foi medido antes de escolher a ordem (2026-09-01, leitura pura nos dois bancos)
  //
  //   • teste (`xnxvygyfyyyzwhiuoehz`): 3 usuários, 1 com `is_platform_admin`, `role='admin'`.
  //   • produção (`dsopqkqjkmhytudaaolv`): 113 usuários, 1 com `is_platform_admin`,
  //     `role='admin'`.
  //   • platform admins que TAMBÉM casam um ramo não-`/dashboard` (`broker`, `cliente`,
  //     `obras`, `gerente-relacionamento`): **0** nos dois bancos.
  //
  // Ou seja: hoje a ordem não muda o destino de ninguém. Ela é escrita agora porque o dia em
  // que mudar é o dia em que ninguém estará olhando.
  //
  // ## Por que a plataforma vence
  //
  // Porque o desfecho é RECUPERÁVEL num sentido só. De `/platform` existe `← Voltar ao CRM`,
  // que leva ao `/dashboard` — e de lá o `role` volta a mandar. O caminho inverso é
  // exatamente o defeito que esta mudança conserta: cair no CRM sem porta de volta ao painel.
  // Escolher o lado com saída custa um clique a quem quer o CRM; escolher o outro custou um
  // painel inalcançável.
  if (appUser?.is_platform_admin === true) {
    destination = "/platform"
  } else if (appUser?.role === "broker") {
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
  // Base URL do link de recuperação. Prioriza a env confiável (mesmo padrão da
  // rota admin de senha do cliente e de brokers/route.ts) porque, em produção,
  // Server Actions recebem `origin` VAZIO e o link cairia em localhost. Em dev
  // local, defina NEXT_PUBLIC_SITE_URL=http://localhost:3000 no .env.development.
  // Story 900-66 — o sítio 28: a MESMA classe de fallback dos outros 27, invisível ao `grep` da
  // story porque a cadeia é multilinha e o literal usava aspas simples. A precedência
  // env → `origin` → env NÃO muda (o comentário acima diz por que ela existe); o que muda é só o
  // último degrau, que era o literal da Trifold e agora é o resolver.
  // Desfecho (AC4): sem URL base, o e-mail de recuperação NÃO é enviado — e a resposta continua
  // sendo a genérica de sempre, porque revelar a diferença quebraria a anti-enumeração (AC3 da
  // 75-139). Um link de recuperação para a marca errada é o pior desfecho possível aqui.
  const base = tentarAppUrl(
    process.env.NEXT_PUBLIC_SITE_URL ?? headersList.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL,
    'app/login/actions:requestPasswordReset'
  )
  if (!base.ok) return genericSuccess
  const baseUrl = base.url

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
    options: { redirectTo: `${baseUrl}/auth/callback?next=/reset-senha` },
  })

  if (linkError || !linkData?.properties?.hashed_token) {
    return genericSuccess // falha silenciosa — não revela detalhes internos
  }

  await recordPasswordResetAttempt(email) // AC4 — registra tentativa não bloqueada

  // O `action_link` do generateLink aponta para /auth/v1/verify?token=... (fluxo
  // "verify + fragment") que ignora o path e joga o usuário no login com a sessão
  // no fragment — nunca chega em /reset-senha. Montamos o link direto para o
  // /auth/callback do app usando `hashed_token` (token_hash), que o callback
  // consome via verifyOtp({ token_hash, type }) e redireciona para `next`. [Story 75-139]
  const actionLink = `${baseUrl}/auth/callback?token_hash=${linkData.properties.hashed_token}&type=recovery&next=/reset-senha`

  const { subject, html } = renderPasswordActionEmail({
    userName: appUser.name ?? 'usuário',
    actionLink,
    siteUrl: baseUrl,
    mode: 'reset',
  })

  // `after()` (Next 16, estável desde v15.1) agenda o envio para DEPOIS que a resposta
  // é enviada ao cliente, mas o runtime AGUARDA sua conclusão antes de congelar a
  // invocação serverless (usa `waitUntil` por baixo na Vercel). Isso corrige o bug do
  // fire-and-forget solto (`void sendEmail`), em que a função era encerrada antes do
  // round-trip ao Resend completar e o e-mail nunca era enviado (Story 75-139).
  // Como o trabalho roda após a resposta, a mitigação de timing side-channel da
  // anti-enumeração é preservada: a latência de resposta não vaza se o e-mail existe.
  const emailOrgId = appUser.org_id ?? undefined
  const emailTo = appUser.email as string
  after(async () => {
    const res = await sendEmail({
      to: emailTo,
      subject,
      html,
      tags: [{ name: 'type', value: 'login_password_reset' }],
      orgId: emailOrgId,
    })
    if (res?.error) {
      // Observabilidade: nunca vaza para a resposta (anti-enumeração intacta).
      console.error('[password-reset] sendEmail falhou:', res.error)
    }
  })

  if (appUser.org_id) {
    const auditOrgId = appUser.org_id
    const auditUserId = appUser.id
    const auditUserName = appUser.name ?? 'unknown'
    after(() =>
      logAudit({
        org_id: auditOrgId,
        user_id: auditUserId,
        user_name: auditUserName,
        action: 'session.password_reset_requested',
        entity_type: 'session',
      })
    )
  }

  return genericSuccess
}
