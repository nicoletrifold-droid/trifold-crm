import Link from "next/link"
import { getServerUser } from "@web/lib/auth"
import { createClient } from "@web/lib/supabase/server"
import { GoogleIntegrationCard } from "./google-integration-card"

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

  // Check environment variable status
  const metaAppSecretConfigured = !!process.env.META_APP_SECRET
  const whatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || null
  const whatsappConfigured = !!process.env.WHATSAPP_ACCESS_TOKEN
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
          <ConfigField
            label="WHATSAPP_ACCESS_TOKEN"
            value={whatsappConfigured ? "Configurado" : "Não configurado"}
          />
        </div>
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
