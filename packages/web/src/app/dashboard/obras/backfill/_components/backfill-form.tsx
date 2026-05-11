"use client"

// TODO: esta página é temporária — remover após concluir o backfill de vínculos

import { useState } from "react"
import Link from "next/link"
import { CheckCircle, XCircle, Loader2 } from "lucide-react"

interface Property {
  id: string
  name: string
  city: string
  state: string
}

interface Obra {
  id: string
  name: string
  status: string
  progress_pct: number
}

interface BackfillFormProps {
  properties: Property[]
  obras: Obra[]
}

type ResultStatus = "success" | "error"

interface ItemResult {
  status: ResultStatus
  message: string
}

export function BackfillForm({ properties, obras }: BackfillFormProps) {
  const [selections, setSelections] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<Record<string, ItemResult>>({})
  const [submitted, setSubmitted] = useState(false)

  function handleSelect(propertyId: string, obraId: string) {
    setSelections((prev) => ({ ...prev, [propertyId]: obraId }))
  }

  async function handleSubmit() {
    const links = Object.entries(selections)
      .filter(([, obraId]) => obraId !== "")
      .map(([propertyId, obraId]) => ({
        property_id: propertyId,
        obra_id: obraId,
      }))

    if (links.length === 0) return

    setLoading(true)
    setResults({})

    try {
      const res = await fetch("/api/admin/obras/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ links }),
      })

      const data = await res.json()

      if (!res.ok) {
        for (const [propertyId] of Object.entries(selections).filter(
          ([, v]) => v !== ""
        )) {
          setResults((prev) => ({
            ...prev,
            [propertyId]: {
              status: "error",
              message: data.error ?? "Erro ao salvar",
            },
          }))
        }
        return
      }

      const resultsMap: Record<string, ItemResult> = {}

      const linksByObra: Record<string, string> = {}
      for (const link of links) {
        linksByObra[link.obra_id] = link.property_id
      }

      for (const result of data.results as Array<{
        obra_id: string
        ok: boolean
        error?: string
      }>) {
        const propertyId = linksByObra[result.obra_id]
        if (propertyId) {
          resultsMap[propertyId] = result.ok
            ? { status: "success", message: "Vinculado com sucesso" }
            : { status: "error", message: result.error ?? "Erro ao vincular" }
        }
      }

      setResults(resultsMap)
      setSubmitted(true)
    } catch {
      for (const [propertyId] of Object.entries(selections).filter(
        ([, v]) => v !== ""
      )) {
        setResults((prev) => ({
          ...prev,
          [propertyId]: { status: "error", message: "Erro de conexão" },
        }))
      }
    } finally {
      setLoading(false)
    }
  }

  const selectedCount = Object.values(selections).filter((v) => v !== "").length

  if (properties.length === 0) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-8 text-center">
        <CheckCircle className="mx-auto mb-3 h-8 w-8 text-green-500" />
        <p className="font-medium text-green-800">
          Todos os empreendimentos já estão vinculados a uma obra.
        </p>
        <Link
          href="/dashboard/obras"
          className="mt-4 inline-block text-sm text-orange-600 hover:underline"
        >
          &larr; Voltar para Obras
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              <th className="px-5 py-3">Empreendimento</th>
              <th className="px-5 py-3">Cidade</th>
              <th className="px-5 py-3">Obra</th>
              <th className="px-5 py-3 w-32">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {properties.map((property) => {
              const result = results[property.id]
              return (
                <tr
                  key={property.id}
                  className={
                    result?.status === "success"
                      ? "bg-green-50"
                      : result?.status === "error"
                        ? "bg-red-50"
                        : "hover:bg-gray-50"
                  }
                >
                  <td className="px-5 py-3 font-medium text-gray-900">
                    {property.name}
                  </td>
                  <td className="px-5 py-3 text-gray-500">
                    {property.city}/{property.state}
                  </td>
                  <td className="px-5 py-3">
                    {result?.status === "success" ? (
                      <span className="text-green-700">
                        {obras.find(
                          (o) => o.id === selections[property.id]
                        )?.name ?? "—"}
                      </span>
                    ) : (
                      <select
                        value={selections[property.id] ?? ""}
                        onChange={(e) =>
                          handleSelect(property.id, e.target.value)
                        }
                        disabled={loading || submitted}
                        className="w-full max-w-xs rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:outline-none disabled:opacity-60"
                      >
                        <option value="">— Sem vínculo —</option>
                        {obras.map((obra) => (
                          <option key={obra.id} value={obra.id}>
                            {obra.name} ({obra.progress_pct}%)
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-5 py-3 w-32">
                    {result?.status === "success" && (
                      <span className="flex items-center gap-1 text-xs text-green-700">
                        <CheckCircle className="h-3.5 w-3.5" />
                        Vinculado
                      </span>
                    )}
                    {result?.status === "error" && (
                      <span
                        className="flex items-center gap-1 text-xs text-red-600"
                        title={result.message}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Erro
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {selectedCount} vínculo{selectedCount !== 1 ? "s" : ""} selecionado
          {selectedCount !== 1 ? "s" : ""}
        </p>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/obras"
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </Link>
          <button
            onClick={handleSubmit}
            disabled={selectedCount === 0 || loading || submitted}
            className="flex items-center gap-2 rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading
              ? "Salvando..."
              : submitted
                ? "Salvo"
                : "Salvar Vínculos"}
          </button>
        </div>
      </div>

      {submitted && Object.keys(results).length > 0 && (
        <div className="rounded-md bg-gray-50 p-4 text-sm text-gray-600">
          {Object.values(results).filter((r) => r.status === "success").length}{" "}
          vínculos criados com sucesso.
          {Object.values(results).filter((r) => r.status === "error").length >
            0 && (
            <span className="ml-1 text-red-600">
              {
                Object.values(results).filter((r) => r.status === "error")
                  .length
              }{" "}
              com erro.
            </span>
          )}
        </div>
      )}
    </div>
  )
}
