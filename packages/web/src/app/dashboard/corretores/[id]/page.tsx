"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

interface BrokerData {
  id: string
  creci: string | null
  type: string
  is_available: boolean
  max_leads: number
  user: {
    id: string
    name: string
    email: string
    is_active: boolean
  }
}

interface Property {
  id: string
  name: string
}

export default function EditCorretorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const router = useRouter()
  const [broker, setBroker] = useState<BrokerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [brokerId, setBrokerId] = useState("")
  const [properties, setProperties] = useState<Property[]>([])
  const [assignedProperties, setAssignedProperties] = useState<string[]>([])
  const [assignLoading, setAssignLoading] = useState(false)

  useEffect(() => {
    params.then((p) => {
      setBrokerId(p.id)
      // Load broker
      fetch(`/api/brokers/${p.id}`)
        .then((r) => r.json())
        .then((d) => {
          setBroker(d.data)
          setLoading(false)
        })
        .catch(() => setLoading(false))
      // Load properties
      fetch("/api/properties")
        .then((r) => r.json())
        .then((d) => setProperties(d.data ?? []))
        .catch(() => {})
      // Load assignments
      fetch(`/api/brokers/${p.id}/assignments`)
        .then((r) => r.json())
        .then((d) => setAssignedProperties((d.data ?? []).map((a: { property_id: string }) => a.property_id)))
        .catch(() => {})
    })
  }, [params])

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setMessage("")

    const form = new FormData(e.currentTarget)

    const res = await fetch(`/api/brokers/${brokerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creci: form.get("creci") || null,
        type: form.get("type"),
        max_leads: parseInt(form.get("max_leads") as string, 10) || 50,
        is_available: form.get("is_available") === "on",
      }),
    })

    if (res.ok) {
      setMessage("Salvo com sucesso!")
      setTimeout(() => router.push("/dashboard/corretores"), 1000)
    } else {
      setMessage("Erro ao salvar")
    }
    setSaving(false)
  }

  async function handleToggleActive() {
    if (!broker) return
    const newActive = !broker.user.is_active
    const action = newActive ? "reativar" : "desativar"
    if (!confirm(`Tem certeza que deseja ${action} este corretor? ${!newActive ? "Ele perderá acesso ao sistema mas o histórico será mantido." : ""}`)) return

    await fetch(`/api/users/${broker.user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: newActive }),
    })

    router.refresh()
    router.push("/dashboard/corretores")
  }

  if (loading) return <div className="p-8 text-stone-400 dark:text-stone-500">Carregando...</div>
  if (!broker) return <div className="p-8 text-red-500 dark:text-red-300">Corretor não encontrado</div>

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/corretores" className="text-sm text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200">
          &larr; Corretores
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-stone-900 dark:text-stone-100">Editar Corretor</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{broker.user.name} — {broker.user.email}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Dados do corretor */}
        <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <h2 className="mb-4 text-lg font-semibold text-stone-900 dark:text-stone-100">Dados profissionais</h2>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-stone-300">CRECI</label>
              <input
                name="creci"
                type="text"
                defaultValue={broker.creci ?? ""}
                className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500 dark:focus:bg-stone-800"
                placeholder="Ex: 12345-PR"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-stone-300">Tipo</label>
              <select
                name="type"
                defaultValue={broker.type}
                className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500 dark:focus:bg-stone-800"
              >
                <option value="internal">Interno</option>
                <option value="external">Externo</option>
                <option value="partner">Parceiro</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-stone-300">Limite de leads</label>
              <input
                name="max_leads"
                type="number"
                defaultValue={broker.max_leads ?? 50}
                min={1}
                max={500}
                className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500 dark:focus:bg-stone-800"
              />
            </div>

            <div>
              <label className="flex items-center gap-2.5">
                <input
                  name="is_available"
                  type="checkbox"
                  defaultChecked={broker.is_available}
                  className="h-4 w-4 rounded border-stone-300 text-orange-600 focus:ring-orange-500 dark:border-stone-600"
                />
                <span className="text-sm text-stone-700 dark:text-stone-300">Disponível para receber novos leads</span>
              </label>
            </div>

            {message && (
              <p className={`text-sm ${message.includes("Erro") ? "text-red-600 dark:text-red-300" : "text-green-600 dark:text-green-300"}`}>{message}</p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar alterações"}
            </button>
          </form>
        </div>

        {/* Empreendimentos + Status */}
        <div className="space-y-4">
          {/* Empreendimentos vinculados */}
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-stone-900">Empreendimentos vinculados</h2>
            <p className="mb-3 text-xs text-stone-500 dark:text-stone-400">
              Clique para vincular ou desvincular. Leads desses empreendimentos serão direcionados automaticamente para este corretor.
            </p>
            <div className="flex flex-wrap gap-2">
              {properties.map((p) => {
                const assigned = assignedProperties.includes(p.id)
                return (
                  <button
                    key={p.id}
                    disabled={assignLoading}
                    onClick={async () => {
                      setAssignLoading(true)
                      await fetch(`/api/brokers/${brokerId}/assignments`, {
                        method: assigned ? "DELETE" : "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ property_id: p.id }),
                      })
                      setAssignedProperties(
                        assigned
                          ? assignedProperties.filter((id) => id !== p.id)
                          : [...assignedProperties, p.id]
                      )
                      setAssignLoading(false)
                    }}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                      assigned
                        ? "bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/20"
                        : "bg-stone-100 text-stone-400 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-500 dark:hover:bg-stone-700"
                    }`}
                  >
                    {p.name} {assigned ? "✓" : ""}
                  </button>
                )
              })}
              {properties.length === 0 && (
                <p className="text-sm text-stone-400 dark:text-stone-500">Nenhum empreendimento cadastrado</p>
              )}
            </div>
          </div>

          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-stone-900">Status</h2>
            <div className="flex items-center gap-3">
              <span className={`rounded-full px-3 py-1 text-sm font-medium ${
                broker.user.is_active ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300" : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
              }`}>
                {broker.user.is_active ? "Ativo" : "Desativado"}
              </span>
              <p className="text-sm text-stone-500 dark:text-stone-400">
                {broker.user.is_active
                  ? "O corretor tem acesso ao sistema e pode receber leads."
                  : "O corretor está desativado. Não recebe novos leads mas o histórico é mantido."}
              </p>
            </div>
          </div>

          <div className="rounded-xl border-2 border-dashed border-stone-200 p-6 dark:border-stone-800">
            <h2 className="mb-2 text-sm font-semibold text-stone-700 dark:text-stone-300">
              {broker.user.is_active ? "Desativar corretor" : "Reativar corretor"}
            </h2>
            <p className="mb-4 text-xs text-stone-500 dark:text-stone-400">
              {broker.user.is_active
                ? "O corretor perderá acesso ao sistema. Os leads designados a ele e o histórico completo serão mantidos para consulta."
                : "O corretor voltará a ter acesso ao sistema e poderá receber novos leads."}
            </p>
            <button
              onClick={handleToggleActive}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                broker.user.is_active
                  ? "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-500/15 dark:text-red-300 dark:hover:bg-red-500/20"
                  : "bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-500/15 dark:text-green-300 dark:hover:bg-green-500/20"
              }`}
            >
              {broker.user.is_active ? "Desativar corretor" : "Reativar corretor"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
