"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

interface Property {
  id: string
  name: string
}

export default function NovoCorretorPage() {
  const router = useRouter()

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [creci, setCreci] = useState("")
  const [type, setType] = useState<"internal" | "external">("internal")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [properties, setProperties] = useState<Property[]>([])
  const [selectedProperties, setSelectedProperties] = useState<string[]>([])

  useEffect(() => {
    fetch("/api/properties").then(r => r.json()).then(d => {
      setProperties(d.data ?? [])
    }).catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)

    try {
      const res = await fetch("/api/brokers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          password,
          creci: creci.trim() || null,
          type,
        }),
      })

      if (!res.ok) {
        const json = await res.json()
        setError(json.error || "Erro ao criar corretor")
        setSaving(false)
        return
      }

      const { data: newBroker } = await res.json()

      // Vincular empreendimentos selecionados
      const brokerId = newBroker?.id ?? newBroker?.broker_id
      if (brokerId && selectedProperties.length > 0) {
        for (const propId of selectedProperties) {
          await fetch(`/api/brokers/${brokerId}/assignments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ property_id: propId }),
          })
        }
      }

      router.push("/dashboard/corretores")
    } catch {
      setError("Erro ao criar corretor")
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/corretores"
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-stone-400 dark:hover:text-stone-200"
        >
          &larr; Corretores
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-stone-100">
          Novo Corretor
        </h1>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-lg bg-white p-6 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800"
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-stone-400">
              Nome *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome completo"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-stone-400">
              Email *
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="corretor@email.com"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-stone-400">
              Telefone / WhatsApp
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(44) 99999-9999"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-stone-400">
              Senha *
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-stone-400">
              CRECI
            </label>
            <input
              type="text"
              value={creci}
              onChange={(e) => setCreci(e.target.value)}
              placeholder="Ex: 12345-F"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-stone-400">
              Tipo *
            </label>
            <select
              value={type}
              onChange={(e) =>
                setType(e.target.value as "internal" | "external")
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
            >
              <option value="internal">Interno</option>
              <option value="external">Externo</option>
            </select>
          </div>
        </div>

        {/* Empreendimentos */}
        {properties.length > 0 && (
          <div className="mt-4">
            <label className="mb-2 block text-sm font-medium text-stone-700 dark:text-stone-300">
              Empreendimentos que este corretor atende
            </label>
            <div className="flex flex-wrap gap-3">
              {properties.map((p) => (
                <label key={p.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedProperties.includes(p.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedProperties([...selectedProperties, p.id])
                      } else {
                        setSelectedProperties(selectedProperties.filter(id => id !== p.id))
                      }
                    }}
                    className="h-4 w-4 rounded border-stone-300 text-orange-600 focus:ring-orange-500 dark:border-stone-600"
                  />
                  <span className="text-sm text-stone-700 dark:text-stone-300">{p.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-600 dark:text-red-300">{error}</p>}

        <div className="mt-6 flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-orange-600 px-5 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {saving ? "Criando..." : "Criar Corretor"}
          </button>
          <Link
            href="/dashboard/corretores"
            className="rounded-md border border-gray-300 px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  )
}
