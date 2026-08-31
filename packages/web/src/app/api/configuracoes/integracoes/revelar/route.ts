/**
 * Story 900-51 · AC7 — "Revelar os últimos 4 caracteres", superfície do cliente.
 *
 * Mesma função do banco que a rota de `/platform` usa, pelo ponto de entrada `_as_org`: a
 * discriminação entre os dois públicos acontece no `actor_type` que cada ponto de entrada
 * CONGELA (`'org_admin'` aqui, `'platform_admin'` lá), não num parâmetro que o chamador escolhe.
 */

import { NextResponse } from "next/server"
import { requireAuth, requireCapability } from "@web/lib/api-auth"
import { ehProviderGravavel } from "@web/lib/integrations/painel/providers"

export async function POST(req: Request) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const negado = await requireCapability(appUser, "configuracoes.integracoes_gerenciar")
  if (negado) return negado

  const corpo = (await req.json().catch(() => ({}))) as { provider?: unknown }
  const provider = String(corpo.provider ?? "")
  if (!ehProviderGravavel(provider)) {
    return NextResponse.json({ error: "PROVIDER_INVALIDO" }, { status: 400 })
  }

  const { data, error } = await supabase.rpc("org_integration_reveal_last4_as_org", {
    p_provider: provider,
  })

  if (error) {
    return NextResponse.json(
      { error: "REVEAL_FALHOU", codigo: error.code ?? null },
      { status: 422 },
    )
  }

  return NextResponse.json({ ok: true, last4: data as string })
}
