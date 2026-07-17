"use client"

import { useCallback, useEffect, useState } from "react"

// Story 81-4 — form do link público de agendamento da imobiliária.
// Fluxo: decorado → dia → horário livre (equipe IMOB) → dados do cliente → confirmação.

interface DayOption {
  date: string
  label: string
}

interface SlotOption {
  startIso: string
  labelLocal: string
  free: boolean
}

interface BookingFormProps {
  token: string
  locations: string[]
  days: DayOption[]
}

const inputCls =
  "w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-100 placeholder-stone-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"

export function BookingForm({ token, locations, days }: BookingFormProps) {
  const [location, setLocation] = useState(locations[0] ?? "")
  const [date, setDate] = useState(days[0]?.date ?? "")
  const [slots, setSlots] = useState<SlotOption[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [selected, setSelected] = useState<string>("") // startIso

  const [clientName, setClientName] = useState("")
  const [clientPhone, setClientPhone] = useState("")
  const [clientEmail, setClientEmail] = useState("")
  // Story 81-5: corretor DA IMOBILIÁRIA que acompanha a visita (opcional — pode não ir ninguém)
  const [brokerName, setBrokerName] = useState("")
  const [brokerPhone, setBrokerPhone] = useState("")
  const [notes, setNotes] = useState("")

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState<{ scheduled_at: string; location: string; cancel_token: string } | null>(null)

  const loadSlots = useCallback(async () => {
    if (!date || !location) return
    setSlotsLoading(true)
    setSelected("")
    try {
      const res = await fetch(
        `/api/agendar/${token}?date=${date}&location=${encodeURIComponent(location)}`,
        { cache: "no-store" }
      )
      const json = (await res.json()) as { slots?: SlotOption[] }
      setSlots(json.slots ?? [])
    } catch {
      setSlots([])
    } finally {
      setSlotsLoading(false)
    }
  }, [token, date, location])

  useEffect(() => {
    void loadSlots()
  }, [loadSlots])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (!selected) return setError("Escolha um horário disponível.")
    if (!clientName.trim()) return setError("Informe o nome do cliente.")
    if (!clientPhone.trim()) return setError("Informe o telefone do cliente.")

    setSubmitting(true)
    try {
      const res = await fetch(`/api/agendar/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduled_at: selected,
          location,
          client_name: clientName.trim(),
          client_phone: clientPhone.trim(),
          client_email: clientEmail.trim() || null,
          broker_name: brokerName.trim() || null,
          broker_phone: brokerPhone.trim() || null,
          notes: notes.trim() || null,
        }),
      })
      const json = (await res.json()) as {
        data?: { scheduled_at: string; location: string; cancel_token: string }
        error?: string
      }
      if (!res.ok || !json.data) {
        setError(json.error ?? "Não foi possível agendar. Tente novamente.")
        if (res.status === 409) void loadSlots() // slot ocupado na corrida → atualiza a grade
        return
      }
      setDone(json.data)
    } catch {
      setError("Falha de conexão. Tente novamente.")
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    const when = new Date(done.scheduled_at).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
    return (
      <div className="text-center">
        <p className="text-3xl">✅</p>
        <h2 className="mt-2 text-lg font-semibold text-stone-100">Visita confirmada!</h2>
        <p className="mt-2 text-sm text-stone-300">
          {clientName} · {when}
        </p>
        <p className="text-sm text-stone-400">{done.location}</p>
        <p className="mt-4 text-xs text-stone-500">
          Precisa cancelar?{" "}
          <a href={`/agendar/cancelar/${done.cancel_token}`} className="text-violet-400 underline">
            Cancele por aqui
          </a>
          .
        </p>
        <button
          type="button"
          onClick={() => {
            setDone(null)
            setClientName("")
            setClientPhone("")
            setClientEmail("")
            setNotes("")
            void loadSlots()
          }}
          className="mt-6 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
        >
          Marcar outra visita
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-stone-300">Decorado</label>
        <select value={location} onChange={(e) => setLocation(e.target.value)} className={inputCls}>
          {locations.map((loc) => (
            <option key={loc} value={loc}>
              {loc}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-stone-300">Dia</label>
        <select value={date} onChange={(e) => setDate(e.target.value)} className={inputCls}>
          {days.map((d) => (
            <option key={d.date} value={d.date}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-stone-300">Horário</label>
        {slotsLoading ? (
          <p className="py-2 text-sm text-stone-500">Carregando horários…</p>
        ) : slots.length === 0 ? (
          <p className="py-2 text-sm text-stone-500">Sem horários neste dia — escolha outro dia.</p>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {slots.map((s) => (
              <button
                key={s.startIso}
                type="button"
                disabled={!s.free}
                onClick={() => setSelected(s.startIso)}
                className={`rounded-lg border px-2 py-1.5 text-sm font-medium transition-colors ${
                  selected === s.startIso
                    ? "border-violet-500 bg-violet-600 text-white"
                    : s.free
                      ? "border-stone-700 bg-stone-800 text-stone-200 hover:border-violet-500"
                      : "cursor-not-allowed border-stone-800 bg-stone-900 text-stone-600 line-through"
                }`}
              >
                {s.labelLocal}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-stone-300">
          Nome do cliente <span className="text-red-400">*</span>
        </label>
        <input value={clientName} onChange={(e) => setClientName(e.target.value)} className={inputCls} placeholder="Nome completo" required />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-stone-300">
          Telefone (WhatsApp) <span className="text-red-400">*</span>
        </label>
        <input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} className={inputCls} placeholder="(44) 99999-9999" required inputMode="tel" />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-stone-300">E-mail (opcional)</label>
        <input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} className={inputCls} placeholder="cliente@email.com" type="email" />
      </div>

      {/* Story 81-5 — corretor da imobiliária que acompanha (opcional) */}
      <div className="rounded-lg border border-stone-800 bg-stone-900/60 p-3">
        <p className="mb-2 text-xs font-medium text-stone-400">
          Corretor da sua equipe que vai acompanhar a visita (opcional)
        </p>
        <div className="space-y-3">
          <input
            value={brokerName}
            onChange={(e) => setBrokerName(e.target.value)}
            className={inputCls}
            placeholder="Nome do corretor"
          />
          <input
            value={brokerPhone}
            onChange={(e) => setBrokerPhone(e.target.value)}
            className={inputCls}
            placeholder="Telefone do corretor — (44) 99999-9999"
            inputMode="tel"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-stone-300">Observações (opcional)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} rows={2} placeholder="Ex.: cliente busca 3 quartos" />
      </div>

      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
      >
        {submitting ? "Agendando…" : "Confirmar visita"}
      </button>
    </form>
  )
}
