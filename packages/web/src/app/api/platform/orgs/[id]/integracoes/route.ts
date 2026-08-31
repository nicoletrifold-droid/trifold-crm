/**
 * Story 900-51 · AC5/AC7/AC8 — escrita e revelação de integração pela superfície `/platform`.
 *
 * A org NUNCA vem do corpo da requisição: é o parâmetro de rota `[id]`, validado contra
 * `organizations` antes de qualquer efeito — mesmo desenho de `resend-admin-invite/route.ts`.
 * Aceitar um id do corpo deixaria a Trifold gravar a credencial de uma empresa dentro de outra.
 *
 * **`createAdminClient()` aqui é deliberado e está na allowlist** (`docs/audits/
 * admin-client-allowlist.json`, seção `plataforma`): as 4 RPCs `_as_platform` são
 * `GRANT EXECUTE ... TO service_role` e a autorização acontece nesta rota
 * (`getPlatformAdmin()`), não no SQL — mesmo modelo de confiança de `admin-invite.ts`. A régua
 * que impede isso de virar hábito não é promessa: `scripts/admin-client-allowlist.test.ts` roda
 * ESLint por AST em subprocesso dentro do `pnpm test`.
 *
 * As LEITURAS passam por `platformQuery()` — este arquivo está dentro de `app/api/platform/**`,
 * que `platform-query-scan.ts` varre exigindo zero `.from(<literal>)` cru.
 *
 * **R9 — esta rota, e só ela, inclui `technicalDetail`.** A decisão é de servidor e é tomada
 * aqui, onde a identidade do requisitante é confiável. A rota `/dashboard` não serializa o campo.
 */

import { NextResponse } from "next/server"
import { getPlatformAdmin } from "@web/lib/tenancy/platform-guard"
import { platformQuery } from "@web/lib/tenancy/platform-query"
import { createAdminClient } from "@web/lib/supabase/admin"
import { gravarIntegracao, type PortaDeEscrita } from "@web/lib/integrations/painel/escrita"
import { ehProviderGravavel } from "@web/lib/integrations/painel/providers"
import {
  alertarAposEscritaDeIntegracao,
  LINHAS_DA_JANELA,
} from "@web/lib/integrations/painel/alertas-page-id"

interface CorpoDeEscrita {
  provider?: unknown
  secret?: unknown
  config?: unknown
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const platformAdmin = await getPlatformAdmin()
  if (!platformAdmin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 })

  const { id: orgId } = await params

  const { data: org } = await platformQuery("organizations", "id").eq("id", orgId).maybeSingle()
  if (!org) return NextResponse.json({ error: "ORG_NOT_FOUND" }, { status: 404 })

  const corpo = (await req.json().catch(() => ({}))) as CorpoDeEscrita
  const provider = String(corpo.provider ?? "")
  const segredo = typeof corpo.secret === "string" ? corpo.secret : ""
  const config = (corpo.config ?? {}) as Record<string, unknown>

  if (!ehProviderGravavel(provider)) {
    return NextResponse.json({ error: "PROVIDER_INVALIDO" }, { status: 400 })
  }

  const { data: linhas } = await platformQuery("org_integrations", "provider, status", orgId).eq(
    "provider",
    provider,
  )
  const statusAtual =
    ((linhas ?? []) as unknown as Array<{ status: string }>)[0]?.status ?? null

  const db = createAdminClient()
  const porta: PortaDeEscrita = {
    writeSecret: (p, s, c) =>
      db.rpc("org_integration_write_secret_as_platform", {
        p_org_id: orgId,
        p_provider: p,
        p_secret: s,
        p_config: c,
        p_actor_user_id: platformAdmin.userId,
      }),
    markConnected: (p) =>
      db.rpc("org_integration_mark_connected_as_platform", {
        p_org_id: orgId,
        p_provider: p,
        p_actor_user_id: platformAdmin.userId,
      }),
    markError: (p, codigo) =>
      db.rpc("org_integration_mark_error_as_platform", {
        p_org_id: orgId,
        p_provider: p,
        p_actor_user_id: platformAdmin.userId,
        p_codigo: codigo,
      }),
  }

  const resultado = await gravarIntegracao(
    porta,
    { provider, segredo, config, statusAtual },
    { incluirDetalheTecnico: true },
  )

  // AC11 — o disparo é o MESMO das duas superfícies (QA-900-51-1). O que muda aqui é só o
  // transporte da leitura: `platformQuery()`, porque este lado fala com o banco por service-role.
  if (resultado.ok) {
    await alertarAposEscritaDeIntegracao(provider, () =>
      platformQuery("platform_audit_log", "id, actor_type, org_id, action, metadata", orgId)
        .eq("target_table", "org_integrations")
        .eq("metadata->>provider", provider)
        .order("created_at", { ascending: false })
        .limit(LINHAS_DA_JANELA),
    )
  }

  return NextResponse.json(resultado, { status: resultado.ok ? 200 : 422 })
}
