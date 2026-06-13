"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { EmailEditorModal } from "../_components/email-editor-modal"

interface DiscoveredField {
  questionId: string
  title: string
  suggestedTarget: string
}

export default function NovaCampanhaPage() {
  const router = useRouter()
  const [pendingId] = useState(() => crypto.randomUUID())
  const [loading, setLoading] = useState(false)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [emailBodyHtml, setEmailBodyHtml] = useState<string | null>(null)
  const [emailBodyJson, setEmailBodyJson] = useState<object | null>(null)
  const [discovering, setDiscovering] = useState(false)
  const [fields, setFields] = useState<DiscoveredField[]>([])
  const [fieldMapping, setFieldMapping] = useState<Record<string, { target: string; label: string }>>({})
  const [formUrl, setFormUrl] = useState("")
  const [error, setError] = useState("")

  async function handleDiscoverFields() {
    if (!formUrl) return
    setDiscovering(true)
    setError("")
    try {
      const res = await fetch("/api/campaigns/discover-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form_url: formUrl }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Erro ao detectar campos")
        return
      }
      setFields(data.data.fields)
      const mapping: Record<string, { target: string; label: string }> = {}
      for (const f of data.data.fields) {
        mapping[f.questionId] = { target: f.suggestedTarget, label: f.title }
      }
      setFieldMapping(mapping)
    } catch {
      setError("Erro de conexao")
    } finally {
      setDiscovering(false)
    }
  }

  function updateFieldTarget(questionId: string, target: string) {
    setFieldMapping((prev) => ({
      ...prev,
      [questionId]: { ...prev[questionId]!, target },
    }))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError("")
    const form = new FormData(e.currentTarget)
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_id: pendingId,
          name: form.get("name"),
          description: form.get("description"),
          property_id: form.get("property_id") || null,
          starts_at: form.get("starts_at"),
          ends_at: form.get("ends_at"),
          form_url: formUrl,
          whatsapp_template_name: form.get("whatsapp_template_name") || null,
          email_enabled: form.get("email_enabled") === "on",
          email_subject: form.get("email_subject") || null,
          email_body_html: emailBodyHtml || null,
          email_body_json: emailBodyJson,
          field_mapping: fieldMapping,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Erro ao criar campanha")
        return
      }
      router.push(`/dashboard/campaigns/${data.data.id}`)
    } catch {
      setError("Erro de conexao")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Nova Campanha</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-stone-400">
          Configure uma nova acao de marketing
        </p>
      </div>

      {error && (
        <div className="mx-auto max-w-2xl rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="mx-auto max-w-2xl rounded-lg bg-white p-6 shadow-sm space-y-4 dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <h2 className="text-sm font-semibold text-gray-700 uppercase dark:text-stone-300">Informacoes basicas</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">Nome da acao *</label>
            <input name="name" required className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500" placeholder="Ex: Concurso Vind — Supermuffato" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">Descricao / Contexto *</label>
            <textarea name="description" required rows={3} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500" placeholder="Descreva o objetivo e contexto da acao..." />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">Data inicio *</label>
              <input name="starts_at" type="date" required className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">Data encerramento *</label>
              <input name="ends_at" type="date" required className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500" />
            </div>
          </div>
        </div>

        {/* Google Forms */}
        <div className="mx-auto max-w-2xl rounded-lg bg-white p-6 shadow-sm space-y-4 dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <h2 className="text-sm font-semibold text-gray-700 uppercase dark:text-stone-300">Google Forms</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">URL do Google Forms</label>
            <div className="mt-1 flex gap-2">
              <input
                type="url"
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
                placeholder="https://docs.google.com/forms/d/..."
              />
              <button
                type="button"
                onClick={handleDiscoverFields}
                disabled={discovering || !formUrl}
                className="rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 dark:bg-stone-700 dark:hover:bg-stone-600"
              >
                {discovering ? "Detectando..." : "Detectar campos"}
              </button>
            </div>
          </div>

          {fields.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-stone-300">Mapeamento de campos</h3>
              <div className="rounded-md border border-gray-200 dark:border-stone-800">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-stone-800">
                  <thead className="bg-gray-50 dark:bg-stone-800/50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-stone-400">Pergunta do Forms</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-stone-400">Mapear para</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-stone-800">
                    {fields.map((f) => (
                      <tr key={f.questionId}>
                        <td className="px-3 py-2 text-sm text-gray-900 dark:text-stone-100">{f.title}</td>
                        <td className="px-3 py-2">
                          <select
                            value={fieldMapping[f.questionId]?.target ?? f.suggestedTarget}
                            onChange={(e) => updateFieldTarget(f.questionId, e.target.value)}
                            className="rounded-md border border-gray-300 px-2 py-1 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
                          >
                            <option value="name">Nome (obrigatorio)</option>
                            <option value="phone">WhatsApp (obrigatorio)</option>
                            <option value="email">E-mail (obrigatorio)</option>
                            <option value={`custom:${f.questionId}`}>Campo personalizado</option>
                            <option value="ignore">Ignorar</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Confirmações (WhatsApp + email config — sem o editor) */}
        <div className="mx-auto max-w-2xl rounded-lg bg-white p-6 shadow-sm space-y-4 dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <h2 className="text-sm font-semibold text-gray-700 uppercase dark:text-stone-300">Confirmacoes automaticas</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">Template WhatsApp (nome do template Meta)</label>
            <input name="whatsapp_template_name" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500" placeholder="Ex: concurso_vind_confirmacao" />
          </div>

          <div className="flex items-center gap-2">
            <input name="email_enabled" type="checkbox" defaultChecked className="rounded border-gray-300 dark:border-stone-600" />
            <label className="text-sm font-medium text-gray-700 dark:text-stone-300">Enviar e-mail de confirmacao</label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">Assunto do e-mail</label>
            <input name="email_subject" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500" placeholder="Ex: Cadastro confirmado — Concurso Vind Residence" />
          </div>
        </div>

        {/* Editor de e-mail */}
        <div className="mx-auto max-w-2xl rounded-lg bg-white p-6 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-semibold text-gray-700 dark:text-stone-300">Corpo do e-mail</span>
              {emailBodyHtml ? (
                <p className="mt-0.5 text-xs text-green-600 dark:text-green-400">Template configurado</p>
              ) : (
                <p className="mt-0.5 text-xs text-gray-400 dark:text-stone-500">Nenhum template configurado</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsEditorOpen(true)}
              className="rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 dark:bg-stone-700 dark:hover:bg-stone-600"
            >
              {emailBodyHtml ? "Editar template" : "Criar template"}
            </button>
          </div>
        </div>

        {/* Ações */}
        <div className="mx-auto max-w-2xl flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-orange-600 px-6 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {loading ? "Salvando..." : "Salvar campanha"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-md border border-gray-300 px-6 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            Cancelar
          </button>
        </div>
      </form>

      <EmailEditorModal
        isOpen={isEditorOpen}
        campaignId={pendingId}
        onClose={() => setIsEditorOpen(false)}
        onSave={(html, design) => {
          setEmailBodyHtml(html)
          setEmailBodyJson(design)
          setIsEditorOpen(false)
        }}
      />
    </div>
  )
}
