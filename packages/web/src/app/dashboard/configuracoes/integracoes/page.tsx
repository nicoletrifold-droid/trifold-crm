import Link from "next/link"
import { redirect } from "next/navigation"
import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"
import { createClient } from "@web/lib/supabase/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { fetchTokenValidity } from "@web/lib/meta/token-validity"
import { GoogleIntegrationCard } from "./google-integration-card"
import { IntegrationsPanel } from "@web/components/integrations/integrations-panel"
import type { LinhaDaTrilha } from "@web/components/integrations/integrations-panel"
import {
  montarTilesDoPainel,
  type LinhaDeIntegracaoDoPainel,
} from "@web/lib/integrations/painel/providers"

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        active
          ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300"
          : "bg-gray-100 text-gray-500 dark:bg-stone-700/50 dark:text-stone-400"
      }`}
    >
      {active ? "Ativo" : "Inativo"}
    </span>
  )
}

function ConfigField({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-400 dark:text-stone-500">{label}</p>
      <p
        className={`mt-0.5 text-sm ${
          mono
            ? "rounded bg-gray-50 px-2 py-1 font-mono text-gray-700 dark:bg-stone-800 dark:text-stone-300"
            : "text-gray-900 dark:text-stone-100"
        }`}
      >
        {value}
      </p>
    </div>
  )
}

export default async function IntegracoesPage() {
  const user = await getServerUser()

  if (!(await canAccess(user.id, user.orgId, "configuracoes.integracoes"))) {
    redirect("/dashboard")
  }

  const supabase = await createClient()

  const { data: org } = await supabase
    .from("organizations")
    .select("google_oauth_tokens")
    .eq("id", user.orgId)
    .single()

  const googleConnected = !!(org?.google_oauth_tokens as Record<string, unknown> | null)?.refresh_token

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://seu-dominio.com"

  const { data: metaAccount } = await supabase
    .from("meta_ad_accounts")
    .select("status")
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const metaAdsStatus = metaAccount?.status ?? null

  // Story 75-289 (AC8) — a fonte da verdade do WhatsApp é `whatsapp_config` no
  // BANCO, não uma env var. Este card lia `process.env.WHATSAPP_ACCESS_TOKEN`, que
  // nem existe no Vercel: mostrava "Inativo" com o WhatsApp funcionando, e mostraria
  // "Ativo" com a credencial morta. Tela que não reflete a realidade não serve de
  // alarme — e o alarme é justamente o que faltou em 10/08.
  const admin = createAdminClient()
  const { data: waConfig } = await admin
    .from("whatsapp_config")
    .select("phone_number_id, access_token, waba_id, updated_at")
    .eq("org_id", user.orgId)
    .eq("status", "active")
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  const whatsappPhoneNumberId = (waConfig?.phone_number_id as string | null) ?? null
  const whatsappConfigured = !!waConfig?.access_token
  // Consulta a Meta sobre a validade. Falha de rede NÃO é reportada como token
  // inválido (o helper distingue os dois estados).
  const tokenValidity = await fetchTokenValidity(waConfig?.access_token as string | null)

  // ─────────────────────────────────────────────────────────────────────────────────────────
  // Story 900-51 (AC4/AC9) — o painel self-service, na MESMA tela, sem recriá-la.
  //
  // As leituras usam o client RLS-scoped (`createClient()`), nunca `createAdminClient()`: esta
  // superfície é do cliente, e a policy `org_integrations_select`/`platform_audit_log_select_org`
  // já escopa por `user_org_id()`. Isso não é promessa — `scripts/admin-client-allowlist.test.ts`
  // roda ESLint por AST dentro do `pnpm test` e este caminho não está na allowlist (AC8).
  //
  // E este arquivo não importa nada de `lib/tenancy/platform-*` (AC9): a fronteira entre as duas
  // superfícies é o que a varredura de `app/dashboard/**` existe para manter.
  // ─────────────────────────────────────────────────────────────────────────────────────────
  const { data: integracoes } = await supabase
    .from("org_integrations")
    .select("provider, status, config, secret_ref, updated_at")
    .eq("org_id", user.orgId)

  const { data: trilha } = await supabase
    .from("platform_audit_log")
    .select("id, action, actor_type, created_at, metadata")
    .eq("org_id", user.orgId)
    .eq("target_table", "org_integrations")
    .order("created_at", { ascending: false })
    .limit(10)

  // A montagem dos 5 tiles é COMPARTILHADA com o `/platform` (`montarTilesDoPainel`). Antes eram
  // duas montagens, uma por tela, e elas discordavam sobre o WhatsApp: aqui `!!access_token`, lá
  // a linha inescrevível de `org_integrations`. Medido em produção: canal `active` com
  // credencial, e o painel do dono do produto dizendo "Não conectado" (QA-900-51-2).
  const tilesDoPainel = montarTilesDoPainel(
    (integracoes ?? []) as unknown as LinhaDeIntegracaoDoPainel[],
    waConfig
      ? {
          status: "active",
          phone_number_id: whatsappPhoneNumberId,
          updated_at: (waConfig.updated_at as string | null) ?? null,
        }
      : null,
  )

  // Check environment variable status
  const metaAppSecretConfigured = !!process.env.META_APP_SECRET
  const telegramBotUsername = process.env.TELEGRAM_BOT_USERNAME || null
  const telegramConfigured = !!process.env.TELEGRAM_BOT_TOKEN

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Integrações</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-stone-400">
          Gerencie as integracoes externas do sistema
        </p>
      </div>

      {/* Story 900-51 — painel self-service (5 tiles). Os cards abaixo continuam existindo:
          esta seção é acréscimo, não substituição. */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-stone-100">
            Chaves da sua empresa
          </h2>
          <p className="text-sm text-gray-500 dark:text-stone-400">
            Troque uma credencial vencida sem depender do suporte. A chave é testada antes de ser
            salva, vai para um cofre e nunca volta para esta tela.
          </p>
        </div>
        <IntegrationsPanel
          viewerRole="org_admin"
          tiles={tilesDoPainel}
          endpoint="/api/configuracoes/integracoes"
          trilha={(trilha ?? []) as unknown as LinhaDaTrilha[]}
        />
      </section>

      {/* Meta Ads */}
      <div className="rounded-lg bg-white p-6 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-stone-100">Meta Ads</h2>
            <p className="text-sm text-gray-500 dark:text-stone-400">
              Receba leads de campanhas do Facebook e Instagram
            </p>
          </div>
          <div className="flex items-center gap-3">
            {metaAdsStatus === "active" && (
              <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-500/15 dark:text-green-300">
                Conectado
              </span>
            )}
            {metaAdsStatus === "error" && (
              <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">
                Erro
              </span>
            )}
            {metaAdsStatus === "disconnected" && (
              <span className="inline-flex rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300">
                Não testado
              </span>
            )}
            <StatusBadge active={metaAppSecretConfigured} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <ConfigField
            label="Webhook URL"
            value={`${baseUrl}/api/webhooks/meta-ads`}
            mono
          />
          <ConfigField
            label="META_APP_SECRET"
            value={metaAppSecretConfigured ? "Configurado" : "Não configurado"}
          />
        </div>
        <div className="mt-4">
          <Link
            href="/dashboard/configuracoes/integracoes/meta-ads"
            className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200"
          >
            {metaAdsStatus ? "Gerenciar conexão →" : "Configurar conexão →"}
          </Link>
        </div>
      </div>

      {/* WhatsApp */}
      <div className="rounded-lg bg-white p-6 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-stone-100">WhatsApp</h2>
            <p className="text-sm text-gray-500 dark:text-stone-400">
              Integre mensagens via WhatsApp Business API
            </p>
          </div>
          <StatusBadge active={whatsappConfigured} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <ConfigField
            label="Webhook URL"
            value={`${baseUrl}/api/webhook/whatsapp`}
            mono
          />
          <ConfigField
            label="Phone Number ID"
            value={whatsappPhoneNumberId || "Não configurado"}
          />
          {/* Story 75-289 (AC8): a credencial vem de whatsapp_config (banco) e a
              validade vem da própria Meta — um token de 60 dias é indistinguível de
              um permanente até o dia em que derruba o CRM. */}
          <ConfigField
            label="Credencial (whatsapp_config)"
            value={whatsappConfigured ? "Configurada no banco" : "Não configurada"}
          />
          <ConfigField
            label="Validade do token"
            value={
              tokenValidity
                ? tokenValidity.unknownReason
                  ? `${tokenValidity.label} (${tokenValidity.unknownReason})`
                  : tokenValidity.label
                : "Sem credencial para verificar"
            }
          />
          {tokenValidity?.tokenType && (
            <ConfigField label="Tipo do token" value={tokenValidity.tokenType} />
          )}
        </div>
        {tokenValidity && !tokenValidity.valid && !tokenValidity.unknownReason && (
          <p
            role="alert"
            className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
          >
            A Meta está recusando esta credencial. Enquanto não for trocada em
            <code className="mx-1">whatsapp_config.access_token</code>, mensagens do corretor
            aparecem enviadas na tela e não chegam ao lead, e áudios recebidos são perdidos.
          </p>
        )}
        {tokenValidity?.valid && !tokenValidity.neverExpires && (
          <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            Este token tem prazo. Prefira um System User token com expiração
            &quot;Nunca&quot; — token com validade derruba o WhatsApp no dia em que vence.
          </p>
        )}
      </div>

      {/* Telegram */}
      <div className="rounded-lg bg-white p-6 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-stone-100">Telegram</h2>
            <p className="text-sm text-gray-500 dark:text-stone-400">
              Receba mensagens via bot do Telegram
            </p>
          </div>
          <StatusBadge active={telegramConfigured} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <ConfigField
            label="Webhook URL"
            value={`${baseUrl}/api/telegram/webhook`}
            mono
          />
          <ConfigField
            label="Bot Username"
            value={telegramBotUsername ? `@${telegramBotUsername}` : "Não configurado"}
          />
          <ConfigField
            label="TELEGRAM_BOT_TOKEN"
            value={telegramConfigured ? "Configurado" : "Não configurado"}
          />
        </div>
      </div>

      {/* Google Forms */}
      <GoogleIntegrationCard connected={googleConnected} />

      {/* Google Ads */}
      <div className="rounded-lg bg-white p-6 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-stone-100">Google Ads</h2>
            <p className="text-sm text-gray-500 dark:text-stone-400">
              Receba leads de campanhas do Google Ads
            </p>
          </div>
          <span className="inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
            Em breve
          </span>
        </div>
        <p className="text-sm text-gray-400 dark:text-stone-500">
          A integração com Google Ads estará disponível em breve.
        </p>
      </div>
    </div>
  )
}
