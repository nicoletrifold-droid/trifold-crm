"use client"

import { useState } from "react"
import { Mail, MailX, Check } from "lucide-react"

/**
 * Story 75-210 — liga/desliga os e-mails de aprovação de obra do usuário
 * logado (aviso imediato, digest diário e lembrete 48h). Visível só para
 * admin/supervisor (quem recebe esses e-mails). Desligar NÃO esconde a aba
 * Aprovações — o e-mail é apenas o sino. Theme-aware (light/dark).
 */
export function AprovacaoEmailToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle() {
    const next = !enabled
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/me/preferencias", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notif_obra_aprovacao_email: next }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? "Erro ao salvar preferência")
      }
      setEnabled(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar preferência")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-5 py-4 shadow-sm dark:border-stone-800 dark:bg-stone-900">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50 dark:bg-orange-500/15">
          {enabled ? (
            <Mail className="h-5 w-5 text-orange-600 dark:text-orange-300" />
          ) : (
            <MailX className="h-5 w-5 text-gray-400 dark:text-stone-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-stone-100">
            E-mails de aprovação de obras
          </p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-stone-400">
            Avisos por e-mail quando houver foto ou documento aguardando sua aprovação
            (aviso imediato, resumo diário e lembrete de 48h). A aba Aprovações continua
            visível no sistema mesmo com os e-mails desativados.
          </p>

          <div className="mt-3">
            {enabled ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700 dark:bg-green-500/15 dark:text-green-300">
                  <Check className="h-3.5 w-3.5" /> Ativados
                </span>
                <button
                  onClick={() => void toggle()}
                  disabled={busy}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 disabled:opacity-50 dark:text-stone-400 dark:hover:text-stone-200"
                >
                  {busy ? "…" : "Desativar"}
                </button>
              </div>
            ) : (
              <button
                onClick={() => void toggle()}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
              >
                {busy ? "…" : "Reativar e-mails"}
              </button>
            )}
            {error && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
