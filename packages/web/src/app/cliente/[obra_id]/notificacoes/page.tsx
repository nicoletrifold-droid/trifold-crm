"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"

interface NotifPrefs {
  email_enabled: boolean
  whatsapp_enabled: boolean
  push_enabled: boolean
  notify_nova_foto: boolean
  notify_novo_documento: boolean
  notify_nova_mensagem: boolean
  notify_progresso: boolean
}

const DEFAULT_PREFS: NotifPrefs = {
  email_enabled: true,
  whatsapp_enabled: false,
  push_enabled: false,
  notify_nova_foto: true,
  notify_novo_documento: true,
  notify_nova_mensagem: true,
  notify_progresso: true,
}

export default function NotificacoesPage() {
  const { obra_id } = useParams<{ obra_id: string }>()

  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS)
  const [phone, setPhone] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{
    type: "success" | "error"
    msg: string
  } | null>(null)

  useEffect(() => {
    fetch(`/api/cliente/obras/${obra_id}/notificacoes`)
      .then((r) => r.json())
      .then((data) => {
        if (data.prefs) setPrefs(data.prefs)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [obra_id])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFeedback(null)

    try {
      const res = await fetch(`/api/cliente/obras/${obra_id}/notificacoes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...prefs, phone: phone || undefined }),
      })

      const data = await res.json()

      if (!res.ok) {
        setFeedback({ type: "error", msg: data.error ?? "Erro ao salvar" })
        return
      }

      if (data.prefs) setPrefs(data.prefs)
      setFeedback({ type: "success", msg: "Preferências salvas!" })
    } catch {
      setFeedback({ type: "error", msg: "Erro de conexão" })
    } finally {
      setSaving(false)
    }
  }

  function toggle(field: keyof NotifPrefs) {
    setPrefs((prev) => ({ ...prev, [field]: !prev[field] }))
    setFeedback(null)
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-stone-500">Carregando preferências…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-6 text-xl font-bold text-stone-100">
        Notificações
      </h1>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Canais */}
        <section className="rounded-xl border border-stone-800 bg-stone-900 p-5">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-stone-400">
            Receber notificações via
          </h2>

          <div className="space-y-4">
            <label className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-stone-200">E-mail</p>
                <p className="text-xs text-stone-500">
                  Enviado para o seu e-mail cadastrado
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={prefs.email_enabled}
                onClick={() => toggle("email_enabled")}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors focus:outline-none ${
                  prefs.email_enabled ? "bg-[#F27A5E]" : "bg-stone-700"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 translate-y-0.5 transform rounded-full bg-white shadow transition-transform ${
                    prefs.email_enabled ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </label>

            <label className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-stone-200">WhatsApp</p>
                <p className="text-xs text-stone-500">
                  Mensagem no número informado abaixo
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={prefs.whatsapp_enabled}
                onClick={() => toggle("whatsapp_enabled")}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors focus:outline-none ${
                  prefs.whatsapp_enabled ? "bg-[#F27A5E]" : "bg-stone-700"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 translate-y-0.5 transform rounded-full bg-white shadow transition-transform ${
                    prefs.whatsapp_enabled
                      ? "translate-x-5"
                      : "translate-x-0.5"
                  }`}
                />
              </button>
            </label>

            {prefs.whatsapp_enabled && (
              <div className="mt-1 pl-0">
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+55 11 99999-9999"
                  className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-200 placeholder-stone-500 focus:border-[#F27A5E] focus:outline-none"
                />
                <p className="mt-1 text-xs text-stone-500">
                  Formato internacional, ex: +55 11 99999-9999
                </p>
              </div>
            )}

            <label className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-stone-200">Notificações push</p>
                <p className="text-xs text-stone-500">
                  No celular, via app instalado
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={prefs.push_enabled}
                onClick={() => toggle("push_enabled")}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors focus:outline-none ${
                  prefs.push_enabled ? "bg-[#F27A5E]" : "bg-stone-700"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 translate-y-0.5 transform rounded-full bg-white shadow transition-transform ${
                    prefs.push_enabled ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </label>
          </div>
        </section>

        {/* Tipos */}
        <section className="rounded-xl border border-stone-800 bg-stone-900 p-5">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-stone-400">
            Notificar quando
          </h2>

          <div className="space-y-4">
            {(
              [
                {
                  field: "notify_nova_foto" as const,
                  label: "Nova foto adicionada",
                },
                {
                  field: "notify_novo_documento" as const,
                  label: "Novo documento disponível",
                },
                {
                  field: "notify_nova_mensagem" as const,
                  label: "Nova mensagem da equipe",
                },
                {
                  field: "notify_progresso" as const,
                  label: "Progresso da obra atualizado",
                },
              ] as const
            ).map(({ field, label }) => (
              <label
                key={field}
                className="flex cursor-pointer items-center gap-3"
                onClick={() => toggle(field)}
              >
                <div
                  className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border ${
                    prefs[field]
                      ? "border-[#F27A5E] bg-[#F27A5E]"
                      : "border-stone-600 bg-stone-800"
                  }`}
                >
                  {prefs[field] && (
                    <svg
                      className="h-3 w-3 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </div>
                <span className="text-sm text-stone-200">{label}</span>
              </label>
            ))}
          </div>
        </section>

        {/* Feedback */}
        {feedback && (
          <p
            className={`text-sm ${
              feedback.type === "success" ? "text-green-400" : "text-red-400"
            }`}
          >
            {feedback.msg}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-[#F27A5E] px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Salvando…" : "Salvar preferências"}
        </button>
      </form>
    </div>
  )
}
