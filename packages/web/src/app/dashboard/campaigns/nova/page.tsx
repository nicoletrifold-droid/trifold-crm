"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

interface DiscoveredField {
  questionId: string
  title: string
  suggestedTarget: string
}

export default function NovaCampanhaPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
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
      [questionId]: { ...prev[questionId], target },
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
          name: form.get("name"),
          description: form.get("description"),
          property_id: form.get("property_id") || null,
          starts_at: form.get("starts_at"),
          ends_at: form.get("ends_at"),
          form_url: formUrl,
          whatsapp_template_name: form.get("whatsapp_template_name") || null,
          email_enabled: form.get("email_enabled") === "on",
          email_subject: form.get("email_subject") || null,
          email_body_html: form.get("email_body_html") || null,
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
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Nova Campanha</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure uma nova acao de marketing
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="rounded-lg bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase">Informacoes basicas</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700">Nome da acao *</label>
            <input name="name" required className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="Ex: Concurso Vind — Supermuffato" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Descricao / Contexto *</label>
            <textarea name="description" required rows={3} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="Descreva o objetivo e contexto da acao..." />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Data inicio *</label>
              <input name="starts_at" type="date" required className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Data encerramento *</label>
              <input name="ends_at" type="date" required className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </div>
        </div>

        {/* Google Forms */}
        <div className="rounded-lg bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase">Google Forms</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700">URL do Google Forms</label>
            <div className="mt-1 flex gap-2">
              <input
                type="url"
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="https://docs.google.com/forms/d/..."
              />
              <button
                type="button"
                onClick={handleDiscoverFields}
                disabled={discovering || !formUrl}
                className="rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
              >
                {discovering ? "Detectando..." : "Detectar campos"}
              </button>
            </div>
          </div>

          {fields.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-gray-700">Mapeamento de campos</h3>
              <div className="rounded-md border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Pergunta do Forms</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Mapear para</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {fields.map((f) => (
                      <tr key={f.questionId}>
                        <td className="px-3 py-2 text-sm text-gray-900">{f.title}</td>
                        <td className="px-3 py-2">
                          <select
                            value={fieldMapping[f.questionId]?.target ?? f.suggestedTarget}
                            onChange={(e) => updateFieldTarget(f.questionId, e.target.value)}
                            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
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

        {/* Confirmations */}
        <div className="rounded-lg bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase">Confirmacoes automaticas</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700">Template WhatsApp (nome do template Meta)</label>
            <input name="whatsapp_template_name" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="Ex: concurso_vind_confirmacao" />
          </div>

          <div className="flex items-center gap-2">
            <input name="email_enabled" type="checkbox" defaultChecked className="rounded border-gray-300" />
            <label className="text-sm font-medium text-gray-700">Enviar e-mail de confirmacao</label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Assunto do e-mail</label>
            <input name="email_subject" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="Ex: Cadastro confirmado — Concurso Vind Residence" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Corpo do e-mail (HTML)</label>
            <textarea name="email_body_html" rows={5} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono" placeholder="<p>Ola, {{nome}}! Seu cadastro foi confirmado...</p>" />
          </div>
        </div>

        <div className="flex gap-3">
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
            className="rounded-md border border-gray-300 px-6 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
