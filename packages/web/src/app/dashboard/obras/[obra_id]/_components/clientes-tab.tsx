"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { UserPlus, Trash2, Star } from "lucide-react"

interface Cliente {
  id: string
  name: string
  email: string
  is_primary: boolean
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
  const [savingA, setSavingA] = useState(false)
  const [errorA, setErrorA] = useState<string | null>(null)

  // Formulário B: vincular existente por email
  const [emailB, setEmailB] = useState("")
  const [savingB, setSavingB] = useState(false)
  const [errorB, setErrorB] = useState<string | null>(null)

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
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? "Erro ao criar cliente")
      }
      setNomeA("")
      setEmailA("")
      setSenhaA("")
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
        body: JSON.stringify({ email: emailB.trim() }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? "Erro ao vincular cliente")
      }
      setEmailB("")
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
                </div>
                <button
                  onClick={() => handleDesvincular(c.id)}
                  className="flex-shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:text-stone-500 dark:hover:bg-red-500/15 dark:hover:text-red-300"
                  title="Desvincular"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
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
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
          />
          <input
            type="email"
            placeholder="Email *"
            value={emailA}
            onChange={(e) => setEmailA(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
          />
          <input
            type="password"
            placeholder="Senha temporária *"
            value={senhaA}
            onChange={(e) => setSenhaA(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
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
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
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
