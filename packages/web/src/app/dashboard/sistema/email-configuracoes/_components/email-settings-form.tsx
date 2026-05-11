"use client"

import { useState, useEffect, useCallback } from "react"

interface Settings {
  sender_name: string
  sender_email: string
  reply_to: string
  daily_quota: number
  quota_alert_pct: number
  bounce_alert_pct: number
  telegram_alerts_enabled: boolean
  unsubscribe_base_url: string
}

const EMPTY: Settings = {
  sender_name: "Trifold",
  sender_email: "contato@trifold.com.br",
  reply_to: "",
  daily_quota: 100,
  quota_alert_pct: 95,
  bounce_alert_pct: 5,
  telegram_alerts_enabled: true,
  unsubscribe_base_url: "",
}

export function EmailSettingsForm() {
  const [form, setForm] = useState<Settings>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasTelegram = !!process.env.NEXT_PUBLIC_TELEGRAM_CONFIGURED

  const fetchSettings = useCallback(async () => {
    const res = await fetch("/api/admin/email-settings")
    if (!res.ok) return
    const data = await res.json() as Settings & { reply_to: string | null; unsubscribe_base_url: string | null }
    setForm({
      ...data,
      reply_to: data.reply_to ?? "",
      unsubscribe_base_url: data.unsubscribe_base_url ?? "",
    })
    setLoading(false)
  }, [])

  useEffect(() => { fetchSettings() }, [fetchSettings])

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSaved(false)

    const res = await fetch("/api/admin/email-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        reply_to: form.reply_to || null,
        unsubscribe_base_url: form.unsubscribe_base_url || null,
      }),
    })

    setSaving(false)
    if (!res.ok) {
      const data = await res.json() as { error?: string }
      setError(data.error ?? "Erro ao salvar configurações")
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const alertThreshold = Math.floor(form.daily_quota * form.quota_alert_pct / 100)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-stone-400">Carregando...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Remetente */}
      <section className="rounded-lg border border-stone-200 bg-white">
        <div className="border-b border-stone-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-stone-800">Remetente</h2>
          <p className="mt-0.5 text-xs text-stone-400">
            Nome e endereço que aparecem nos emails enviados
          </p>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">
                Nome do remetente
              </label>
              <input
                type="text"
                maxLength={50}
                value={form.sender_name}
                onChange={(e) => set("sender_name", e.target.value)}
                className="w-full rounded border border-stone-200 px-3 py-2 text-sm text-stone-800 focus:border-orange-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">
                Email do remetente
              </label>
              <input
                type="email"
                value={form.sender_email}
                onChange={(e) => set("sender_email", e.target.value)}
                className="w-full rounded border border-stone-200 px-3 py-2 text-sm text-stone-800 focus:border-orange-400 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">
              Reply-to{" "}
              <span className="font-normal text-stone-400">(opcional)</span>
            </label>
            <input
              type="email"
              value={form.reply_to}
              onChange={(e) => set("reply_to", e.target.value)}
              placeholder="respostas@seudominio.com.br"
              className="w-full rounded border border-stone-200 px-3 py-2 text-sm text-stone-800 focus:border-orange-400 focus:outline-none"
            />
          </div>
          <p className="text-xs text-amber-600">
            Certifique-se de que o domínio está verificado no painel do Resend antes de alterar o email do remetente.
          </p>
        </div>
      </section>

      {/* Limites e Quotas */}
      <section className="rounded-lg border border-stone-200 bg-white">
        <div className="border-b border-stone-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-stone-800">Limites e Quotas</h2>
          <p className="mt-0.5 text-xs text-stone-400">
            Controle de envio diário e alertas
          </p>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">
                Quota diária
              </label>
              <input
                type="number"
                min={1}
                max={1000}
                value={form.daily_quota}
                onChange={(e) => set("daily_quota", Number(e.target.value))}
                className="w-full rounded border border-stone-200 px-3 py-2 text-sm text-stone-800 focus:border-orange-400 focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-stone-400">
                Plano Free Resend: 100/dia
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">
                Alerta de quota (%)
              </label>
              <input
                type="number"
                min={50}
                max={99}
                value={form.quota_alert_pct}
                onChange={(e) => set("quota_alert_pct", Number(e.target.value))}
                className="w-full rounded border border-stone-200 px-3 py-2 text-sm text-stone-800 focus:border-orange-400 focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-stone-400">
                Alerta quando atingir{" "}
                <strong>{alertThreshold} emails</strong> ({form.quota_alert_pct}%)
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Alertas */}
      <section className="rounded-lg border border-stone-200 bg-white">
        <div className="border-b border-stone-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-stone-800">Alertas</h2>
          <p className="mt-0.5 text-xs text-stone-400">
            Notificações automáticas quando limites são atingidos
          </p>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div className="lg:w-64">
            <label className="mb-1 block text-xs font-medium text-stone-600">
              Alerta de bounce (%)
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={form.bounce_alert_pct}
              onChange={(e) => set("bounce_alert_pct", Number(e.target.value))}
              className="w-full rounded border border-stone-200 px-3 py-2 text-sm text-stone-800 focus:border-orange-400 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-stone-400">
              Alerta quando taxa de bounce ultrapassar {form.bounce_alert_pct}%
            </p>
          </div>
          <div className="flex items-center justify-between rounded border border-stone-100 bg-stone-50 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-stone-700">Alertas via Telegram</p>
              <p className="text-xs text-stone-400">
                {hasTelegram
                  ? "Bot configurado — alertas ativos"
                  : "TELEGRAM_BOT_TOKEN não configurado"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => set("telegram_alerts_enabled", !form.telegram_alerts_enabled)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                form.telegram_alerts_enabled ? "bg-orange-500" : "bg-stone-200"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                  form.telegram_alerts_enabled ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* Descadastro */}
      <section className="rounded-lg border border-stone-200 bg-white">
        <div className="border-b border-stone-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-stone-800">Descadastro</h2>
          <p className="mt-0.5 text-xs text-stone-400">
            URL base para links de descadastro no rodapé dos emails
          </p>
        </div>
        <div className="px-5 py-4">
          <input
            type="url"
            value={form.unsubscribe_base_url}
            onChange={(e) => set("unsubscribe_base_url", e.target.value)}
            placeholder="https://app.seudominio.com.br/unsubscribe"
            className="w-full rounded border border-stone-200 px-3 py-2 text-sm text-stone-800 focus:border-orange-400 focus:outline-none"
          />
          <p className="mt-1 text-[11px] text-stone-400">
            Opcional. Se vazio, o link de descadastro do rodapé fica desabilitado.
          </p>
        </div>
      </section>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-5 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60"
        >
          {saving ? "Salvando..." : "Salvar configurações"}
        </button>
        {saved && (
          <span className="text-sm font-medium text-emerald-600">
            Configurações salvas
          </span>
        )}
        {error && (
          <span className="text-sm text-red-600">{error}</span>
        )}
      </div>
    </div>
  )
}
