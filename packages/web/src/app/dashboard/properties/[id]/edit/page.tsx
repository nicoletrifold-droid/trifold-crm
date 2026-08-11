"use client"

import { useEffect, useState } from "react"
import { PROPERTY_STATUS_OPTIONS } from "@web/lib/property-status"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"

interface PropertyData {
  id: string
  name: string
  slug: string
  status: string
  address: string
  neighborhood: string | null
  city: string
  state: string
  concept: string | null
  description: string | null
  delivery_date: string | null
  total_units: number | null
  total_floors: number | null
  units_per_floor: number | null
  type_floors: number | null
  basement_floors: number | null
  leisure_floors: number | null
  amenities: string[] | null
  differentials: unknown
  commercial_rules: unknown
  faq: unknown
  restrictions: unknown
  video_tour_url: string | null
  nicole_enabled: boolean
}

// Story 75-283: opções vêm da fonte única (`PROPERTY_STATUS_OPTIONS`)

export default function PropertyEditPage() {
  const routeParams = useParams<{ id: string }>()
  const router = useRouter()
  const propertyId = routeParams.id

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Story 87-13 — a lista `missing` do 422, renderizada item a item. */
  const [faltando, setFaltando] = useState<string[]>([])
  const [success, setSuccess] = useState(false)

  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [status, setStatus] = useState("launching")
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
  const [typeFloors, setTypeFloors] = useState("")
  const [basementFloors, setBasementFloors] = useState("")
  const [leisureFloors, setLeisureFloors] = useState("")
  const [amenities, setAmenities] = useState("")
  const [differentials, setDifferentials] = useState("")
  const [commercialRules, setCommercialRules] = useState("")
  const [faq, setFaq] = useState("")
  const [restrictions, setRestrictions] = useState("")
  const [videoTourUrl, setVideoTourUrl] = useState("")
  const [nicoleEnabled, setNicoleEnabled] = useState(false)
  /**
   * Story 87-13 — o valor que veio do servidor. O `handleSave` monta o body
   * inteiro a cada save; se `nicole_enabled` fosse SEMPRE enviado, um usuário de
   * `obras` ou `gerente-relacionamento` (que pode editar o empreendimento, mas
   * não pode mexer neste campo) levaria 403 ao salvar QUALQUER coisa. Envia-se o
   * campo só quando ele muda de verdade.
   */
  const [nicoleEnabledOriginal, setNicoleEnabledOriginal] = useState(false)

  useEffect(() => {
    async function fetchProperty() {
      try {
        const res = await fetch(`/api/properties/${propertyId}`)
        if (!res.ok) {
          setError("Empreendimento não encontrado")
          setLoading(false)
          return
        }
        const json = await res.json()
        const data = json.data as PropertyData

        setName(data.name)
        setSlug(data.slug)
        setStatus(data.status)
        setAddress(data.address || "")
        setNeighborhood(data.neighborhood || "")
        setCity(data.city)
        setState(data.state)
        setConcept(data.concept || "")
        setDescription(data.description || "")
        setDeliveryDate(data.delivery_date || "")
        setTotalUnits(data.total_units != null ? String(data.total_units) : "")
        setTotalFloors(data.total_floors != null ? String(data.total_floors) : "")
        setUnitsPerFloor(data.units_per_floor != null ? String(data.units_per_floor) : "")
        setTypeFloors(data.type_floors != null ? String(data.type_floors) : "")
        setBasementFloors(data.basement_floors != null ? String(data.basement_floors) : "")
        setLeisureFloors(data.leisure_floors != null ? String(data.leisure_floors) : "")
        setAmenities(Array.isArray(data.amenities) ? data.amenities.join(", ") : "")
        setDifferentials(data.differentials ? JSON.stringify(data.differentials, null, 2) : "")
        setCommercialRules(data.commercial_rules ? JSON.stringify(data.commercial_rules, null, 2) : "")
        setFaq(data.faq ? JSON.stringify(data.faq, null, 2) : "")
        setRestrictions(data.restrictions ? JSON.stringify(data.restrictions, null, 2) : "")
        setVideoTourUrl(data.video_tour_url || "")
        setNicoleEnabled(data.nicole_enabled === true)
        setNicoleEnabledOriginal(data.nicole_enabled === true)
      } catch {
        setError("Erro ao carregar empreendimento")
      }
      setLoading(false)
    }
    fetchProperty()
  }, [propertyId])

  function parseJsonSafe(str: string, fallback: unknown): unknown {
    if (!str.trim()) return fallback
    try {
      return JSON.parse(str)
    } catch {
      return null // will trigger validation error
    }
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setFaltando([])
    setSuccess(false)

    // Parse JSON fields
    const parsedDifferentials = differentials.trim() ? parseJsonSafe(differentials, []) : []
    const parsedCommercialRules = commercialRules.trim() ? parseJsonSafe(commercialRules, {}) : {}
    const parsedFaq = faq.trim() ? parseJsonSafe(faq, []) : []
    const parsedRestrictions = restrictions.trim() ? parseJsonSafe(restrictions, []) : []

    if (parsedDifferentials === null) {
      setError("Diferenciais: JSON inválido")
      setSaving(false)
      return
    }
    if (parsedCommercialRules === null) {
      setError("Regras comerciais: JSON inválido")
      setSaving(false)
      return
    }
    if (parsedFaq === null) {
      setError("FAQ: JSON inválido")
      setSaving(false)
      return
    }
    if (parsedRestrictions === null) {
      setError("Restrições: JSON inválido")
      setSaving(false)
      return
    }

    const body: Record<string, unknown> = {
      name: name.trim(),
      slug: slug.trim(),
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
      type_floors: typeFloors ? Number(typeFloors) : null,
      basement_floors: basementFloors ? Number(basementFloors) : null,
      leisure_floors: leisureFloors ? Number(leisureFloors) : null,
      amenities: amenities.trim()
        ? amenities.split(",").map((a) => a.trim()).filter(Boolean)
        : [],
      differentials: parsedDifferentials,
      commercial_rules: parsedCommercialRules,
      faq: parsedFaq,
      restrictions: parsedRestrictions,
      video_tour_url: videoTourUrl.trim() || null,
    }

    // Story 87-13 — só vai no body quando MUDA (ver `nicoleEnabledOriginal`).
    if (nicoleEnabled !== nicoleEnabledOriginal) {
      body.nicole_enabled = nicoleEnabled
    }

    try {
      const res = await fetch(`/api/properties/${propertyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const json = await res.json()
        setError(json.error || "Erro ao salvar")
        // Story 87-13 — quando o servidor recusa LIGAR a Nicole (422), a lista do
        // que falta volta item a item. Renderizá-la é a diferença entre "corrija
        // o cadastro assim" e um "erro ao salvar" genérico, que o admin não sabe
        // o que fazer com.
        setFaltando(Array.isArray(json.faltando) ? json.faltando : [])
        setSaving(false)
        return
      }

      setNicoleEnabledOriginal(nicoleEnabled)
      setSuccess(true)
      setTimeout(() => {
        router.push(`/dashboard/properties/${propertyId}`)
      }, 1500)
    } catch {
      setError("Erro ao salvar")
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-gray-500">Carregando...</p>
      </div>
    )
  }

  const inputClass =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/dashboard/properties/${propertyId}`}
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-stone-400 dark:hover:text-stone-200"
        >
          &larr; Voltar para empreendimento
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-stone-100">
          Editar empreendimento
        </h1>
      </div>

      <div className="rounded-lg bg-white p-6 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <div className="grid gap-6 sm:grid-cols-2">
          {/* Name */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-stone-400">
              Nome
            </label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </div>

          {/* Slug */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-stone-400">
              Slug
            </label>
            <input type="text" value={slug} onChange={(e) => setSlug(e.target.value)} className={inputClass} />
          </div>

          {/* Status */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-stone-400">
              Status
            </label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
              {PROPERTY_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Address */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-stone-400">
              Endereço
            </label>
            <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
          </div>

          {/* Neighborhood */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-stone-400">
              Bairro
            </label>
            <input type="text" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} className={inputClass} />
          </div>

          {/* City */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-stone-400">
              Cidade
            </label>
            <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} />
          </div>

          {/* State */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-stone-400">
              Estado (UF)
            </label>
            <input type="text" value={state} onChange={(e) => setState(e.target.value)} maxLength={2} className={inputClass} />
          </div>

          {/* Delivery date */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-stone-400">
              Data de entrega
            </label>
            <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className={inputClass} />
          </div>

          {/* Total Units */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-stone-400">
              Total de unidades
            </label>
            <input type="number" value={totalUnits} onChange={(e) => setTotalUnits(e.target.value)} className={inputClass} />
          </div>

          {/* Total Floors */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-stone-400">
              Total de andares
            </label>
            <input type="number" value={totalFloors} onChange={(e) => setTotalFloors(e.target.value)} className={inputClass} />
          </div>

          {/* Units per floor */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-stone-400">
              Unidades por andar
            </label>
            <input type="number" value={unitsPerFloor} onChange={(e) => setUnitsPerFloor(e.target.value)} className={inputClass} />
          </div>

          {/* Type floors */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-stone-400">
              Andares tipo
            </label>
            <input type="number" value={typeFloors} onChange={(e) => setTypeFloors(e.target.value)} className={inputClass} />
          </div>

          {/* Basement floors */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-stone-400">
              Subsolos
            </label>
            <input type="number" value={basementFloors} onChange={(e) => setBasementFloors(e.target.value)} className={inputClass} />
          </div>

          {/* Leisure floors */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-stone-400">
              Andares de lazer
            </label>
            <input type="number" value={leisureFloors} onChange={(e) => setLeisureFloors(e.target.value)} className={inputClass} />
          </div>

          {/* Video tour URL */}
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-stone-400">
              URL do vídeo tour
            </label>
            <input type="url" value={videoTourUrl} onChange={(e) => setVideoTourUrl(e.target.value)} className={inputClass} placeholder="https://..." />
          </div>

          {/* Concept */}
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-stone-400">
              Conceito
            </label>
            <textarea value={concept} onChange={(e) => setConcept(e.target.value)} rows={3} className={inputClass} />
          </div>

          {/* Description */}
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-stone-400">
              Descrição
            </label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={inputClass} />
          </div>

          {/* Amenities */}
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-stone-400">
              Amenidades (separadas por vírgula)
            </label>
            <textarea value={amenities} onChange={(e) => setAmenities(e.target.value)} rows={2} className={inputClass} placeholder="Piscina, Academia, Salão de festas" />
          </div>

          {/* Differentials */}
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-stone-400">
              Diferenciais (JSON)
            </label>
            <textarea value={differentials} onChange={(e) => setDifferentials(e.target.value)} rows={4} className={inputClass} placeholder='["Diferencial 1", "Diferencial 2"]' />
          </div>

          {/* Commercial rules */}
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-stone-400">
              Regras comerciais (JSON)
            </label>
            <textarea value={commercialRules} onChange={(e) => setCommercialRules(e.target.value)} rows={4} className={inputClass} placeholder='{"regra": "valor"}' />
          </div>

          {/* FAQ */}
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-stone-400">
              FAQ (JSON)
            </label>
            <textarea value={faq} onChange={(e) => setFaq(e.target.value)} rows={4} className={inputClass} placeholder='[{"pergunta": "...", "resposta": "..."}]' />
          </div>

          {/* Restrictions */}
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-stone-400">
              Restrições (JSON)
            </label>
            <textarea value={restrictions} onChange={(e) => setRestrictions(e.target.value)} rows={4} className={inputClass} placeholder='[{"restrição": "..."}]' />
          </div>
        </div>

        {/* Story 87-13 — o switch do que a Nicole pode falar deste empreendimento */}
        <div className="mt-6 rounded-md border border-gray-200 p-4 dark:border-stone-700">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={nicoleEnabled}
              onChange={(e) => setNicoleEnabled(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500 dark:border-stone-600"
            />
            <span>
              <span className="block text-sm font-medium text-gray-900 dark:text-stone-100">
                A Nicole pode falar deste empreendimento
              </span>
              <span className="mt-0.5 block text-xs text-gray-500 dark:text-stone-400">
                Desligado: ela não menciona, não reconhece o nome e não envia mídia deste
                empreendimento.
              </span>
            </span>
          </label>
        </div>

        {/* Messages */}
        {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
        {faltando.length > 0 && (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-600 dark:text-red-400">
            {faltando.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
        {success && <p className="mt-4 text-sm text-green-600 dark:text-green-400">Salvo com sucesso! Redirecionando...</p>}

        {/* Actions */}
        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-orange-600 px-5 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
          <Link
            href={`/dashboard/properties/${propertyId}`}
            className="rounded-md border border-gray-300 px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            Cancelar
          </Link>
        </div>
      </div>
    </div>
  )
}
