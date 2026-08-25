"use client"

/**
 * Story 900-22 — wizard de provisionamento.
 *
 * Nome e slug apenas. **Sem seleção de plano ou módulos**, e isso é deliberado: `plans` e
 * `org_module_grants` só existem a partir da Onda 3. Antecipar os campos aqui criaria
 * dependência de artefato que ainda não existe — o defeito que a validação do @po apontou
 * no epic.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"

function slugify(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export default function NovaOrgPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugEditado, setSlugEditado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const slugFinal = slugEditado ? slug : slugify(name)

  async function submeter(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      const res = await fetch("/api/platform/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug: slugFinal }),
      })
      const json = await res.json()
      if (!res.ok) {
        setErro(json.message ?? json.error ?? "Falha ao provisionar")
        return
      }
      router.push("/platform/orgs")
      router.refresh()
    } catch {
      setErro("Erro de rede")
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="max-w-lg">
      <h1 className="mb-1 text-xl font-semibold">Nova empresa</h1>
      <p className="mb-6 text-sm text-slate-400">
        Cria a organização com roles, permissões e as etapas do Kanban. O plano é definido
        depois.
      </p>

      <form onSubmit={submeter} className="space-y-5">
        <div>
          <label className="mb-1 block text-sm text-slate-300" htmlFor="name">
            Nome da empresa
          </label>
          <input
            id="name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Imóveis"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-amber-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-slate-300" htmlFor="slug">
            Identificador
          </label>
          <input
            id="slug"
            value={slugFinal}
            onChange={(e) => {
              setSlugEditado(true)
              setSlug(e.target.value)
            }}
            placeholder="acme-imoveis"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm outline-none focus:border-amber-500"
          />
          <p className="mt-1 text-xs text-slate-500">
            Minúsculas, números e hífen. Gerado a partir do nome — edite se precisar.
          </p>
        </div>

        {erro && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {erro}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={!name.trim() || enviando}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-40"
          >
            {enviando ? "Provisionando…" : "Criar empresa"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/platform/orgs")}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-900"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
