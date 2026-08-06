"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { PROPERTY_STATUS_OPTIONS } from "@web/lib/property-status"

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

// Lista canônica em @web/lib/property-status (espelha o enum property_status).
const STATUS_OPTIONS = PROPERTY_STATUS_OPTIONS

export default function NewPropertyPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [status, setStatus] = useState("planning")
  const [address, setAddress] = useState("")
  const [neighborhood, setNeighborhood] = useState("")
  const [city, setCity] = useState("")
  const [state, setState] = useState("")
  const [concept, setConcept] = useState("")
  const [description, setDescription] = useState("")
  const [deliveryDate, setDeliveryDate] = useState("")
  const [totalUnits, setTotalUnits] = useState("")
  const [totalFloors, setTotalFloors] = useState("")
  const [unitsPerFloor, setUnitsPerFloor] = useState("")
  const [createObra, setCreateObra] = useState(true)

  const handleNameChange = useCallback((value: string) => {
    setName(value)
    setSlug(slugify(value))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const res = await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim() || slugify(name.trim()),
          status,
          address: address.trim() || null,
          neighborhood: neighborhood.trim() || null,
          city: city.trim(),
          state: state.trim().toUpperCase(),
          concept: concept.trim() || null,
          description: description.trim() || null,
          delivery_date: deliveryDate || null,
          total_units: totalUnits ? Number(totalUnits) : null,
          total_floors: totalFloors ? Number(totalFloors) : null,
          units_per_floor: unitsPerFloor ? Number(unitsPerFloor) : null,
          create_obra: createObra,
        }),
      })

      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || "Erro ao salvar empreendimento")
      }

      const responseData = await res.json()
      const propertyId = responseData.data?.id

      if (createObra && propertyId) {
        const obraCreated = responseData.obra_created as boolean
        const obraError = responseData.obra_error as string | undefined
        const params = new URLSearchParams()
        if (obraCreated) params.set("obra_created", "true")
        if (!obraCreated && obraError) params.set("obra_error", "true")
        router.push(`/dashboard/properties/${propertyId}?${params.toString()}`)
      } else if (propertyId) {
        router.push(`/dashboard/properties/${propertyId}`)
      } else {
        router.push("/dashboard/properties")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido")
    } finally {
      setSaving(false)
    }
  }

  // Mesmo padrão de input já usado em properties/[id]/edit e units/[unitId]:
  // sem as variantes dark: o texto herda --foreground (branco no tema escuro) e
  // fica invisível dentro do campo de fundo claro.
  const inputClass =
    "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">
        Novo Empreendimento
      </h1>

      {error && (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 rounded-lg bg-white p-6 shadow-sm dark:bg-stone-900 dark:shadow-none dark:ring-1 dark:ring-stone-800">
        {/* Name + Slug */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">
              Nome *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">
              Slug
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className={inputClass}
              placeholder="gerado automaticamente"
            />
          </div>
        </div>

        {/* Status */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">
            Status
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={inputClass}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Address */}
        <div>
          {/* Obrigatório: properties.address é NOT NULL no schema (migration 002). */}
          <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">
            Endereço *
          </label>
          <input
            type="text"
            required
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className={inputClass}
          />
        </div>

        {/* Neighborhood + City + State */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">
              Bairro
            </label>
            <input
              type="text"
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">
              Cidade *
            </label>
            <input
              type="text"
              required
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">
              UF *
            </label>
            <input
              type="text"
              required
              maxLength={2}
              value={state}
              onChange={(e) => setState(e.target.value)}
              className={inputClass}
              placeholder="SP"
            />
          </div>
        </div>

        {/* Concept */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">
            Conceito
          </label>
          <textarea
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            rows={3}
            className={inputClass}
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">
            Descrição
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className={inputClass}
          />
        </div>

        {/* Delivery date + Units */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">
              Data de entrega
            </label>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">
              Total de unidades
            </label>
            <input
              type="number"
              min={0}
              value={totalUnits}
              onChange={(e) => setTotalUnits(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">
              Andares
            </label>
            <input
              type="number"
              min={0}
              value={totalFloors}
              onChange={(e) => setTotalFloors(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">
              Unidades/andar
            </label>
            <input
              type="number"
              min={0}
              value={unitsPerFloor}
              onChange={(e) => setUnitsPerFloor(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        {/* Obra toggle */}
        <div className="rounded-lg border border-orange-100 bg-orange-50 p-4 dark:border-orange-500/20 dark:bg-orange-500/10">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={createObra}
              onChange={(e) => setCreateObra(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500 dark:border-stone-600"
            />
            <div>
              <span className="text-sm font-medium text-gray-900 dark:text-stone-100">
                Criar obra de acompanhamento
              </span>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-stone-400">
                Uma obra será criada e vinculada automaticamente a este empreendimento para o portal do cliente.
              </p>
            </div>
          </label>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 border-t pt-4 dark:border-stone-800">
          <button
            type="button"
            onClick={() => router.push("/dashboard/properties")}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  )
}
