"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"

interface UnitData {
  id: string
  identifier: string
  floor: number
  position: string | null
  view_direction: string | null
  private_area_m2: number | null
  garage_count: number
  status: string
  price: number | null
  typology_id: string | null
  property: { id: string; name: string }
  typology: { id: string; name: string } | null
}

interface LeadResult {
  id: string
  name: string | null
  phone: string
  email: string | null
}

interface BrokerResult {
  id: string
  user: { id: string; name: string; email: string } | null
}

const viewLabels: Record<string, string> = {
  north: "Norte",
  south: "Sul",
  east: "Leste",
  west: "Oeste",
  northeast: "Nordeste",
  northwest: "Noroeste",
  southeast: "Sudeste",
  southwest: "Sudoeste",
}

const statusLabels: Record<string, string> = {
  available: "Disponível",
  reserved: "Reservada",
  sold: "Vendida",
}

const paymentMethods = [
  { value: "financiamento_bancario", label: "Financiamento bancário" },
  { value: "direto_construtora", label: "Direto construtora" },
  { value: "a_vista", label: "À vista" },
  { value: "misto", label: "Misto" },
]

export default function UnitEditPage() {
  const routeParams = useParams<{ id: string; unitId: string }>()
  const router = useRouter()

  const propertyId = routeParams.id
  const unitId = routeParams.unitId

  const [unit, setUnit] = useState<UnitData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [status, setStatus] = useState("")
  const [identifier, setIdentifier] = useState("")
  const [floor, setFloor] = useState(0)
  const [price, setPrice] = useState<string>("")

  // Sale fields
  const [showSaleForm, setShowSaleForm] = useState(false)
  const [salePrice, setSalePrice] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("")
  const [paymentDetails, setPaymentDetails] = useState("")
  const [soldAt, setSoldAt] = useState(new Date().toISOString().split("T")[0])
  const [saleNotes, setSaleNotes] = useState("")
  const [savingSale, setSavingSale] = useState(false)
  const [saleError, setSaleError] = useState<string | null>(null)
  const [saleSuccess, setSaleSuccess] = useState(false)
  const [portalVinculado, setPortalVinculado] = useState(false)

  // Client / Lead
  const [clientMode, setClientMode] = useState<"search" | "new">("search")
  const [leadSearch, setLeadSearch] = useState("")
  const [leadResults, setLeadResults] = useState<LeadResult[]>([])
  const [selectedLead, setSelectedLead] = useState<LeadResult | null>(null)
  const [searchingLeads, setSearchingLeads] = useState(false)
  const [clientName, setClientName] = useState("")
  const [clientPhone, setClientPhone] = useState("")
  const [clientEmail, setClientEmail] = useState("")
  const [clientCpf, setClientCpf] = useState("")
  const [createLead, setCreateLead] = useState(false)

  // Broker
  const [brokers, setBrokers] = useState<BrokerResult[]>([])
  const [selectedBrokerId, setSelectedBrokerId] = useState("")

  useEffect(() => {
    async function fetchUnit() {
      try {
        const res = await fetch(`/api/units/${unitId}`)
        if (!res.ok) {
          setError("Unidade nao encontrada")
          setLoading(false)
          return
        }
        const json = await res.json()
        const data = json.data as UnitData
        setUnit(data)
        setStatus(data.status)
        setIdentifier(data.identifier)
        setFloor(data.floor)
        setPrice(data.price != null ? String(data.price) : "")
        setSalePrice(data.price != null ? String(data.price) : "")
      } catch {
        setError("Erro ao carregar unidade")
      }
      setLoading(false)
    }
    fetchUnit()
  }, [unitId])

  // Fetch brokers for the dropdown
  useEffect(() => {
    async function fetchBrokers() {
      try {
        const res = await fetch("/api/brokers")
        if (res.ok) {
          const json = await res.json()
          setBrokers(json.data || [])
        }
      } catch {
        // ignore
      }
    }
    fetchBrokers()
  }, [])

  // Show sale form when status changes to sold
  const shouldShowSaleForm = status === "sold" && unit != null && unit.status !== "sold"
  if (shouldShowSaleForm && !showSaleForm) {
    setShowSaleForm(true)
  } else if (status !== "sold" && showSaleForm) {
    setShowSaleForm(false)
  }

  const searchLeads = useCallback(async (query: string) => {
    if (query.length < 2) {
      setLeadResults([])
      return
    }
    setSearchingLeads(true)
    try {
      const res = await fetch(`/api/leads?search=${encodeURIComponent(query)}`)
      if (res.ok) {
        const json = await res.json()
        setLeadResults((json.data || []).slice(0, 10))
      }
    } catch {
      // ignore
    }
    setSearchingLeads(false)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (leadSearch) searchLeads(leadSearch)
    }, 400)
    return () => clearTimeout(timer)
  }, [leadSearch, searchLeads])

  async function handleSave() {
    if (!unit) return
    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      const body: Record<string, unknown> = {}
      if (status !== unit.status) body.status = status
      if (identifier !== unit.identifier) body.identifier = identifier
      if (floor !== unit.floor) body.floor = floor
      const priceNum = price === "" ? undefined : Number(price)
      if (priceNum !== undefined && priceNum !== unit.price)
        body.price = priceNum

      if (Object.keys(body).length === 0) {
        setSuccess(true)
        setSaving(false)
        return
      }

      const res = await fetch(`/api/units/${unitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const json = await res.json()
        setError(json.error || "Erro ao salvar")
        setSaving(false)
        return
      }

      setSuccess(true)
      // Update local state
      const json = await res.json()
      setUnit((prev) => (prev ? { ...prev, ...json.data } : prev))
    } catch {
      setError("Erro ao salvar")
    }
    setSaving(false)
  }

  async function handleSaveSale() {
    setSavingSale(true)
    setSaleError(null)
    setSaleSuccess(false)

    if (!salePrice || Number(salePrice) <= 0) {
      setSaleError("Valor da venda e obrigatorio")
      setSavingSale(false)
      return
    }

    const saleBody: Record<string, unknown> = {
      sale_price: Number(salePrice),
      payment_method: paymentMethod || null,
      payment_details: paymentDetails.trim() || null,
      sold_at: soldAt ? new Date(soldAt).toISOString() : new Date().toISOString(),
      notes: saleNotes.trim() || null,
      broker_id: selectedBrokerId || null,
    }

    if (clientMode === "search" && selectedLead) {
      saleBody.lead_id = selectedLead.id
      saleBody.client_name = selectedLead.name
      saleBody.client_phone = selectedLead.phone
      saleBody.client_email = selectedLead.email
    } else if (clientMode === "new") {
      saleBody.client_name = clientName.trim() || null
      saleBody.client_phone = clientPhone.trim() || null
      saleBody.client_email = clientEmail.trim() || null
      saleBody.client_cpf = clientCpf.trim() || null
      saleBody.create_lead = createLead
    }

    try {
      const res = await fetch(`/api/units/${unitId}/sale`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(saleBody),
      })

      if (!res.ok) {
        const json = await res.json()
        setSaleError(json.error || "Erro ao registrar venda")
        setSavingSale(false)
        return
      }

      const resData = await res.json()
      setPortalVinculado(resData.portal_vinculado === true)
      setSaleSuccess(true)
      setUnit((prev) => (prev ? { ...prev, status: "sold" } : prev))
      setTimeout(() => {
        router.push(`/dashboard/properties/${propertyId}`)
      }, 2000)
    } catch {
      setSaleError("Erro ao registrar venda")
    }
    setSavingSale(false)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-gray-500">Carregando...</p>
      </div>
    )
  }

  if (!unit) {
    return (
      <div className="space-y-6">
        <Link
          href={`/dashboard/properties/${propertyId}/units`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; Voltar para unidades
        </Link>
        <p className="text-sm text-red-600">{error || "Unidade nao encontrada"}</p>
      </div>
    )
  }

  const inputClass =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/dashboard/properties/${propertyId}/units`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; Voltar para unidades
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">
          Unidade {unit.identifier}
        </h1>
        <p className="text-sm text-gray-500">{unit.property.name}</p>
      </div>

      <div className="rounded-lg bg-white p-6 shadow-sm">
        <div className="grid gap-6 sm:grid-cols-2">
          {/* Identifier */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Identificador
            </label>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* Floor */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Andar
            </label>
            <input
              type="number"
              value={floor}
              onChange={(e) => setFloor(Number(e.target.value))}
              className={inputClass}
            />
          </div>

          {/* Position (read-only) */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Posição
            </label>
            <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {unit.position ?? "-"}
            </p>
          </div>

          {/* View (read-only) */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Vista
            </label>
            <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {unit.view_direction
                ? viewLabels[unit.view_direction] ?? unit.view_direction
                : "-"}
            </p>
          </div>

          {/* Area (read-only) */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Area (m2)
            </label>
            <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {unit.private_area_m2 ?? "-"}
            </p>
          </div>

          {/* Garages (read-only) */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Vagas de garagem
            </label>
            <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {unit.garage_count}
            </p>
          </div>

          {/* Status */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={inputClass}
            >
              <option value="available">{statusLabels.available}</option>
              <option value="reserved">{statusLabels.reserved}</option>
              <option value="sold">{statusLabels.sold}</option>
            </select>
          </div>

          {/* Price */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Preco (R$)
            </label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Ex: 450000"
              className={inputClass}
            />
          </div>
        </div>

        {/* Messages */}
        {error && (
          <p className="mt-4 text-sm text-red-600">{error}</p>
        )}
        {success && (
          <p className="mt-4 text-sm text-green-600">Salvo com sucesso!</p>
        )}

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
            href={`/dashboard/properties/${propertyId}/units`}
            className="rounded-md border border-gray-300 px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </Link>
        </div>
      </div>

      {/* Sale Registration Section */}
      {showSaleForm && (
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Registrar Venda
          </h2>

          <div className="grid gap-6 sm:grid-cols-2">
            {/* Sale Price */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Valor da venda (R$) *
              </label>
              <input
                type="number"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                placeholder="Ex: 450000"
                className={inputClass}
              />
            </div>

            {/* Payment method */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Forma de pagamento
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className={inputClass}
              >
                <option value="">Selecione...</option>
                {paymentMethods.map((pm) => (
                  <option key={pm.value} value={pm.value}>{pm.label}</option>
                ))}
              </select>
            </div>

            {/* Sold at */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Data da venda
              </label>
              <input
                type="date"
                value={soldAt}
                onChange={(e) => setSoldAt(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Broker */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Corretor responsavel
              </label>
              <select
                value={selectedBrokerId}
                onChange={(e) => setSelectedBrokerId(e.target.value)}
                className={inputClass}
              >
                <option value="">Selecione...</option>
                {brokers.map((b) => {
                  const u = b.user as unknown as { id: string; name: string } | null
                  return (
                    <option key={b.id} value={u?.id ?? b.id}>
                      {u?.name ?? "Corretor"}
                    </option>
                  )
                })}
              </select>
            </div>

            {/* Payment details */}
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Detalhes do pagamento
              </label>
              <textarea
                value={paymentDetails}
                onChange={(e) => setPaymentDetails(e.target.value)}
                rows={2}
                className={inputClass}
                placeholder="Observacoes sobre pagamento..."
              />
            </div>

            {/* Notes */}
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Observacoes
              </label>
              <textarea
                value={saleNotes}
                onChange={(e) => setSaleNotes(e.target.value)}
                rows={2}
                className={inputClass}
              />
            </div>
          </div>

          {/* Client Section */}
          <div className="mt-6 border-t pt-6">
            <h3 className="mb-3 text-sm font-semibold text-gray-700">
              Dados do cliente
            </h3>

            <div className="mb-4 flex gap-4">
              <button
                type="button"
                onClick={() => { setClientMode("search"); setSelectedLead(null) }}
                className={`rounded-md px-3 py-1 text-sm font-medium ${
                  clientMode === "search"
                    ? "bg-orange-100 text-orange-700"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                Buscar lead existente
              </button>
              <button
                type="button"
                onClick={() => { setClientMode("new"); setSelectedLead(null) }}
                className={`rounded-md px-3 py-1 text-sm font-medium ${
                  clientMode === "new"
                    ? "bg-orange-100 text-orange-700"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                Novo cliente
              </button>
            </div>

            {clientMode === "search" && (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    Buscar por nome ou telefone
                  </label>
                  <input
                    type="text"
                    value={leadSearch}
                    onChange={(e) => setLeadSearch(e.target.value)}
                    placeholder="Digite para buscar..."
                    className={inputClass}
                  />
                </div>

                {searchingLeads && (
                  <p className="text-xs text-gray-500">Buscando...</p>
                )}

                {leadResults.length > 0 && !selectedLead && (
                  <div className="max-h-48 overflow-y-auto rounded-md border">
                    {leadResults.map((lead) => (
                      <button
                        key={lead.id}
                        type="button"
                        onClick={() => {
                          setSelectedLead(lead)
                          setLeadResults([])
                        }}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                      >
                        <span className="font-medium">{lead.name ?? "Sem nome"}</span>
                        <span className="ml-2 text-gray-500">{lead.phone}</span>
                      </button>
                    ))}
                  </div>
                )}

                {selectedLead && (
                  <div className="flex items-center gap-3 rounded-md border border-green-200 bg-green-50 p-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-green-800">
                        {selectedLead.name ?? "Sem nome"}
                      </p>
                      <p className="text-xs text-green-600">
                        {selectedLead.phone} {selectedLead.email ? `| ${selectedLead.email}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedLead(null)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Remover
                    </button>
                  </div>
                )}
              </div>
            )}

            {clientMode === "new" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    Nome
                  </label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    Telefone
                  </label>
                  <input
                    type="text"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    Email
                  </label>
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    CPF
                  </label>
                  <input
                    type="text"
                    value={clientCpf}
                    onChange={(e) => setClientCpf(e.target.value)}
                    placeholder="000.000.000-00"
                    maxLength={14}
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={createLead}
                      onChange={(e) => setCreateLead(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    Criar como lead no sistema
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Sale Messages */}
          {saleError && (
            <p className="mt-4 text-sm text-red-600">{saleError}</p>
          )}
          {saleSuccess && (
            <div className="mt-4 space-y-2">
              <p className="text-sm text-green-600">Venda registrada com sucesso! Redirecionando...</p>
              {portalVinculado && (
                <p className="text-sm font-medium text-green-700">
                  Cliente adicionado ao portal de obra ✓
                </p>
              )}
            </div>
          )}

          {/* Sale Actions */}
          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={handleSaveSale}
              disabled={savingSale}
              className="rounded-md bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {savingSale ? "Registrando..." : "Registrar venda"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowSaleForm(false)
                setStatus(unit.status)
              }}
              className="rounded-md border border-gray-300 px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancelar venda
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
