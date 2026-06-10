"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Save, Loader2 } from "lucide-react"

interface LeadEditData {
  id: string
  name: string | null
  phone: string
  email: string | null
  interest_level: string | null
  property_interest_id: string | null
  preferred_bedrooms: number | null
  preferred_floor: string | null
  preferred_view: string | null
  preferred_garage_count: number | null
  has_down_payment: boolean | null
}

interface Property { id: string; name: string }

interface Props {
  lead: LeadEditData
  properties: Property[]
}

const INTEREST_LEVELS = [
  { value: "", label: "Não definido" },
  { value: "cold", label: "Frio" },
  { value: "warm", label: "Morno" },
  { value: "hot", label: "Quente" },
]

export function LeadEditForm({ lead, properties }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(lead.name ?? "")
  const [phone, setPhone] = useState(lead.phone)
  const [email, setEmail] = useState(lead.email ?? "")
  const [propertyId, setPropertyId] = useState(lead.property_interest_id ?? "")
  const [interestLevel, setInterestLevel] = useState(lead.interest_level ?? "")
  const [preferredBedrooms, setPreferredBedrooms] = useState(lead.preferred_bedrooms?.toString() ?? "")
  const [preferredFloor, setPreferredFloor] = useState(lead.preferred_floor ?? "")
  const [preferredView, setPreferredView] = useState(lead.preferred_view ?? "")
  const [preferredGarage, setPreferredGarage] = useState(lead.preferred_garage_count?.toString() ?? "")
  const [hasDownPayment, setHasDownPayment] = useState(
    lead.has_down_payment === null ? "" : lead.has_down_payment ? "sim" : "nao"
  )

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaved(false)

    const body: Record<string, unknown> = {
      name: name.trim() || null,
      phone: phone.trim(),
      email: email.trim() || null,
      property_interest_id: propertyId || null,
      interest_level: interestLevel || null,
      preferred_bedrooms: preferredBedrooms ? parseInt(preferredBedrooms) : null,
      preferred_floor: preferredFloor.trim() || null,
      preferred_view: preferredView.trim() || null,
      preferred_garage_count: preferredGarage ? parseInt(preferredGarage) : null,
      has_down_payment: hasDownPayment === "sim" ? true : hasDownPayment === "nao" ? false : null,
    }

    const res = await fetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      setSaved(true)
      router.refresh()
    } else {
      const json = await res.json().catch(() => ({}))
      setError((json as { error?: string }).error ?? "Erro ao salvar")
    }
    setSaving(false)
  }

  const inputClass = "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder:text-stone-500"
  const labelClass = "mb-1 block text-xs font-medium text-gray-500 dark:text-stone-400"

  return (
    <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
      <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-stone-100">Editar Lead</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Nome */}
        <div>
          <label className={labelClass}>Nome</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Nome do cliente"
            className={inputClass}
          />
        </div>

        {/* Telefone */}
        <div>
          <label className={labelClass}>Telefone</label>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="Telefone"
            className={inputClass}
          />
        </div>

        {/* E-mail */}
        <div>
          <label className={labelClass}>E-mail</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="E-mail"
            className={inputClass}
          />
        </div>

        {/* Empreendimento */}
        {properties.length > 0 && (
          <div>
            <label className={labelClass}>Empreendimento</label>
            <select value={propertyId} onChange={e => setPropertyId(e.target.value)} className={inputClass}>
              <option value="">Não definido</option>
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Calor */}
        <div>
          <label className={labelClass}>Calor do Lead</label>
          <select value={interestLevel} onChange={e => setInterestLevel(e.target.value)} className={inputClass}>
            {INTEREST_LEVELS.map(l => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </div>

        {/* Quartos */}
        <div>
          <label className={labelClass}>Quartos preferidos</label>
          <input
            type="number"
            min="0"
            value={preferredBedrooms}
            onChange={e => setPreferredBedrooms(e.target.value)}
            placeholder="Ex: 3"
            className={inputClass}
          />
        </div>

        {/* Andar */}
        <div>
          <label className={labelClass}>Andar preferido</label>
          <input
            type="text"
            value={preferredFloor}
            onChange={e => setPreferredFloor(e.target.value)}
            placeholder="Ex: Alto"
            className={inputClass}
          />
        </div>

        {/* Vista */}
        <div>
          <label className={labelClass}>Vista preferida</label>
          <input
            type="text"
            value={preferredView}
            onChange={e => setPreferredView(e.target.value)}
            placeholder="Ex: Mar"
            className={inputClass}
          />
        </div>

        {/* Vagas */}
        <div>
          <label className={labelClass}>Vagas de garagem</label>
          <input
            type="number"
            min="0"
            value={preferredGarage}
            onChange={e => setPreferredGarage(e.target.value)}
            placeholder="Ex: 2"
            className={inputClass}
          />
        </div>

        {/* Entrada */}
        <div>
          <label className={labelClass}>Tem entrada?</label>
          <select value={hasDownPayment} onChange={e => setHasDownPayment(e.target.value)} className={inputClass}>
            <option value="">Não informado</option>
            <option value="sim">Sim</option>
            <option value="nao">Não</option>
          </select>
        </div>
      </div>

      {/* Feedback */}
      {error && (
        <p className="mt-3 text-sm text-red-500 dark:text-red-400">{error}</p>
      )}
      {saved && (
        <p className="mt-3 text-sm text-green-600 dark:text-green-400">Salvo com sucesso!</p>
      )}

      <div className="mt-5">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Salvando…" : "Salvar Alterações"}
        </button>
      </div>
    </div>
  )
}
