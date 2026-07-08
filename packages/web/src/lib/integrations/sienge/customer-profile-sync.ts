import type { SupabaseClient } from "@supabase/supabase-js"

// Story 79-1 — reconcilia o e-mail de um cliente com o Sienge (fonte da verdade) e
// PROPAGA a mudança para o login do portal: public.users.email + auth.users email.
// Isso garante que, se o cliente mudar de e-mail no Sienge, o "Esqueci a senha" do
// portal envie o link para o endereço atual (e não para o antigo).
//
// Usado pelo cron `sienge-customer-sync` (automático) e pelo sync manual da obra.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface EmailSyncOutcome {
  changed: boolean
  oldEmail: string | null
  newEmail: string | null
  portalUpdated: boolean
  portalError?: string
}

interface ClienteLite {
  id: string
  email: string | null
  sienge_customer_id: number | null
  org_id: string
}

interface PortalUser {
  id: string
  auth_id: string | null
  email: string | null
}

/**
 * Encontra o usuário do portal (role=cliente) correspondente ao cliente CRM.
 * Prioriza o `sienge_customer_id` (espelhado nas duas tabelas); cai para o e-mail
 * ANTIGO quando o vínculo por sienge_customer_id ainda não existe.
 */
async function findPortalUser(
  admin: SupabaseClient,
  siengeCustomerId: number | null,
  orgId: string,
  oldEmail: string
): Promise<PortalUser | null> {
  if (siengeCustomerId) {
    const { data } = await admin
      .from("users")
      .select("id, auth_id, email")
      .eq("org_id", orgId)
      .eq("role", "cliente")
      .eq("sienge_customer_id", siengeCustomerId)
      .limit(1)
    if (data?.[0]) return data[0] as PortalUser
  }
  if (oldEmail) {
    const { data } = await admin
      .from("users")
      .select("id, auth_id, email")
      .eq("org_id", orgId)
      .eq("role", "cliente")
      .eq("email", oldEmail)
      .limit(1)
    if (data?.[0]) return data[0] as PortalUser
  }
  return null
}

/**
 * Atualiza `clientes.email` para o valor do Sienge quando difere, e propaga ao
 * login do portal (users.email + auth email com email_confirm). Só age quando o
 * e-mail do Sienge é válido e diferente do atual. Nunca apaga e-mail existente.
 */
export async function syncClienteEmail(
  admin: SupabaseClient,
  cliente: ClienteLite,
  siengeEmail: string | null
): Promise<EmailSyncOutcome> {
  const oldEmail = (cliente.email ?? "").trim().toLowerCase()
  const newEmail = (siengeEmail ?? "").trim().toLowerCase()

  const outcome: EmailSyncOutcome = {
    changed: false,
    oldEmail: cliente.email,
    newEmail: cliente.email,
    portalUpdated: false,
  }

  if (!newEmail || !EMAIL_RE.test(newEmail) || newEmail === oldEmail) {
    return outcome
  }

  // 1) CRM (fonte da verdade = Sienge)
  const { error: crmErr } = await admin
    .from("clientes")
    .update({ email: newEmail })
    .eq("id", cliente.id)
  if (crmErr) {
    outcome.portalError = `crm_update_failed: ${crmErr.message}`
    return outcome
  }
  outcome.changed = true
  outcome.newEmail = newEmail

  // 2) Login do portal (users + auth) — para o reset de senha ir ao e-mail novo.
  const portal = await findPortalUser(admin, cliente.sienge_customer_id, cliente.org_id, oldEmail)
  if (!portal) {
    // cliente sem login de portal — só o CRM muda; nada a propagar.
    return outcome
  }
  if ((portal.email ?? "").trim().toLowerCase() === newEmail && !portal.auth_id) {
    outcome.portalUpdated = true
    return outcome
  }

  try {
    if (portal.auth_id) {
      const { error: authErr } = await admin.auth.admin.updateUserById(portal.auth_id, {
        email: newEmail,
        email_confirm: true,
      })
      if (authErr) throw new Error(authErr.message)
    }
    const { error: userErr } = await admin
      .from("users")
      .update({ email: newEmail })
      .eq("id", portal.id)
    if (userErr) throw new Error(userErr.message)
    outcome.portalUpdated = true
  } catch (e) {
    // Ex.: e-mail novo já usado por outro login (colisão). CRM já reflete o Sienge;
    // registra o erro para revisão manual, sem derrubar o sync do resto.
    outcome.portalError = e instanceof Error ? e.message : "portal_update_failed"
  }

  return outcome
}
