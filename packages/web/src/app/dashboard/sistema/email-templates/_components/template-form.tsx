"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { VariableEditor, type TemplateVariable } from "./variable-editor"
import { PreviewModal } from "./preview-modal"

type Category = "transacional" | "campanha" | "automacao" | ""

interface TemplateData {
  id?: string
  name: string
  slug: string
  category: Category
  subject: string
  html_body: string
  variables: TemplateVariable[]
  is_active: boolean
}

interface Props {
  initialData?: TemplateData
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

function extractVariableKeys(text: string): string[] {
  const matches = [...text.matchAll(/\{\{(\w+)\}\}/g)]
  return [...new Set(matches.map((m) => m[1]!))]
}

export function TemplateForm({ initialData }: Props) {
  const router = useRouter()

  const [name, setName] = useState(initialData?.name ?? "")
  const [slug, setSlug] = useState(initialData?.slug ?? "")
  const [slugManual, setSlugManual] = useState(!!initialData?.slug)
  const [category, setCategory] = useState<Category>(initialData?.category ?? "")
  const [subject, setSubject] = useState(initialData?.subject ?? "")
  const [htmlBody, setHtmlBody] = useState(initialData?.html_body ?? "")
  const [variables, setVariables] = useState<TemplateVariable[]>(initialData?.variables ?? [])
  const [showPreview, setShowPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const detectedKeys = useMemo(
    () => extractVariableKeys(`${subject} ${htmlBody}`),
    [subject, htmlBody]
  )

  const syncedVariables = useMemo<TemplateVariable[]>(() => {
    const existing = new Map(variables.map((v) => [v.key, v]))
    return detectedKeys.map(
      (key) => existing.get(key) ?? { key, label: "", type: "text" as const, required: false }
    )
  }, [detectedKeys, variables])

  const handleNameChange = (value: string) => {
    setName(value)
    if (!slugManual) setSlug(slugify(value))
  }

  const handleSlugChange = (value: string) => {
    setSlug(value)
    setSlugManual(true)
  }

  const validate = (isActive: boolean): string | null => {
    if (!name.trim()) return "Nome é obrigatório"
    if (!category) return "Categoria é obrigatória"
    if (!subject.trim()) return "Assunto é obrigatório"
    if (!htmlBody.trim()) return "Corpo HTML é obrigatório"
    if (isActive) {
      const missing = syncedVariables.filter((v) => v.required && !v.label.trim())
      if (missing.length > 0)
        return `Variáveis obrigatórias sem label: ${missing.map((v) => v.key).join(", ")}`
    }
    return null
  }

  const save = async (isActive: boolean) => {
    const validationError = validate(isActive)
    if (validationError) {
      setError(validationError)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const url = initialData?.id
        ? `/api/admin/email-templates/${initialData.id}`
        : "/api/admin/email-templates"
      const method = initialData?.id ? "PUT" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug: slugify(slug) || slugify(name),
          category,
          subject,
          html_body: htmlBody,
          variables: syncedVariables,
          is_active: isActive,
        }),
      })

      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? "Erro ao salvar template")
      }

      router.push("/dashboard/sistema/email-templates")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Basic info */}
      <div className="space-y-4 rounded-lg border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-medium text-stone-700">Informações básicas</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">
              Nome <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Ex: Boas-vindas ao cliente"
              className="block w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-900 placeholder-stone-300 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">Slug</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="auto-gerado do nome"
              className="block w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-sm text-stone-600 placeholder-stone-300 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">
              Categoria <span className="text-red-500">*</span>
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className="block w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            >
              <option value="">Selecionar categoria</option>
              <option value="transacional">Transacional</option>
              <option value="campanha">Campanha</option>
              <option value="automacao">Automação</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-stone-600">
            Assunto <span className="text-red-500">*</span>
            <span className="ml-2 font-normal text-stone-400">{"Suporta {{variavel}}"}</span>
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={"Ex: Bem-vindo ao Trifold, {{nome}}!"}
            className="block w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-900 placeholder-stone-300 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>
      </div>

      {/* HTML body */}
      <div className="space-y-3 rounded-lg border border-stone-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-stone-700">
            Corpo HTML <span className="text-red-500">*</span>
            <span className="ml-2 text-xs font-normal text-stone-400">{"Suporta {{variavel}}"}</span>
          </h2>
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            disabled={!htmlBody}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-40"
          >
            Preview
          </button>
        </div>
        <textarea
          value={htmlBody}
          onChange={(e) => setHtmlBody(e.target.value)}
          rows={16}
          placeholder={"<p>Olá {{nome}}, bem-vindo!</p>"}
          spellCheck={false}
          className="block w-full resize-none rounded-lg border border-stone-200 px-3 py-2 font-mono text-xs text-stone-700 placeholder-stone-300 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        />
      </div>

      {/* Variables */}
      <div className="space-y-3 rounded-lg border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-medium text-stone-700">
          Variáveis detectadas
          {syncedVariables.length > 0 && (
            <span className="ml-2 text-xs font-normal text-stone-400">
              ({syncedVariables.length})
            </span>
          )}
        </h2>
        <VariableEditor variables={syncedVariables} onChange={setVariables} />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push("/dashboard/sistema/email-templates")}
          className="text-sm text-stone-500 hover:text-stone-700"
        >
          Cancelar
        </button>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => save(false)}
            disabled={saving}
            className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
          >
            Salvar Rascunho
          </button>
          <button
            type="button"
            onClick={() => save(true)}
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Publicando..." : "Publicar"}
          </button>
        </div>
      </div>

      {showPreview && (
        <PreviewModal
          htmlBody={htmlBody}
          variables={syncedVariables}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  )
}
