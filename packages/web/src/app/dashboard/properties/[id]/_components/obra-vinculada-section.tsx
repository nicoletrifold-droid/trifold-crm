"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Building2, X, ChevronDown } from "lucide-react"

interface ObraDisponivel {
  id: string
  name: string
  status: string
  progress_pct: number
}

interface ObraVinculada {
  id: string
  name: string
  status: string
  progress_pct: number
}

interface ObraVinculadaSectionProps {
  propertyId: string
  obraVinculada: ObraVinculada | null
  obrasDisponiveis: ObraDisponivel[]
}

const STATUS_LABEL: Record<string, string> = {
  em_andamento: "Em andamento",
  concluida: "Concluída",
  pausada: "Pausada",
}

const STATUS_BADGE: Record<string, string> = {
  em_andamento: "bg-amber-100 text-amber-700",
  concluida: "bg-green-100 text-green-700",
  pausada: "bg-gray-100 text-gray-700",
}

export function ObraVinculadaSection({
  propertyId,
  obraVinculada: initialObra,
  obrasDisponiveis: initialObrasDisponiveis,
}: ObraVinculadaSectionProps) {
  const router = useRouter()
  const [obra, setObra] = useState<ObraVinculada | null>(initialObra)
  const [obrasDisponiveis, setObrasDisponiveis] = useState(initialObrasDisponiveis)
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedObraId, setSelectedObraId] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmUnlink, setConfirmUnlink] = useState(false)

  async function handleVincular() {
    if (!selectedObraId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/properties/${propertyId}/obra`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ obra_id: selectedObraId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Erro ao vincular obra")
      setObra(data.obra)
      setObrasDisponiveis((prev) => prev.filter((o) => o.id !== selectedObraId))
      setShowDropdown(false)
      setSelectedObraId("")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao vincular obra")
    } finally {
      setLoading(false)
    }
  }

  async function handleDesvincular() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/properties/${propertyId}/obra`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? "Erro ao desvincular obra")
      }
      if (obra) {
        setObrasDisponiveis((prev) => [
          { id: obra.id, name: obra.name, status: obra.status, progress_pct: obra.progress_pct },
          ...prev,
        ])
      }
      setObra(null)
      setConfirmUnlink(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao desvincular obra")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-lg bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Building2 className="h-4 w-4 text-gray-400" />
        <h2 className="text-lg font-semibold text-gray-900">Obra Vinculada</h2>
      </div>

      {obra ? (
        <div className="rounded-lg border border-gray-200 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Link
                href={`/dashboard/obras/${obra.id}`}
                className="font-medium text-orange-600 hover:underline"
              >
                {obra.name}
              </Link>
              <div className="mt-1 flex items-center gap-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[obra.status] ?? "bg-gray-100 text-gray-700"}`}
                >
                  {STATUS_LABEL[obra.status] ?? obra.status}
                </span>
                <span className="text-sm text-gray-500">{obra.progress_pct}% concluído</span>
              </div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-gray-200">
                <div
                  className="h-1.5 rounded-full bg-orange-500"
                  style={{ width: `${obra.progress_pct}%` }}
                />
              </div>
            </div>
            {!confirmUnlink ? (
              <button
                onClick={() => setConfirmUnlink(true)}
                className="shrink-0 rounded-md px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 hover:text-red-600"
              >
                Desvincular
              </button>
            ) : (
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-gray-500">Confirmar?</span>
                <button
                  onClick={handleDesvincular}
                  disabled={loading}
                  className="rounded-md bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
                >
                  {loading ? "..." : "Sim"}
                </button>
                <button
                  onClick={() => setConfirmUnlink(false)}
                  className="rounded-md px-2 py-1.5 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div>
          {!showDropdown ? (
            <button
              onClick={() => setShowDropdown(true)}
              className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500 hover:border-orange-400 hover:text-orange-600"
            >
              <Building2 className="h-4 w-4" />
              Vincular obra de acompanhamento
            </button>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <select
                  value={selectedObraId}
                  onChange={(e) => setSelectedObraId(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-gray-300 px-3 py-2 pr-8 text-sm focus:border-orange-500 focus:outline-none"
                >
                  <option value="">Selecione uma obra...</option>
                  {obrasDisponiveis.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-gray-400" />
              </div>
              {obrasDisponiveis.length === 0 && (
                <p className="text-sm text-gray-400">
                  Nenhuma obra disponível (todas já vinculadas a empreendimentos)
                </p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleVincular}
                  disabled={!selectedObraId || loading}
                  className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
                >
                  {loading ? "Vinculando..." : "Vincular"}
                </button>
                <button
                  onClick={() => { setShowDropdown(false); setSelectedObraId("") }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}
