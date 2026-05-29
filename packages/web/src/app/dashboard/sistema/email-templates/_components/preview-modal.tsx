"use client"

import { useState, useEffect } from "react"
import { X } from "lucide-react"
import type { TemplateVariable } from "./variable-editor"

interface Props {
  htmlBody: string
  variables: TemplateVariable[]
  onClose: () => void
}

export function PreviewModal({ htmlBody, variables, onClose }: Props) {
  const [html, setHtml] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const previewVars: Record<string, string> = {}
    for (const v of variables) {
      if (v.label) previewVars[v.key] = `${v.label} (exemplo)`
    }

    fetch("/api/admin/email-templates/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html_body: htmlBody, variables: previewVars }),
    })
      .then((res) => res.json())
      .then((data: { html?: string; error?: string }) => {
        if (data.html) setHtml(data.html)
        else setError(data.error ?? "Erro ao gerar preview")
      })
      .catch(() => setError("Erro de rede"))
      .finally(() => setLoading(false))
  }, [htmlBody, variables])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-[80vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-stone-800">
          <h2 className="text-sm font-medium text-stone-900 dark:text-stone-100">Preview do Template</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800"
            aria-label="Fechar preview"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {loading && (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-stone-400">Carregando preview...</p>
            </div>
          )}
          {error && (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-red-500">{error}</p>
            </div>
          )}
          {html && (
            <iframe
              srcDoc={html}
              className="h-full w-full border-0"
              title="Email Preview"
              sandbox="allow-same-origin"
            />
          )}
        </div>
      </div>
    </div>
  )
}
