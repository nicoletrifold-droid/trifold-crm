"use client"

import { useState, useEffect, useRef, useCallback } from "react"

const PROPERTY_MAP: Record<string, { id: string; name: string } | null> = {
  "Decorado Vind": {
    id: "00000000-0000-0000-0004-000000000001",
    name: "Vind Residence",
  },
  "Decorado Yarden": {
    id: "00000000-0000-0000-0004-000000000002",
    name: "Yarden",
  },
  "Sala de Reuniões": null,
}

const LOCATIONS = Object.keys(PROPERTY_MAP) as Array<keyof typeof PROPERTY_MAP>

const DURATION_OPTIONS = [
  { value: 30, label: "30 minutos" },
  { value: 45, label: "45 minutos" },
  { value: 60, label: "60 minutos" },
  { value: 90, label: "90 minutos" },
]

interface Lead {
  id: string
  name: string
  phone: string
  email?: string | null
}

interface NewAppointmentModalProps {
  brokerId?: string
  onClose: () => void
  onSuccess?: () => void
}

type LeadMode = "search" | "new"

export function NewAppointmentModal({
  brokerId,
  onClose,
  onSuccess,
}: NewAppointmentModalProps) {
  const [location, setLocation] = useState("")
  const [date, setDate] = useState("")
  const [time, setTime] = useState("")
  const [duration, setDuration] = useState(30)
  const [notes, setNotes] = useState("")

  // Lead section
  const [leadMode, setLeadMode] = useState<LeadMode>("search")
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Lead[]>([])
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)

  // New client fields
  const [clientName, setClientName] = useState("")
  const [clientPhone, setClientPhone] = useState("")
  const [clientEmail, setClientEmail] = useState("")

  // Submission
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const property = location ? (PROPERTY_MAP[location] ?? null) : null

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (!q || q.length < 2) {
      setSearchResults([])
      return
    }
    setSearchLoading(true)
    try {
      const res = await fetch(
        `/api/leads?search=${encodeURIComponent(q)}&limit=10`
      )
      if (res.ok) {
        const json = (await res.json()) as { data?: Lead[] }
        setSearchResults(json.data ?? [])
      }
    } catch {
      // ignore
    } finally {
      setSearchLoading(false)
    }
  }, [])

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => {
      void doSearch(searchQuery)
    }, 300)
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    }
  }, [searchQuery, doSearch])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (!location) return setError("Selecione um local.")
    if (!date) return setError("Selecione uma data.")
    if (!time) return setError("Selecione um horário.")

    if (leadMode === "search" && !selectedLead) {
      return setError("Selecione um lead ou mude para Novo Cliente.")
    }
    if (leadMode === "new" && !clientPhone) {
      return setError("Telefone do cliente é obrigatório.")
    }
    if (leadMode === "new" && !clientName) {
      return setError("Nome do cliente é obrigatório.")
    }

    const scheduledAt = new Date(`${date}T${time}:00`)
    if (isNaN(scheduledAt.getTime())) {
      return setError("Data ou hora inválida.")
    }

    const payload: Record<string, unknown> = {
      scheduled_at: scheduledAt.toISOString(),
      duration_minutes: duration,
      location,
      property_id: property?.id ?? null,
      notes: notes.trim() || null,
    }

    if (brokerId) {
      payload.broker_id = brokerId
    }

    if (leadMode === "search" && selectedLead) {
      payload.lead_id = selectedLead.id
    } else {
      payload.client_name = clientName.trim()
      payload.client_phone = clientPhone.trim()
      payload.client_email = clientEmail.trim() || null
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (res.status === 409) {
        const json = (await res.json()) as { error?: string }
        setError(json.error ?? "Conflito de horário.")
        return
      }

      if (!res.ok) {
        const json = (await res.json()) as { error?: string }
        setError(json.error ?? "Erro ao criar agendamento.")
        return
      }

      setSuccess(true)
      onSuccess?.()
      setTimeout(() => onClose(), 1500)
    } catch {
      setError("Erro de conexão. Tente novamente.")
    } finally {
      setSubmitting(false)
    }
  }

  // Close on backdrop click
  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8"
      onClick={handleBackdrop}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl dark:bg-stone-900 dark:ring-1 dark:ring-stone-800 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4 dark:border-stone-800">
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
            Novo Compromisso
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-300"
          >
            ✕
          </button>
        </div>

        {success ? (
          <div className="flex items-center justify-center px-6 py-12">
            <div className="text-center">
              <div className="mb-3 text-4xl">✅</div>
              <p className="text-lg font-semibold text-stone-900 dark:text-stone-100">
                Agendamento criado!
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
            {/* Location */}
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">
                Local <span className="text-red-500">*</span>
              </label>
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
                required
              >
                <option value="">Selecione um local</option>
                {LOCATIONS.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </div>

            {/* Property (auto-shown) */}
            {property && (
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">
                  Empreendimento
                </label>
                <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700 dark:border-stone-700 dark:bg-stone-800/50 dark:text-stone-300">
                  {property.name}
                </div>
              </div>
            )}

            {/* Date + Time */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">
                  Data <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">
                  Hora <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  step={1800}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
                  required
                />
              </div>
            </div>

            {/* Duration */}
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">
                Duração
              </label>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
              >
                {DURATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Lead section */}
            <div>
              <label className="mb-2 block text-sm font-medium text-stone-700 dark:text-stone-300">
                Cliente <span className="text-red-500">*</span>
              </label>
              {/* Radio toggle */}
              <div className="mb-3 flex gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-600 dark:text-stone-400">
                  <input
                    type="radio"
                    name="leadMode"
                    value="search"
                    checked={leadMode === "search"}
                    onChange={() => setLeadMode("search")}
                    className="accent-orange-600"
                  />
                  Buscar lead existente
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-600 dark:text-stone-400">
                  <input
                    type="radio"
                    name="leadMode"
                    value="new"
                    checked={leadMode === "new"}
                    onChange={() => setLeadMode("new")}
                    className="accent-orange-600"
                  />
                  Novo cliente
                </label>
              </div>

              {leadMode === "search" ? (
                <div className="relative">
                  {selectedLead ? (
                    <div className="flex items-center justify-between rounded-lg border border-green-400 bg-green-50 px-3 py-2 text-sm dark:border-green-600/40 dark:bg-green-900/20">
                      <div>
                        <p className="font-medium text-stone-900 dark:text-stone-100">
                          {selectedLead.name}
                        </p>
                        <p className="text-xs text-stone-500 dark:text-stone-400">
                          {selectedLead.phone}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedLead(null)
                          setSearchQuery("")
                        }}
                        className="text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
                      >
                        Trocar
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Buscar por nome ou telefone..."
                        className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
                      />
                      {(searchLoading || searchResults.length > 0) && (
                        <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-stone-200 bg-white shadow-lg dark:border-stone-700 dark:bg-stone-800">
                          {searchLoading && (
                            <p className="px-3 py-2 text-xs text-stone-400 dark:text-stone-500">
                              Buscando...
                            </p>
                          )}
                          {!searchLoading &&
                            searchResults.map((lead) => (
                              <button
                                key={lead.id}
                                type="button"
                                onClick={() => {
                                  setSelectedLead(lead)
                                  setSearchResults([])
                                  setSearchQuery("")
                                }}
                                className="block w-full px-3 py-2 text-left text-sm hover:bg-stone-50 dark:hover:bg-stone-700"
                              >
                                <p className="font-medium text-stone-900 dark:text-stone-100">
                                  {lead.name}
                                </p>
                                <p className="text-xs text-stone-500 dark:text-stone-400">
                                  {lead.phone}
                                </p>
                              </button>
                            ))}
                          {!searchLoading && searchResults.length === 0 && searchQuery.length >= 2 && (
                            <p className="px-3 py-2 text-xs text-stone-400 dark:text-stone-500">
                              Nenhum lead encontrado
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">
                      Nome <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="Nome completo"
                      className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">
                      Telefone <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                      placeholder="(44) 99999-9999"
                      className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">
                      E-mail (opcional)
                    </label>
                    <input
                      type="email"
                      value={clientEmail}
                      onChange={(e) => setClientEmail(e.target.value)}
                      placeholder="email@exemplo.com"
                      className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">
                Notas (opcional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Observações sobre o agendamento..."
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-1 pb-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
              >
                {submitting ? "Criando..." : "Criar agendamento"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
