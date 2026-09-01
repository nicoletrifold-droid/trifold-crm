/**
 * Story 900-51 · AC4 (Task 3) — a tela de integrações de UMA empresa, no painel da Trifold.
 * Story 900-57 · AC3/AC4 — a MESMA URL, agora dentro da casca da empresa e na paleta do console.
 *
 * O path não muda (`/platform/orgs/[id]/integracoes`), então nenhum link salvo quebra. O que
 * muda é o entorno: a faixa de identidade e as 6 abas vêm do `layout.tsx` novo, por estrutura de
 * pastas — daí terem sumido daqui o `← Empresas` e o `<h1>` com o nome da empresa, que agora
 * apareceriam DUAS vezes na mesma tela.
 *
 * E muda a escala de cinza: esta era a única tela do console pintada na escala do CRM do
 * cliente, porque reaproveita o painel compartilhado. Agora ela pede a escala do console pela
 * prop de paleta, e o card do Google — que mora aqui, fora do componente compartilhado — foi
 * trocado direto.
 *
 * Todas as leituras passam por `platformQuery()`: este arquivo está em `app/platform/**`, que
 * `platform-query-scan.ts` varre exigindo zero `.from(<literal>)` cru. O acesso já foi decidido
 * por `requirePlatformAdmin()` no layout.
 *
 * O tile do Google mora AQUI e não dentro de `<IntegrationsPanel />`: ele é somente leitura, e
 * misturá-lo com os 5 tiles graváveis convidaria alguém a "só acrescentar um botão" — que é
 * exatamente o que a D14 proíbe, porque completar o OAuth pelo cliente é impersonation.
 */

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

  // A casca (`layout.tsx`) já chamou `notFound()` para org inexistente — as 6 abas de uma vez.
  // Este guarda continua porque o TypeScript não sabe disso, e porque a consulta daqui pede uma
  // coluna a mais (`google_oauth_tokens`) do que a da casca.
  if (!org) {
    return <p className="text-sm text-slate-400">Empresa não encontrada.</p>
  }

  // Story 900-61 — `last_error, last_check_at` SOMAM à projeção (a lista é disputada por várias
  // stories desta onda; substituí-la apagaria a coluna de outra). São metadado técnico da própria
  // integração — código de erro e carimbo de tentativa —, não dado de lead/conversa/mensagem, e
  // por isso não dependem do SEC-001.
  const { data: integracoes } = await platformQuery(
    "org_integrations",
    "provider, status, config, secret_ref, updated_at, last_error, last_check_at",
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
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Integrações
        </h2>
        <p className="mt-1 text-sm text-slate-400">
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
        palette="slate"
      />

      {/* Google — SOMENTE LEITURA, e fora do componente compartilhado (AC4). */}
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-100">Google (Forms / Calendar)</h3>
          <span className="inline-flex rounded-full bg-slate-500/15 px-2 py-0.5 text-xs text-slate-300">
            {googleConectado ? "Conectado pelo cliente" : "Não conectado"}
          </span>
        </div>
        <p className="text-xs text-slate-400">
          Sem botão de ação, de propósito: o Google usa OAuth, e o consentimento é do próprio
          cliente. Completá-lo pela Trifold exigiria impersonation, proibida pela D14 do epic. O
          cliente conecta em Configurações → Integrações → Google Forms, na conta dele.
        </p>
      </div>
    </div>
  )
}
