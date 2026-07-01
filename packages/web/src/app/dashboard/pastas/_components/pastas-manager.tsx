"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { FolderPlus, Copy, Check, ChevronRight } from "lucide-react"

interface PastaRow {
  id: string
  nome: string
  tipo: string
  empreendimento: string | null
  token: string
  total: number
  entregues: number
}

export function PastasManager({ pastas }: { pastas: PastaRow[] }) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  function linkFor(token: string): string {
    const origin = typeof window !== "undefined" ? window.location.origin : ""
    return `${origin}/pasta/${token}`
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(linkFor(token))
      setCopied(token)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Pastas</h1>
          <p className="text-sm text-gray-500 dark:text-stone-400">
            Documentos dos interessados — envie o link e acompanhe o que já foi entregue.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
        >
          <FolderPlus className="h-4 w-4" />
          Nova pasta
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-stone-800 dark:bg-stone-900">
        {pastas.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-gray-400 dark:text-stone-500">
            Nenhuma pasta ainda. Crie a primeira e envie o link ao interessado.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-stone-800">
            {pastas.map((p) => (
              <li key={p.id} className="flex items-center gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-gray-900 dark:text-stone-100">
                    {p.nome}{" "}
                    <span className="text-xs font-normal uppercase text-gray-400 dark:text-stone-500">
                      {p.tipo}
                    </span>
                  </p>
                  <p className="truncate text-xs text-gray-500 dark:text-stone-400">
                    {p.empreendimento ? `${p.empreendimento} · ` : ""}
                    {p.entregues}/{p.total} documentos entregues
                  </p>
                </div>
                <button
                  onClick={() => copy(p.token)}
                  className="flex shrink-0 items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
                  title="Copiar link para o interessado"
                >
                  {copied === p.token ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied === p.token ? "Copiado" : "Copiar link"}
                </button>
                <Link
                  href={`/dashboard/pastas/${p.id}`}
                  className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-orange-600 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-500/10"
                >
                  Abrir <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {creating && (
        <CreateModal
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); router.refresh() }}
        />
      )}
    </div>
  )
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [nome, setNome] = useState("")
  const [tipo, setTipo] = useState<"pf" | "pj">("pf")
  const [casado, setCasado] = useState(false)
  const [empreendimento, setEmpreendimento] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!nome.trim()) { setError("Informe o nome do interessado."); return }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/pastas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim(), tipo, casado, empreendimento: empreendimento.trim() }),
      })
      if (res.ok) {
        onCreated()
      } else {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? "Não foi possível criar a pasta.")
        setLoading(false)
      }
    } catch {
      setError("Não foi possível criar a pasta.")
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-stone-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-900 dark:text-stone-100">Nova pasta</h2>
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-xs text-gray-500 dark:text-stone-400">Nome do interessado</span>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500 dark:text-stone-400">Empreendimento (opcional)</span>
            <input
              value={empreendimento}
              onChange={(e) => setEmpreendimento(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500 dark:text-stone-400">Tipo</span>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as "pf" | "pj")}
              className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
            >
              <option value="pf">Pessoa física</option>
              <option value="pj">Pessoa jurídica</option>
            </select>
          </label>
          {tipo === "pf" && (
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-stone-300">
              <input type="checkbox" checked={casado} onChange={(e) => setCasado(e.target.checked)} />
              Casado(a) — inclui documentos do cônjuge
            </label>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 dark:text-stone-400 dark:hover:bg-stone-800">
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className="rounded-md bg-orange-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60"
          >
            {loading ? "Criando..." : "Criar pasta"}
          </button>
        </div>
      </div>
    </div>
  )
}
