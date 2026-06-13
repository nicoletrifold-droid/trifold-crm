"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Save, Loader2, X } from "lucide-react"

interface LeadData {
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
  lead: LeadData
  properties: Property[]
  onClose: () => void
}

const INTEREST_LEVELS = [
  { value: "", label: "Não definido" },
  { value: "cold", label: "Frio" },
  { value: "warm", label: "Morno" },
  { value: "hot", label: "Quente" },
]

export function DashboardLeadEditForm({ lead, properties, onClose }: Props) {
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
    setSaving(true); setError(null); setSaved(false)

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

    setSaving(false)
    if (res.ok) {
      setSaved(true)
      router.refresh()
      setTimeout(onClose, 800)
    } else {
      const json = await res.json().catch(() => ({}))
      setError((json as { error?: string }).error ?? "Erro ao salvar")
    }
  }

  const inputClass = "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
  const labelClass = "mb-1 block text-xs font-medium text-gray-500 dark:text-stone-400"
  const readonlyClass = "w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-400 dark:border-stone-800 dark:bg-stone-900/50 dark:text-stone-500 cursor-not-allowed"

  return (
    <div className="rounded-lg bg-white p-6 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900 dark:text-stone-100">Editar Lead</h2>
        <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:text-stone-500 dark:hover:bg-stone-800">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className={labelClass}>Nome</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Nome do cliente" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Telefone</label>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>E-mail</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
        </div>
        {properties.length > 0 && (
          <div>
            <label className={labelClass}>Empreendimento</label>
            <select value={propertyId} onChange={e => setPropertyId(e.target.value)} className={inputClass}>
              <option value="">Não definido</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className={labelClass}>Calor do Lead</label>
          <select value={interestLevel} onChange={e => setInterestLevel(e.target.value)} className={inputClass}>
            {INTEREST_LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Quartos preferidos</label>
          <input type="number" min="0" value={preferredBedrooms} onChange={e => setPreferredBedrooms(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Andar preferido</label>
          <input type="text" value={preferredFloor} onChange={e => setPreferredFloor(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Vista preferida</label>
          <input type="text" value={preferredView} onChange={e => setPreferredView(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Vagas de garagem</label>
          <input type="number" min="0" value={preferredGarage} onChange={e => setPreferredGarage(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Tem entrada?</label>
          <select value={hasDownPayment} onChange={e => setHasDownPayment(e.target.value)} className={inputClass}>
            <option value="">Não informado</option>
            <option value="sim">Sim</option>
            <option value="nao">Não</option>
          </select>
        </div>

        {/* Campos de integração — read-only */}
        <div className="sm:col-span-2 lg:col-span-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-stone-500">
            Campos de integração (somente leitura)
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Origem</label>
              <div className={readonlyClass}>{(lead as unknown as Record<string, unknown>).source as string || "—"}</div>
            </div>
            <div>
              <label className={labelClass}>Canal</label>
              <div className={readonlyClass}>{(lead as unknown as Record<string, unknown>).channel as string || "—"}</div>
            </div>
          </div>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-500 dark:text-red-400">{error}</p>}
      {saved && <p className="mt-3 text-sm text-green-600 dark:text-green-400">Salvo com sucesso!</p>}

      <div className="mt-5 flex gap-3">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Salvando…" : "Salvar Alterações"}
        </button>
        <button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-800">
          Cancelar
        </button>
      </div>
    </div>
  )
}
