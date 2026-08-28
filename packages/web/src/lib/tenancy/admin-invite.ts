/**
 * Story 900-22b (Epic 900, Onda 2) — convite do administrador de uma empresa cliente.
 *
 * Fecha a AC de 900-21 que o PR #498 não entregou: `provision_org()` cria a org mas não cria
 * ninguém capaz de logar nela. Sem isto, uma empresa provisionada em `/platform` nasce órfã.
 *
 * ISTO NÃO É UM MECANISMO NOVO. É o idioma que `api/brokers/route.ts` e
 * `api/users/[id]/reset-password/route.ts` já executam — criar conta no Supabase Auth, gravar
 * `users`, gerar link de recovery e mandar o e-mail branded — extraído para um lugar só, porque
 * agora ele tem DOIS chamadores (criação da org e reenvio manual).
 *
 * IDEMPOTÊNCIA é o requisito central: o convite é efeito externo e pode falhar depois de o
 * banco já ter commitado. Reexecutar tem que retomar, nunca duplicar. Por isso a função
 * procura a linha de admin antes de inserir, e se recusa a recriar a conta Auth de quem já
 * aceitou o convite.
 *
 * ESCRITAS NÃO PASSAM POR `platformQuery()` — ele é mecanismo de leitura, e este arquivo
 * insere/atualiza. Declarado no Scope OUT da story; este arquivo fica fora dos diretórios que
 * `platform-query-scan.ts` varre, de propósito.
 */

import { createAdminClient } from "@web/lib/supabase/admin"
import { sendEmail } from "@web/lib/email"
import { renderPasswordActionEmail } from "@web/lib/email-layout"

/**
 * Grava o e-mail do admin como convite PENDENTE na org.
 *
 * Mora aqui, e não na rota, por dois motivos que apontam para o mesmo lugar: (1) é escrita, e
 * escrita é o escopo deste arquivo — `platformQuery()` só cobre leitura; (2) `app/api/platform/**`
 * é varrido por `platform-query-scan.ts`, que exige zero `.from(<literal>)` cru lá dentro. Um
 * `db.from("organizations").update(...)` na rota acenderia a régua sem que houvesse nada errado,
 * e a tentação seria afrouxar a régua em vez de mover a escrita.
 *
 * Chamada ANTES de `ensureAdminInvited` (AC-A2): é o que faz o endereço sobreviver a uma falha
 * na criação da conta no Supabase Auth.
 */
export async function persistAdminInviteEmail(orgId: string, email: string): Promise<void> {
  const db = createAdminClient()
  await db.from("organizations").update({ admin_invite_email: email.trim() }).eq("id", orgId)
}

/** Estado do convite do admin de uma org, do ponto de vista do painel. */
export type AdminInviteStatus = "none" | "pending" | "active"

/**
 * Resultado de `ensureAdminInvited`.
 *
 * `"invited"` é o nome único do caminho feliz — a UI do wizard e a da lista comparam contra
 * esta string. Não introduzir sinônimos (`"sent"`, `"ok"`).
 */
export type EnsureAdminInvitedResult =
  | { status: "invited" }
  | { status: "already_active"; emailIgnored?: boolean }
  | { status: "failed"; message: string }

interface AdminRow {
  id: string
  auth_id: string | null
  email: string | null
  name: string | null
}

/**
 * Traduz o estado persistido em um rótulo para a tela.
 *
 * Os DOIS campos são load-bearing e não são redundantes:
 *   • `admin` sozinho decide quando a linha existe sem `auth_id` e o e-mail de convite já foi
 *     limpo por outro caminho (ex.: `already_active` de um reprovisionamento).
 *   • `adminInviteEmail` sozinho decide na janela entre gravar o e-mail e inserir a linha —
 *     um crash ali deixa o e-mail como única pista de que havia um convite em andamento.
 */
export function deriveAdminInviteStatus(input: {
  adminInviteEmail: string | null
  admin: { id: string; authId: string | null } | null
}): AdminInviteStatus {
  if (input.admin?.authId) return "active"
  if (input.admin || input.adminInviteEmail) return "pending"
  return "none"
}

/**
 * Garante que a org tenha um administrador convidado, e devolve o que aconteceu.
 *
 * Nunca lança: o chamador (criação da org) precisa responder `201` mesmo quando o convite
 * falha, porque a org já existe e não há rollback. O erro viaja no retorno, não numa exceção.
 */
export async function ensureAdminInvited(
  orgId: string,
  email: string,
): Promise<EnsureAdminInvitedResult> {
  const db = createAdminClient()
  const emailLimpo = email.trim()
  // `users.name` é NOT NULL e o wizard não pede o nome do admin. A parte antes do `@`, sem
  // formatação inventada — editável depois na tela de Usuários. O `??` cobre um e-mail sem `@`,
  // que a validação da rota não barra (ela só exige "não vazio").
  const nomeDerivado = emailLimpo.split("@")[0] || emailLimpo

  // 1. Procura a linha de admin da org. `ORDER BY created_at ASC LIMIT 1` é desempate
  //    determinístico: a org "Trifold" legada tem mais de um usuário com role='admin', e sem
  //    ordem explícita o PostgREST devolveria qualquer uma — o convite passaria a depender do
  //    plano de execução do Postgres.
  const { data: admins, error: buscaErro } = await db
    .from("users")
    .select("id, auth_id, email, name")
    .eq("org_id", orgId)
    .eq("role", "admin")
    .order("created_at", { ascending: true })
    .limit(1)

  if (buscaErro) {
    console.error("[900-22b] falha ao buscar admin da org", {
      orgId,
      adminEmail: emailLimpo,
      dbError: buscaErro.message,
    })
    return { status: "failed", message: buscaErro.message }
  }

  let admin: AdminRow | null = ((admins ?? []) as AdminRow[])[0] ?? null

  // 2. Já aceitou o convite: não tocar no Supabase Auth. Recriar a conta de quem já tem
  //    `auth_id` invalidaria o acesso existente.
  if (admin?.auth_id) {
    const { data: org } = await db
      .from("organizations")
      .select("admin_invite_email")
      .eq("id", orgId)
      .maybeSingle()

    if ((org as { admin_invite_email: string | null } | null)?.admin_invite_email) {
      // Reprovisionamento do mesmo slug com um e-mail de admin diferente: o segundo endereço
      // NÃO será convidado. Limpar o campo evita deixar um convite "pendente" que na prática
      // nunca vai ser processado — e o `emailIgnored` faz a UI dizer isso em voz alta.
      await db.from("organizations").update({ admin_invite_email: null }).eq("id", orgId)
      return { status: "already_active", emailIgnored: true }
    }
    return { status: "already_active" }
  }

  // 3. Não existe linha nenhuma: cria com `auth_id: null`. É essa linha que sustenta o
  //    "convite pendente" na tela se o passo seguinte (conta Auth) falhar.
  if (!admin) {
    const { data: novo, error: insertErro } = await db
      .from("users")
      .insert({
        org_id: orgId,
        auth_id: null,
        email: emailLimpo,
        name: nomeDerivado,
        role: "admin",
        is_active: true,
      })
      .select("id, auth_id, email, name")
      .single()

    if (insertErro || !novo) {
      const message = insertErro?.message ?? "Falha ao criar o usuário administrador."
      console.error("[900-22b] falha ao inserir admin da org", {
        orgId,
        adminEmail: emailLimpo,
        dbError: message,
      })
      return { status: "failed", message }
    }
    admin = novo as AdminRow
  }

  // 4. Conta no Supabase Auth. `app_metadata.role` desde a criação (Story 75-205): sem ele o
  //    admin novo cai no fallback de `middleware.ts` `getUserRole`, uma query extra por request.
  // Senha temporária por CSPRNG (`crypto.randomUUID`), como em
  // `api/users/[id]/reset-password/route.ts` — e NÃO o `Math.random()` de `api/brokers/route.ts`.
  // Ela é sobrescrita pelo link de recovery, mas existe de verdade no intervalo entre a criação
  // da conta e o primeiro acesso; aqui o titular é o administrador de uma empresa inteira, então
  // o precedente a copiar é o mais forte dos dois, não o mais próximo.
  const tempPassword = `Tmp_${crypto.randomUUID()}!`
  const { data: authData, error: authError } = await db.auth.admin.createUser({
    email: emailLimpo,
    password: tempPassword,
    email_confirm: true,
    app_metadata: { role: "admin" },
  })

  if (authError || !authData?.user?.id) {
    // O caso mais provável no primeiro uso real: o e-mail já existe no Supabase Auth, cuja
    // unicidade é GLOBAL (não por org). Propagar a mensagem é o que impede a falha silenciosa —
    // a linha em `users` continua com `auth_id: null` e a tela mostra "convite pendente".
    const message = authError?.message ?? "Falha ao criar a conta de acesso do administrador."
    console.error("[900-22b] convite do admin falhou", {
      orgId,
      adminEmail: emailLimpo,
      authError: message,
    })
    return { status: "failed", message }
  }

  await db.from("users").update({ auth_id: authData.user.id }).eq("id", admin.id)

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://crm.trifold.eng.br"
  const { data: linkData } = await db.auth.admin.generateLink({
    type: "recovery",
    email: emailLimpo,
    options: { redirectTo: `${siteUrl}/reset-senha` },
  })

  if (linkData?.properties?.hashed_token) {
    // `action_link` usa /auth/v1/verify (verify + fragment) e não chega em /reset-senha.
    // Link direto para /auth/callback com `hashed_token` (verifyOtp). [Story 75-139]
    const actionLink = `${siteUrl}/auth/callback?token_hash=${linkData.properties.hashed_token}&type=recovery&next=/reset-senha`
    const { subject, html } = renderPasswordActionEmail({
      userName: admin.name ?? nomeDerivado,
      actionLink,
      siteUrl,
      mode: "create",
    })

    await sendEmail({
      to: emailLimpo,
      subject,
      html,
      // Tag própria, diferente de `broker_invite`: conflar as duas origens estragaria qualquer
      // métrica ou auditoria de e-mail que separe convite de plataforma de convite de corretor.
      tags: [{ name: "type", value: "platform_admin_invite" }],
      orgId,
    })
  }

  // Convite concluído: o campo deixa de significar "pendente".
  await db.from("organizations").update({ admin_invite_email: null }).eq("id", orgId)

  return { status: "invited" }
}
