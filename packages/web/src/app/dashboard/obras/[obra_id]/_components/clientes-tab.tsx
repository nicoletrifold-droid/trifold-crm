"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { UserPlus, Trash2, Star, Pencil, Check, X } from "lucide-react"

interface Cliente {
  id: string
  name: string
  email: string
  is_primary: boolean
  numero_unidade: string | null
}

interface ClientesTabProps {
  obraId: string
  clientes: Cliente[]
}

export function ClientesTab({ obraId, clientes }: ClientesTabProps) {
  const router = useRouter()

  // Formulário A: criar novo cliente
  const [nomeA, setNomeA] = useState("")
  const [emailA, setEmailA] = useState("")
  const [senhaA, setSenhaA] = useState("")
  const [unidadeA, setUnidadeA] = useState("")
  const [savingA, setSavingA] = useState(false)
  const [errorA, setErrorA] = useState<string | null>(null)

  // Formulário B: vincular existente por email
  const [emailB, setEmailB] = useState("")
  const [unidadeB, setUnidadeB] = useState("")
  const [savingB, setSavingB] = useState(false)
  const [errorB, setErrorB] = useState<string | null>(null)

  // Edição inline de unidade na lista
  const [editingUnidade, setEditingUnidade] = useState<string | null>(null)
  const [unidadeInput, setUnidadeInput] = useState("")
  const [savingUnidade, setSavingUnidade] = useState(false)

  async function handleCreateCliente(e: React.FormEvent) {
    e.preventDefault()
    if (!nomeA.trim() || !emailA.trim() || !senhaA) return
    setErrorA(null)
    setSavingA(true)
    try {
      const res = await fetch(`/api/admin/obras/${obraId}/clientes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nomeA.trim(),
          email: emailA.trim(),
          senha_temporaria: senhaA,
          numero_unidade: unidadeA.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? "Erro ao criar cliente")
      }
      setNomeA("")
      setEmailA("")
      setSenhaA("")
      setUnidadeA("")
      router.refresh()
    } catch (err) {
      setErrorA(err instanceof Error ? err.message : "Erro ao criar cliente")
    } finally {
      setSavingA(false)
    }
  }

  async function handleVincularCliente(e: React.FormEvent) {
    e.preventDefault()
    if (!emailB.trim()) return
    setErrorB(null)
    setSavingB(true)
    try {
      const res = await fetch(`/api/admin/obras/${obraId}/clientes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailB.trim(),
          numero_unidade: unidadeB.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? "Erro ao vincular cliente")
      }
      setEmailB("")
      setUnidadeB("")
      router.refresh()
    } catch (err) {
      setErrorB(err instanceof Error ? err.message : "Erro ao vincular cliente")
    } finally {
      setSavingB(false)
    }
  }

  async function handleDesvincular(userId: string) {
    if (!window.confirm("Desvincular este cliente da obra?")) return
    try {
      const res = await fetch(
        `/api/admin/obras/${obraId}/clientes/${userId}`,
        { method: "DELETE" }
      )
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? "Erro ao desvincular")
      }
      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao desvincular")
    }
  }

  function startEditUnidade(cliente: Cliente) {
    setEditingUnidade(cliente.id)
    setUnidadeInput(cliente.numero_unidade ?? "")
  }

  function cancelEditUnidade() {
    setEditingUnidade(null)
    setUnidadeInput("")
  }

  async function handleSalvarUnidade(userId: string) {
    setSavingUnidade(true)
    try {
      const res = await fetch(`/api/admin/obras/${obraId}/clientes/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero_unidade: unidadeInput.trim() || null }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? "Erro ao salvar unidade")
      }
      setEditingUnidade(null)
      setUnidadeInput("")
      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao salvar unidade")
    } finally {
      setSavingUnidade(false)
    }
  }

  const inputCls =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"

  return (
    <div className="space-y-5">
      {/* Lista de clientes vinculados */}
      <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-stone-400">
          Clientes Vinculados ({clientes.length})
        </h2>
        {clientes.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500 dark:text-stone-400">
            Nenhum cliente vinculado a esta obra.
          </p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-stone-800">
            {clientes.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-stone-100">
                      {c.name}
                    </p>
                    {c.is_primary && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
                        <Star className="h-3 w-3" />
                        Principal
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-stone-400">{c.email}</p>
                  {/* Número de unidade — display ou edição inline */}
                  {editingUnidade === c.id ? (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <input
                        type="text"
                        value={unidadeInput}
                        onChange={(e) => setUnidadeInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSalvarUnidade(c.id)
                          if (e.key === "Escape") cancelEditUnidade()
                        }}
                        placeholder="Ex: 203"
                        autoFocus
                        className="w-28 rounded border border-gray-300 px-2 py-0.5 text-xs focus:border-orange-500 focus:outline-none dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
                      />
                      <button
                        onClick={() => handleSalvarUnidade(c.id)}
                        disabled={savingUnidade}
                        className="rounded p-0.5 text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-500/15"
                        title="Salvar"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={cancelEditUnidade}
                        className="rounded p-0.5 text-gray-400 hover:bg-gray-100 dark:text-stone-500 dark:hover:bg-stone-800"
                        title="Cancelar"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    c.numero_unidade && (
                      <p className="mt-0.5 text-xs text-gray-400 dark:text-stone-500">
                        Unidade {c.numero_unidade}
                      </p>
                    )
                  )}
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  {editingUnidade !== c.id && (
                    <button
                      onClick={() => startEditUnidade(c)}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-300"
                      title="Editar unidade"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDesvincular(c.id)}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:text-stone-500 dark:hover:bg-red-500/15 dark:hover:text-red-300"
                    title="Desvincular"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Formulário A: Criar novo cliente */}
      <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-stone-400">
          Criar novo cliente
        </h2>
        <form onSubmit={handleCreateCliente} className="space-y-3">
          <input
            type="text"
            placeholder="Nome completo *"
            value={nomeA}
            onChange={(e) => setNomeA(e.target.value)}
            required
            className={inputCls}
          />
          <input
            type="email"
            placeholder="Email *"
            value={emailA}
            onChange={(e) => setEmailA(e.target.value)}
            required
            className={inputCls}
          />
          <input
            type="password"
            placeholder="Senha temporária *"
            value={senhaA}
            onChange={(e) => setSenhaA(e.target.value)}
            required
            className={inputCls}
          />
          <input
            type="text"
            placeholder="Nº da unidade / apartamento (opcional)"
            value={unidadeA}
            onChange={(e) => setUnidadeA(e.target.value)}
            className={inputCls}
          />
          {errorA && <p className="text-xs text-red-600 dark:text-red-300">{errorA}</p>}
          <button
            type="submit"
            disabled={savingA || !nomeA.trim() || !emailA.trim() || !senhaA}
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
          >
            <UserPlus className="h-4 w-4" />
            {savingA ? "Criando..." : "Criar e Vincular"}
          </button>
        </form>
      </section>

      {/* Formulário B: Vincular existente por email */}
      <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-stone-400">
          Vincular cliente existente
        </h2>
        <form onSubmit={handleVincularCliente} className="space-y-3">
          <input
            type="email"
            placeholder="Email do cliente *"
            value={emailB}
            onChange={(e) => setEmailB(e.target.value)}
            required
            className={inputCls}
          />
          <input
            type="text"
            placeholder="Nº da unidade / apartamento (opcional)"
            value={unidadeB}
            onChange={(e) => setUnidadeB(e.target.value)}
            className={inputCls}
          />
          {errorB && <p className="text-xs text-red-600 dark:text-red-300">{errorB}</p>}
          <button
            type="submit"
            disabled={savingB || !emailB.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 disabled:opacity-50 dark:border-orange-400 dark:text-orange-300 dark:hover:bg-orange-500/15"
          >
            {savingB ? "Vinculando..." : "Vincular"}
          </button>
        </form>
      </section>
    </div>
  )
}
