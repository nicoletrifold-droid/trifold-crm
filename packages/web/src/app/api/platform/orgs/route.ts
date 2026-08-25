/**
 * Story 900-22 — provisionamento de empresa cliente.
 *
 * A autorização acontece AQUI, não no SQL: `provision_org()` roda com service-role porque
 * `assert_org_scope()` rejeitaria um platform admin logado (ele nunca pertence à org que
 * está criando). Por isso esta rota é a fronteira de segurança — se ela não checar, ninguém
 * checa.
 */

import { NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { getPlatformAdmin } from "@web/lib/tenancy/platform-guard"

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

  let body: { name?: string; slug?: string }
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

  return NextResponse.json({ orgId: data, name, slug })
}
