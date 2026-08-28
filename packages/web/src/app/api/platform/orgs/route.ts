/**
 * Story 900-22 — provisionamento de empresa cliente.
 * Story 900-22b — o provisionamento agora também convida o administrador da empresa.
 *
 * A autorização acontece AQUI, não no SQL: `provision_org()` roda com service-role porque
 * `assert_org_scope()` rejeitaria um platform admin logado (ele nunca pertence à org que
 * está criando). Por isso esta rota é a fronteira de segurança — se ela não checar, ninguém
 * checa.
 *
 * ORDEM DOS EFEITOS (900-22b, AC-A2). `provision_org()` é transacional; o convite é efeito
 * EXTERNO e pode falhar por rede ou rate limit do Supabase Auth. Então:
 *   1) provisiona a org (transação),
 *   2) grava `admin_invite_email` — para o endereço sobreviver a uma falha do passo 3,
 *   3) tenta convidar.
 * Inverter 2 e 3 perderia o e-mail exatamente no cenário em que ele é a única pista de que
 * havia um convite em andamento. Falha no passo 3 NÃO derruba a resposta: a org existe e não
 * há rollback — o painel mostra "convite pendente" com botão de reenviar.
 */

import { NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { getPlatformAdmin } from "@web/lib/tenancy/platform-guard"
import {
  ensureAdminInvited,
  persistAdminInviteEmail,
  type EnsureAdminInvitedResult,
} from "@web/lib/tenancy/admin-invite"

/** `Acme Imóveis` → `acme-imoveis`. Normaliza acento e pontuação. */
export function slugify(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export async function POST(req: Request) {
  const admin = await getPlatformAdmin()
  if (!admin) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 })
  }

  let body: { name?: string; slug?: string; adminEmail?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 })
  }

  const name = (body.name ?? "").trim()
  if (!name) {
    return NextResponse.json({ error: "NAME_REQUIRED" }, { status: 400 })
  }
  const slug = (body.slug ?? "").trim() || slugify(name)
  if (!slug) {
    return NextResponse.json({ error: "SLUG_REQUIRED" }, { status: 400 })
  }
  const adminEmail = (body.adminEmail ?? "").trim()
  if (!adminEmail) {
    return NextResponse.json({ error: "ADMIN_EMAIL_REQUIRED" }, { status: 400 })
  }

  const db = createAdminClient()
  const { data, error } = await db.rpc("provision_org", { p_name: name, p_slug: slug })

  if (error) {
    // A mensagem do Postgres é útil aqui (slug inválido, nome vazio) e não expõe nada
    // sensível — são validações da própria função.
    return NextResponse.json(
      { error: "PROVISION_FAILED", message: error.message },
      { status: 400 },
    )
  }

  // O `orgId` é SEMPRE o que `provision_org()` devolveu. Um campo `orgId` no corpo da
  // requisição é ignorado — aceitar um id vindo do cliente deixaria um platform admin (ou
  // qualquer coisa que forje o corpo) plantar um administrador dentro de outra empresa.
  const orgId = data as string

  await persistAdminInviteEmail(orgId, adminEmail)

  let adminInvite: EnsureAdminInvitedResult
  try {
    adminInvite = await ensureAdminInvited(orgId, adminEmail)
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha inesperada ao convidar o administrador."
    console.error("[900-22b] convite do admin lançou exceção", { orgId, adminEmail, message })
    adminInvite = { status: "failed", message }
  }

  return NextResponse.json({ orgId, name, slug, adminInvite }, { status: 201 })
}
