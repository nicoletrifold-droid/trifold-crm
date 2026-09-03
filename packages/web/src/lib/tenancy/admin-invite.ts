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
import { tentarAppUrl } from "./app-url-fallback"

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
  const { error } = await db
    .from("organizations")
    .update({ admin_invite_email: email.trim() })
    .eq("id", orgId)

  if (error) {
    // Engolir este erro anularia a própria razão de a função existir: se o UPDATE falha e nada
    // é registrado, o endereço some e não sobra rastro nenhum para o operador nem para o log —
    // exatamente o cenário que a AC-A2 existe para impedir. Não relança: a org já foi criada e
    // o convite ainda pode dar certo; o que não pode é a perda ser silenciosa.
    console.error("[900-22b] falha ao persistir admin_invite_email", {
      orgId,
      adminEmail: email.trim(),
      dbError: error.message,
    })
  }
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

  // 3.5 E-MAIL DIVERGENTE. A linha pendente pode ter sido criada com um endereço e o convite
  //     estar sendo disparado para outro (o operador corrigiu um typo e reprovisionou, ou o
  //     reenvio pegou `organizations.admin_invite_email`, que vence o da linha). Criar a conta
  //     Auth com o endereço novo e gravar o `auth_id` numa linha que guarda o antigo deixaria
  //     `users.email` e o Auth apontando para pessoas diferentes — a tela de Usuários mostraria
  //     um endereço que não loga, e qualquer rotina que mande e-mail lendo `users.email`
  //     escreveria para o lugar errado.
  //
  //     Reconciliar (em vez de recusar com conflito) é o que corresponde à intenção do
  //     operador: a linha ainda está PENDENTE — não há identidade estabelecida para proteger,
  //     porque ninguém nunca logou nela. O endereço que o operador acabou de informar é a
  //     declaração mais recente de quem deve administrar a empresa. Feito ANTES do `createUser`
  //     de propósito: se a criação da conta falhar, a linha já reflete o endereço que o
  //     "Reenviar" vai usar na próxima tentativa.
  if (admin.email && admin.email !== emailLimpo) {
    const { error: emailErro } = await db
      .from("users")
      .update({ email: emailLimpo, name: nomeDerivado })
      .eq("id", admin.id)

    if (emailErro) {
      const message = `Não foi possível atualizar o e-mail do administrador pendente: ${emailErro.message}`
      console.error("[900-22b] falha ao reconciliar e-mail do admin pendente", {
        orgId,
        adminEmail: emailLimpo,
        emailAnterior: admin.email,
        dbError: emailErro.message,
      })
      return { status: "failed", message }
    }
    admin = { ...admin, email: emailLimpo, name: nomeDerivado }
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

  // DAQUI PARA BAIXO A CONTA AUTH JÁ EXISTE. Cada passo restante pode falhar sozinho, e
  // devolver `"invited"` sem conferi-los seria mentir para a UI: o wizard redireciona em
  // `"invited"` e a lista mostra badge verde. Um status que não corresponde ao que aconteceu
  // é a mesma classe de defeito que o Bloco A desta story existe para fechar.
  // `admin_invite_email` só é limpo no caminho totalmente bem-sucedido — enquanto ele estiver
  // preenchido, o "Reenviar" continua disponível.
  const { error: vinculoErro } = await db
    .from("users")
    .update({ auth_id: authData.user.id })
    .eq("id", admin.id)

  if (vinculoErro) {
    // O pior dos parciais: a conta existe no Auth, mas `users.auth_id` continua nulo. A tela
    // mostraria "convite pendente" e um reenvio chamaria `createUser` de novo com o MESMO
    // endereço, batendo na unicidade global ("already registered") — um beco sem saída que só
    // sai com intervenção manual. Precisa aparecer para o operador agora, não depois.
    const message = `Conta de acesso criada, mas não foi possível vinculá-la ao usuário: ${vinculoErro.message}`
    console.error("[900-22b] convite do admin falhou ao vincular auth_id", {
      orgId,
      adminEmail: emailLimpo,
      authUserId: authData.user.id,
      dbError: vinculoErro.message,
    })
    return { status: "failed", message }
  }

  // Story 900-66 (AC4) — sem URL base o convite NÃO é enviado. `failed` é o mesmo desfecho que
  // esta função já dá quando o link não pode ser gerado: a conta existe, a UI não afirma um
  // envio que não houve, e o admin entra por "esqueci minha senha".
  const base = tentarAppUrl(process.env.NEXT_PUBLIC_SITE_URL, "lib/tenancy/admin-invite", { orgId })
  if (!base.ok) {
    return {
      status: "failed",
      message:
        "Conta de acesso criada, mas a URL da aplicação está indisponível para esta organização — o e-mail de convite não foi enviado.",
    }
  }
  const siteUrl = base.url
  const { data: linkData, error: linkErro } = await db.auth.admin.generateLink({
    type: "recovery",
    email: emailLimpo,
    options: { redirectTo: `${siteUrl}/reset-senha` },
  })

  if (linkErro || !linkData?.properties?.hashed_token) {
    // Conta criada e vinculada, mas sem link não há e-mail — o admin existe e não sabe disso.
    // Não é um beco sem saída (ele consegue entrar por "esqueci minha senha"), mas chamar isso
    // de `"invited"` faria a UI afirmar um envio que não houve.
    const message =
      linkErro?.message ??
      "Conta de acesso criada, mas o link de definição de senha não pôde ser gerado. O administrador pode usar \u201cesqueci minha senha\u201d."
    console.error("[900-22b] convite do admin sem link de acesso", {
      orgId,
      adminEmail: emailLimpo,
      authError: message,
    })
    return { status: "failed", message }
  }

  // `action_link` usa /auth/v1/verify (verify + fragment) e não chega em /reset-senha.
  // Link direto para /auth/callback com `hashed_token` (verifyOtp). [Story 75-139]
  const actionLink = `${siteUrl}/auth/callback?token_hash=${linkData.properties.hashed_token}&type=recovery&next=/reset-senha`
  const { subject, html } = renderPasswordActionEmail({
    userName: admin.name ?? nomeDerivado,
    actionLink,
    siteUrl,
    mode: "create",
    orgId,
  })

  // `sendEmail` NUNCA lança: devolve `{ id, error }`. Ignorar o `error` era o último ponto em
  // que `"invited"` podia ser falso.
  const { error: envioErro } = await sendEmail({
    to: emailLimpo,
    subject,
    html,
    // Tag própria, diferente de `broker_invite`: conflar as duas origens estragaria qualquer
    // métrica ou auditoria de e-mail que separe convite de plataforma de convite de corretor.
    tags: [{ name: "type", value: "platform_admin_invite" }],
    orgId,
  })

  if (envioErro) {
    const message = `Conta de acesso criada, mas o e-mail de convite não pôde ser enviado: ${envioErro}`
    console.error("[900-22b] convite do admin sem envio de e-mail", {
      orgId,
      adminEmail: emailLimpo,
      emailError: envioErro,
    })
    return { status: "failed", message }
  }

  // Convite concluído DE VERDADE: conta criada, vinculada, link gerado e e-mail aceito pelo
  // provedor. Só agora o campo deixa de significar "pendente".
  await db.from("organizations").update({ admin_invite_email: null }).eq("id", orgId)

  return { status: "invited" }
}
