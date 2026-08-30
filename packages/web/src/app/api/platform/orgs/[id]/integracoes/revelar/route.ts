/**
 * Story 900-51 · AC7 — "Revelar os últimos 4 caracteres", superfície `/platform`.
 *
 * O segredo **nunca** volta ao navegador. Esta é a única leitura que atravessa o Vault, e ela
 * devolve 4 caracteres — a decifragem acontece dentro de `_org_integration_reveal_last4`, que
 * grava a linha de auditoria ANTES do `RETURN`, não depois: uma falha na resposta HTTP não pode
 * apagar o registro de que alguém pediu para ver.
 *
 * `createAdminClient()`: ver a justificativa em `../route.ts` e a entrada na allowlist.
 */

import { NextResponse } from "next/server"
import { getPlatformAdmin } from "@web/lib/tenancy/platform-guard"
import { platformQuery } from "@web/lib/tenancy/platform-query"
import { createAdminClient } from "@web/lib/supabase/admin"
import { ehProviderGravavel } from "@web/lib/integrations/painel/providers"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const platformAdmin = await getPlatformAdmin()
  if (!platformAdmin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 })

  const { id: orgId } = await params
  const { data: org } = await platformQuery("organizations", "id").eq("id", orgId).maybeSingle()
  if (!org) return NextResponse.json({ error: "ORG_NOT_FOUND" }, { status: 404 })

  const corpo = (await req.json().catch(() => ({}))) as { provider?: unknown }
  const provider = String(corpo.provider ?? "")
  if (!ehProviderGravavel(provider)) {
    return NextResponse.json({ error: "PROVIDER_INVALIDO" }, { status: 400 })
  }

  const db = createAdminClient()
  const { data, error } = await db.rpc("org_integration_reveal_last4_as_platform", {
    p_org_id: orgId,
    p_provider: provider,
    p_actor_user_id: platformAdmin.userId,
  })

  if (error) {
    return NextResponse.json(
      { error: "REVEAL_FALHOU", codigo: error.code ?? null },
      { status: 422 },
    )
  }

  return NextResponse.json({ ok: true, last4: data as string })
}
