/**
 * Story 900-51 · AC4 (Task 3) — a tela de integrações de UMA empresa, no painel da Trifold.
 *
 * Todas as leituras passam por `platformQuery()`: este arquivo está em `app/platform/**`, que
 * `platform-query-scan.ts` varre exigindo zero `.from(<literal>)` cru. O acesso já foi decidido
 * por `requirePlatformAdmin()` no layout.
 *
 * O tile do Google mora AQUI e não dentro de `<IntegrationsPanel />`: ele é somente leitura, e
 * misturá-lo com os 5 tiles graváveis convidaria alguém a "só acrescentar um botão" — que é
 * exatamente o que a D14 proíbe, porque completar o OAuth pelo cliente é impersonation.
 */

import Link from "next/link"
import { platformQuery } from "@web/lib/tenancy/platform-query"
import { IntegrationsPanel } from "@web/components/integrations/integrations-panel"
import type { LinhaDaTrilha } from "@web/components/integrations/integrations-panel"
import {
  montarTilesDoPainel,
  type LinhaDeIntegracaoDoPainel,
  type LinhaWhatsAppConfig,
} from "@web/lib/integrations/painel/providers"

export const dynamic = "force-dynamic"

export default async function IntegracoesDaOrgPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: orgId } = await params

  const { data: orgs } = await platformQuery(
    "organizations",
    "id, name, slug, google_oauth_tokens",
  ).eq("id", orgId)
  const org = ((orgs ?? []) as unknown as Array<{
    id: string
    name: string
    slug: string
    google_oauth_tokens: Record<string, unknown> | null
  }>)[0]

  if (!org) {
    return <p className="text-sm text-stone-400">Empresa não encontrada.</p>
  }

  const { data: integracoes } = await platformQuery(
    "org_integrations",
    "provider, status, config, secret_ref, updated_at",
    orgId,
  )

  const { data: trilhaBruta } = await platformQuery(
    "platform_audit_log",
    "id, action, actor_type, created_at, metadata",
    orgId,
  )
    .eq("target_table", "org_integrations")
    .order("created_at", { ascending: false })
    .limit(20)

  // QA-900-51-2 — a fonte que DECIDE o estado do WhatsApp é `whatsapp_config`, não a linha
  // inescrevível de `org_integrations`. Só colunas não-secretas são pedidas: a credencial em si
  // não entra nesta árvore (AC6), e `nao-consumo.test.ts` reprova a menção dela aqui.
  const { data: waLinhas } = await platformQuery(
    "whatsapp_config",
    "status, phone_number_id, updated_at",
    orgId,
  )

  // A montagem dos 5 tiles é COMPARTILHADA com o `/dashboard` — ver `montarTilesDoPainel`.
  const tiles = montarTilesDoPainel(
    (integracoes ?? []) as unknown as LinhaDeIntegracaoDoPainel[],
    ((waLinhas ?? []) as unknown as LinhaWhatsAppConfig[])[0] ?? null,
  )

  const googleConectado = Boolean(
    (org.google_oauth_tokens as Record<string, unknown> | null)?.refresh_token,
  )

  return (
    <div className="space-y-6">
      <div>
        <Link href="/platform/orgs" className="text-xs text-stone-400 hover:text-stone-200">
          ← Empresas
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-stone-100">Integrações — {org.name}</h1>
        <p className="mt-1 text-sm text-stone-400">
          As chaves são gravadas no Vault e nunca voltam para a tela. O que aparece aqui é
          &quot;configurado&quot; ou &quot;não configurado&quot;, e no máximo os 4 últimos
          caracteres sob clique.
        </p>
      </div>

      <IntegrationsPanel
        viewerRole="platform_admin"
        tiles={tiles}
        endpoint={`/api/platform/orgs/${orgId}/integracoes`}
        trilha={(trilhaBruta ?? []) as unknown as LinhaDaTrilha[]}
      />

      {/* Google — SOMENTE LEITURA, e fora do componente compartilhado (AC4). */}
      <div className="rounded-lg border border-stone-800 bg-stone-900 p-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-base font-semibold text-stone-100">Google (Forms / Calendar)</h3>
          <span className="inline-flex rounded-full bg-stone-500/15 px-2 py-0.5 text-xs text-stone-300">
            {googleConectado ? "Conectado pelo cliente" : "Não conectado"}
          </span>
        </div>
        <p className="text-xs text-stone-400">
          Sem botão de ação, de propósito: o Google usa OAuth, e o consentimento é do próprio
          cliente. Completá-lo pela Trifold exigiria impersonation, proibida pela D14 do epic. O
          cliente conecta em Configurações → Integrações → Google Forms, na conta dele.
        </p>
      </div>
    </div>
  )
}
