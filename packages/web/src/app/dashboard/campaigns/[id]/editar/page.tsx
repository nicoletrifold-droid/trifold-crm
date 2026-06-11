"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { EmailEditorModal } from "../../_components/email-editor-modal"

export default function EditarCampanhaPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [emailBodyHtml, setEmailBodyHtml] = useState<string | null>(null)
  const [emailBodyJson, setEmailBodyJson] = useState<object | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [campaign, setCampaign] = useState<any>(null)

  useEffect(() => {
    fetch(`/api/campaigns/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setCampaign(d.data)
        setEmailBodyHtml(d.data?.email_body_html ?? null)
        setEmailBodyJson(d.data?.email_body_json ?? null)
        setLoading(false)
      })
  }, [id])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setError("")
    const form = new FormData(e.currentTarget)
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          description: form.get("description"),
          starts_at: form.get("starts_at"),
          ends_at: form.get("ends_at"),
          whatsapp_template_name: form.get("whatsapp_template_name") || null,
          email_enabled: form.get("email_enabled") === "on",
          email_subject: form.get("email_subject") || null,
          email_body_html: emailBodyHtml || null,
          email_body_json: emailBodyJson,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? "Erro ao salvar")
        return
      }
      router.push(`/dashboard/campaigns/${id}`)
    } catch {
      setError("Erro de conexao")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-gray-400 dark:text-stone-500">Carregando...</p>
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-red-500 dark:text-red-300">Campanha nao encontrada</p>
      </div>
    )
  }

  const toDateInput = (d: string) => d?.slice(0, 10) ?? ""

  return (
    <div className="space-y-6">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Editar Campanha</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-stone-400">Slug: {campaign.slug} (nao editavel)</p>
      </div>

      {error && (
        <div className="mx-auto max-w-2xl rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Dados básicos */}
        <div className="mx-auto max-w-2xl rounded-lg bg-white p-6 shadow-sm space-y-4 dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">Nome *</label>
            <input name="name" defaultValue={campaign.name} required className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">Descricao</label>
            <textarea name="description" defaultValue={campaign.description ?? ""} rows={3} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">Inicio</label>
              <input name="starts_at" type="date" defaultValue={toDateInput(campaign.starts_at)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">Encerramento</label>
              <input name="ends_at" type="date" defaultValue={toDateInput(campaign.ends_at)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500" />
            </div>
          </div>
        </div>

        {/* Confirmações (WhatsApp + email config — sem o editor) */}
        <div className="mx-auto max-w-2xl rounded-lg bg-white p-6 shadow-sm space-y-4 dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <h2 className="text-sm font-semibold text-gray-700 uppercase dark:text-stone-300">Confirmacoes</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">Template WhatsApp</label>
            <input name="whatsapp_template_name" defaultValue={campaign.whatsapp_template_name ?? ""} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500" />
          </div>

          <div className="flex items-center gap-2">
            <input name="email_enabled" type="checkbox" defaultChecked={campaign.email_enabled} className="rounded border-gray-300 dark:border-stone-600" />
            <label className="text-sm text-gray-700 dark:text-stone-300">E-mail habilitado</label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">Assunto</label>
            <input name="email_subject" defaultValue={campaign.email_subject ?? ""} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500" />
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
          <button type="submit" disabled={saving} className="rounded-md bg-orange-600 px-6 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50">
            {saving ? "Salvando..." : "Salvar alteracoes"}
          </button>
          <button type="button" onClick={() => router.back()} className="rounded-md border border-gray-300 px-6 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800">
            Cancelar
          </button>
        </div>
      </form>

      <EmailEditorModal
        isOpen={isEditorOpen}
        campaignId={id}
        campaignName={campaign?.name}
        initialDesign={emailBodyJson}
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
