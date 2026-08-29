/**
 * Story 900-22b (Epic 900, Onda 2) — reenvio do convite do administrador.
 *
 * O convite é efeito EXTERNO do provisionamento e pode falhar sozinho (rede, rate limit, ou o
 * caso mais provável: o e-mail já existe no Supabase Auth, cuja unicidade é global). Quando
 * falha, a org fica de pé e sem ninguém que consiga logar — este endpoint é o botão que o
 * painel usa para tentar de novo, sem reprovisionar nada.
 *
 * A org NUNCA vem do corpo da requisição: é o parâmetro de rota `[id]`, validado contra
 * `organizations` antes de qualquer efeito. Aceitar um id do corpo deixaria plantar um
 * administrador dentro de outra empresa.
 *
 * As leituras passam por `platformQuery()` — este arquivo está dentro de `app/api/platform/**`,
 * que `platform-query-scan.ts` varre exigindo zero `.from(<literal>)` cru.
 */

import { NextResponse } from "next/server"
import { getPlatformAdmin } from "@web/lib/tenancy/platform-guard"
import { platformQuery } from "@web/lib/tenancy/platform-query"
import { ensureAdminInvited } from "@web/lib/tenancy/admin-invite"

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const platformAdmin = await getPlatformAdmin()
  if (!platformAdmin) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 })
  }

  const { id: orgId } = await params

  const { data: org } = await platformQuery("organizations", "id, admin_invite_email")
    .eq("id", orgId)
    .maybeSingle()

  if (!org) {
    return NextResponse.json({ error: "ORG_NOT_FOUND" }, { status: 404 })
  }

  const { admin_invite_email: adminInviteEmail } = org as unknown as {
    id: string
    admin_invite_email: string | null
  }

  // Filtrado por `role='admin'` de propósito: o número de linhas fica limitado pelo número de
  // orgs, não pelo total de usuários — sem isso, o corte de 1000 linhas do PostgREST poderia
  // esconder o admin numa empresa grande (mesma classe de defeito da Story 75-198).
  const { data: admins } = await platformQuery("users", "id, auth_id, email")
    .eq("org_id", orgId)
    .eq("role", "admin")
    .order("created_at", { ascending: true })
    .limit(1)

  const admin =
    ((admins ?? []) as unknown as Array<{
      id: string
      auth_id: string | null
      email: string | null
    }>)[0] ?? null

  // Nada pendente: nem e-mail guardado, nem linha de admin esperando conta. Não há o que
  // reenviar — e disparar um convite aqui criaria uma conta que ninguém pediu.
  const temPendencia = Boolean(adminInviteEmail) || Boolean(admin && !admin.auth_id)
  if (!temPendencia) {
    return NextResponse.json({ error: "NO_PENDING_INVITE" }, { status: 400 })
  }

  // O endereço do convite pendente vence o da linha: se o operador reprovisionou a org com um
  // e-mail novo, é esse que ele espera ver convidado.
  const email = adminInviteEmail ?? admin?.email
  if (!email) {
    return NextResponse.json({ error: "NO_PENDING_INVITE" }, { status: 400 })
  }

  const resultado = await ensureAdminInvited(orgId, email)

  if (resultado.status === "failed") {
    // Mesmo padrão de `brokers/route.ts`: a mensagem do Supabase Auth chega ao operador. Sem
    // ela, "e-mail já registrado" viraria uma falha silenciosa e indistinguível de rede caída.
    return NextResponse.json(
      { error: "ADMIN_INVITE_FAILED", message: resultado.message },
      { status: 400 },
    )
  }

  return NextResponse.json({ adminInvite: resultado })
}
