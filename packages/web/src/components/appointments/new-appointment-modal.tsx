"use client"

import { useState, useEffect, useRef, useCallback } from "react"

// Story 81-2: só DECORADOS como local (decisão do diretor — "Sala de Reuniões" removida).
// Story 81-4: mapa movido para lib compartilhada (o link público usa o mesmo).
import { PROPERTY_MAP, LOCATIONS } from "@web/lib/appointments/locations"
// Story 81-7: compromisso IMOB interno vincula imobiliária (opcional, com cadastro
// inline via "+ Nova") + corretor parceiro — mesmos campos do link público.
import { ImobiliariaFormModal } from "@web/app/dashboard/imob/imobiliarias/_components/imobiliaria-form-modal"
import type { Imobiliaria } from "@web/lib/imob/imobiliarias"

// Todo compromisso da agenda é fixo em 1 hora, em hora cheia (decisão de produto:
// visitas/compromissos de 1 em 1 hora). A duração não é mais escolhida pelo usuário.
const APPOINTMENT_DURATION_MIN = 60

// Garante hora cheia ("HH:MM" → "HH:00"); string vazia continua vazia.
function snapToWholeHour(value: string): string {
  if (!value) return ""
  const h = value.split(":")[0] ?? "00"
  return `${h.padStart(2, "0")}:00`
}

interface Lead {
  id: string
  name: string
  phone: string
  email?: string | null
}

interface NewAppointmentModalProps {
  brokerId?: string
  /**
   * Story 81-2: role do usuário logado. admin/supervisor veem o seletor de EQUIPE
   * (HOUSE × IMOB) e mandam `team` no POST; perfil `imob` vê indicação fixa "IMOB";
   * demais não veem nada (o servidor força a equipe — Story 81-1 `resolveTeam`).
   */
  userRole?: string
  onClose: () => void
  onSuccess?: () => void
}

type LeadMode = "search" | "new"

export function NewAppointmentModal({
  brokerId,
  userRole,
  onClose,
  onSuccess,
}: NewAppointmentModalProps) {
  const [location, setLocation] = useState("")
  const [team, setTeam] = useState<"house" | "imob">("house") // Story 81-2
  const canPickTeam = userRole === "admin" || userRole === "supervisor"
  // Story 81-7 — compromisso da equipe IMOB (Daiana ou admin/supervisor com IMOB
  // selecionado): vincular imobiliária (opcional) + corretor parceiro (opcional).
  const isImobTeam = userRole === "imob" || (canPickTeam && team === "imob")
  const [imobiliarias, setImobiliarias] = useState<Array<{ id: string; nome: string }> | null>(null)
  const [imobiliariaId, setImobiliariaId] = useState("")
  const [showNewImobiliaria, setShowNewImobiliaria] = useState(false)
  const [partnerBrokerName, setPartnerBrokerName] = useState("")
  const [partnerBrokerPhone, setPartnerBrokerPhone] = useState("")

  // Carrega a lista de imobiliárias na 1ª vez que a equipe IMOB entra em cena.
  useEffect(() => {
    if (!isImobTeam || imobiliarias !== null) return
    let cancelled = false
    fetch("/api/imob/imobiliarias")
      .then(async (res) => (res.ok ? ((await res.json()) as { imobiliarias: Array<{ id: string; nome: string }> }) : null))
      .then((json) => {
        if (!cancelled) setImobiliarias(json?.imobiliarias ?? [])
      })
      .catch(() => {
        if (!cancelled) setImobiliarias([])
      })
    return () => {
      cancelled = true
    }
  }, [isImobTeam, imobiliarias])

  function handleImobiliariaCreated(nova: Imobiliaria) {
    setImobiliarias((prev) => {
      const list = [...(prev ?? []), { id: nova.id, nome: nova.nome }]
      return list.sort((a, b) => a.nome.localeCompare(b.nome))
    })
    setImobiliariaId(nova.id)
    setShowNewImobiliaria(false)
  }
  const [date, setDate] = useState("")
  const [time, setTime] = useState("")
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
      // segmento=all: a Agenda vincula leads do funil principal E do IMOB (a API só libera
      // IMOB para quem tem acesso ao módulo; sem acesso, cai em 'principal').
      const res = await fetch(
        `/api/leads?search=${encodeURIComponent(q)}&segmento=all&limit=10`
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

    const scheduledAt = new Date(`${date}T${snapToWholeHour(time)}:00`)
    if (isNaN(scheduledAt.getTime())) {
      return setError("Data ou hora inválida.")
    }
    scheduledAt.setMinutes(0, 0, 0) // garante hora cheia

    const payload: Record<string, unknown> = {
      scheduled_at: scheduledAt.toISOString(),
      duration_minutes: APPOINTMENT_DURATION_MIN,
      location,
      property_id: property?.id ?? null,
      notes: notes.trim() || null,
    }

    // Story 81-2: só admin/supervisor escolhem a equipe (o servidor valida/força — 81-1).
    if (canPickTeam) {
      payload.team = team
    }

    // Story 81-7: extras da equipe IMOB (todos opcionais — Daiana pode atender direto).
    if (isImobTeam) {
      if (imobiliariaId) payload.imobiliaria_id = imobiliariaId
      if (partnerBrokerName.trim()) payload.partner_broker_name = partnerBrokerName.trim()
      if (partnerBrokerPhone.trim()) payload.partner_broker_phone = partnerBrokerPhone.trim()
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
            {/* Team (Story 81-2 — admin/supervisor escolhem; imob fixo; resto oculto) */}
            {canPickTeam ? (
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">
                  Equipe
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTeam("house")}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold tracking-wide transition-colors ${
                      team === "house"
                        ? "border-orange-400 bg-orange-50 text-orange-700 dark:border-orange-400 dark:bg-orange-500/15 dark:text-orange-300"
                        : "border-stone-300 text-stone-500 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-800"
                    }`}
                  >
                    HOUSE
                  </button>
                  <button
                    type="button"
                    onClick={() => setTeam("imob")}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold tracking-wide transition-colors ${
                      team === "imob"
                        ? "border-violet-500 bg-violet-50 text-violet-700 dark:border-violet-500 dark:bg-violet-500/15 dark:text-violet-300"
                        : "border-stone-300 text-stone-500 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-800"
                    }`}
                  >
                    IMOB
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-stone-400 dark:text-stone-500">
                  Equipes não disputam horário entre si — o conflito vale só dentro da mesma equipe.
                </p>
              </div>
            ) : userRole === "imob" ? (
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                  IMOB
                </span>
                <span className="text-[11px] text-stone-400 dark:text-stone-500">
                  Compromisso da equipe IMOB
                </span>
              </div>
            ) : null}

            {/* Story 81-7 — extras da equipe IMOB: imobiliária (opcional, com cadastro
                inline) + corretor parceiro (opcional) — mesmos campos do link público */}
            {isImobTeam && (
              <div className="space-y-3 rounded-lg border border-violet-500/30 bg-violet-500/5 p-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">
                    Imobiliária parceira <span className="text-xs font-normal text-stone-400">(opcional)</span>
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={imobiliariaId}
                      onChange={(e) => setImobiliariaId(e.target.value)}
                      className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
                    >
                      <option value="">Sem imobiliária (atendimento direto)</option>
                      {(imobiliarias ?? []).map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.nome}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowNewImobiliaria(true)}
                      title="Cadastrar nova imobiliária"
                      className="shrink-0 rounded-lg border border-violet-400 px-3 py-2 text-sm font-semibold text-violet-600 hover:bg-violet-50 dark:border-violet-500 dark:text-violet-300 dark:hover:bg-violet-500/10"
                    >
                      + Nova
                    </button>
                  </div>
                  {imobiliarias === null && (
                    <p className="mt-1 text-[11px] text-stone-400 dark:text-stone-500">Carregando imobiliárias…</p>
                  )}
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-stone-500 dark:text-stone-400">
                    Corretor parceiro que acompanha (opcional)
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      value={partnerBrokerName}
                      onChange={(e) => setPartnerBrokerName(e.target.value)}
                      placeholder="Nome do corretor"
                      className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
                    />
                    <input
                      value={partnerBrokerPhone}
                      onChange={(e) => setPartnerBrokerPhone(e.target.value)}
                      placeholder="Telefone — (44) 99999-9999"
                      inputMode="tel"
                      className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
                    />
                  </div>
                </div>
              </div>
            )}

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
                  onChange={(e) => setTime(snapToWholeHour(e.target.value))}
                  step={3600}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
                  required
                />
              </div>
            </div>

            {/* Duração — fixa em 1 hora (compromissos de 1 em 1 hora) */}
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">
                Duração
              </label>
              <div className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600 dark:border-stone-700 dark:bg-stone-800/60 dark:text-stone-400">
                1 hora (horário fixo)
              </div>
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

      {/* Story 81-7 — cadastro inline de imobiliária (reusa o modal do módulo IMOB, 75-148) */}
      {showNewImobiliaria && (
        <ImobiliariaFormModal
          editing={null}
          onClose={() => setShowNewImobiliaria(false)}
          onSaved={handleImobiliariaCreated}
        />
      )}
    </div>
  )
}
