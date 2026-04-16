import { getServerUser } from "@web/lib/auth"
import { createClient } from "@web/lib/supabase/server"
import { GoogleIntegrationCard } from "./google-integration-card"

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        active
          ? "bg-green-100 text-green-700"
          : "bg-gray-100 text-gray-500"
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
      <p className="text-xs font-medium text-gray-400">{label}</p>
      <p
        className={`mt-0.5 text-sm ${
          mono
            ? "rounded bg-gray-50 px-2 py-1 font-mono text-gray-700"
            : "text-gray-900"
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

  // Check environment variable status
  const metaAppSecretConfigured = !!process.env.META_APP_SECRET
  const whatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || null
  const whatsappConfigured = !!process.env.WHATSAPP_ACCESS_TOKEN
  const telegramBotUsername = process.env.TELEGRAM_BOT_USERNAME || null
  const telegramConfigured = !!process.env.TELEGRAM_BOT_TOKEN

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Integrações</h1>
        <p className="mt-1 text-sm text-gray-500">
          Gerencie as integracoes externas do sistema
        </p>
      </div>

      {/* Meta Ads */}
      <div className="rounded-lg bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Meta Ads</h2>
            <p className="text-sm text-gray-500">
              Receba leads de campanhas do Facebook e Instagram
            </p>
          </div>
          <StatusBadge active={metaAppSecretConfigured} />
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
      </div>

      {/* WhatsApp */}
      <div className="rounded-lg bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">WhatsApp</h2>
            <p className="text-sm text-gray-500">
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
      <div className="rounded-lg bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Telegram</h2>
            <p className="text-sm text-gray-500">
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
      <div className="rounded-lg bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Google Ads</h2>
            <p className="text-sm text-gray-500">
              Receba leads de campanhas do Google Ads
            </p>
          </div>
          <span className="inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
            Em breve
          </span>
        </div>
        <p className="text-sm text-gray-400">
          A integração com Google Ads estará disponível em breve.
        </p>
      </div>
    </div>
  )
}
