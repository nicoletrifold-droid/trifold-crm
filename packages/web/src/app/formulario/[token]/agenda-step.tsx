"use client"

import { useCallback, useEffect, useState } from "react"

// Story 75-331 (Epic 89) — o passo de agenda, depois do formulário enviado.
//
// Mesmo desenho do `/agendar/[token]` da imobiliária: decorado → dia → horário
// livre. A diferença é o que a tela final PROMETE (ver AC6): aqui não existe
// passo de confirmação, então ela não pode dizer "confirmaremos com você".

interface DayOption {
  date: string
  label: string
}
interface SlotOption {
  startIso: string
  labelLocal: string
  free: boolean
}

export function AgendaStep({
  token,
  sessionToken,
  mensagemFinal,
}: {
  token: string
  sessionToken: string
  mensagemFinal: string | null
}) {
  const [locations, setLocations] = useState<string[]>([])
  const [days, setDays] = useState<DayOption[]>([])
  const [location, setLocation] = useState("")
  const [date, setDate] = useState("")
  const [slots, setSlots] = useState<SlotOption[]>([])
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState("")
  const [agendado, setAgendado] = useState<{ scheduled_at: string; location: string } | null>(null)

  // Carga inicial: decorados e dias abertos.
  useEffect(() => {
    let vivo = true
    void (async () => {
      try {
        const res = await fetch(`/api/formulario/${token}/agenda`, { cache: "no-store" })
        const json = (await res.json()) as { locations?: string[]; days?: DayOption[] }
        if (!vivo) return
        setLocations(json.locations ?? [])
        setDays(json.days ?? [])
        setLocation(json.locations?.[0] ?? "")
        setDate(json.days?.[0]?.date ?? "")
      } finally {
        if (vivo) setCarregando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [token])

  const carregarSlots = useCallback(async () => {
    if (!date) return
    setSlots([])
    const res = await fetch(`/api/formulario/${token}/agenda?date=${date}`, { cache: "no-store" })
    const json = (await res.json()) as { slots?: SlotOption[] }
    setSlots(json.slots ?? [])
  }, [token, date])

  useEffect(() => {
    void carregarSlots()
  }, [carregarSlots])

  async function agendar(startIso: string) {
    setEnviando(true)
    setErro("")
    try {
      const res = await fetch(`/api/formulario/${token}/agenda`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_token: sessionToken, scheduled_at: startIso, location }),
      })
      const json = (await res.json()) as {
        error?: string
        data?: { scheduled_at: string; location: string }
      }
      if (!res.ok || !json.data) {
        setErro(json.error ?? "Não foi possível agendar. Escolha outro horário.")
        // 409 = alguém pegou o horário enquanto a pessoa decidia: recarrega a grade
        // para ela não tentar de novo no mesmo slot já ocupado.
        if (res.status === 409) void carregarSlots()
        return
      }
      setAgendado(json.data)
    } catch {
      setErro("Não foi possível agendar. Verifique sua conexão.")
    } finally {
      setEnviando(false)
    }
  }

  if (agendado) {
    const quando = new Date(agendado.scheduled_at).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
    return (
      <div className="text-center">
        <p className="text-3xl">📅</p>
        <h2 className="mt-3 text-lg font-semibold text-stone-100">Visita agendada!</h2>
        <p className="mt-2 text-sm text-stone-300">
          <strong>{quando}</strong>
          <br />
          {agendado.location}
        </p>
        {/* AC6 — NÃO prometer confirmação: ninguém vai confirmar. Prometer o que
            não acontece é fabricar no-show. */}
        <p className="mt-3 text-sm text-stone-400">
          Nossa equipe entra em contato com você. Se precisar remarcar, é só responder o
          WhatsApp.
        </p>
      </div>
    )
  }

  if (carregando) {
    return <p className="text-center text-sm text-stone-400">Carregando horários…</p>
  }

  // Sem dia aberto (org sem horário configurado, feriado prolongado): a captação
  // já aconteceu, então a tela encerra bem em vez de mostrar grade vazia (AC7).
  if (days.length === 0) {
    return (
      <div className="text-center">
        <p className="text-3xl">✅</p>
        <h2 className="mt-3 text-lg font-semibold text-stone-100">Recebemos suas respostas!</h2>
        <p className="mt-2 text-sm text-stone-400">
          {mensagemFinal ?? "Nossa equipe entrará em contato para combinar a visita."}
        </p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-base font-semibold text-stone-100">Quer conhecer o decorado?</h2>
      <p className="mt-1 text-sm text-stone-400">Escolha o melhor dia e horário para você.</p>

      {locations.length > 1 && (
        <div className="mt-4">
          <label className="block text-xs text-stone-400">Decorado</label>
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-100"
          >
            {locations.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="mt-4">
        <label className="block text-xs text-stone-400">Dia</label>
        <div className="mt-1 flex gap-2 overflow-x-auto pb-1">
          {days.map((d) => (
            <button
              key={d.date}
              type="button"
              onClick={() => setDate(d.date)}
              className={`shrink-0 rounded-lg border px-3 py-2 text-xs transition ${
                date === d.date
                  ? "border-violet-500 bg-violet-500/10 text-stone-100"
                  : "border-stone-700 bg-stone-800 text-stone-300"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <label className="block text-xs text-stone-400">Horário</label>
        {slots.filter((s) => s.free).length === 0 ? (
          <p className="mt-2 text-sm text-stone-500">
            Sem horários livres neste dia. Escolha outro dia.
          </p>
        ) : (
          <div className="mt-2 grid grid-cols-3 gap-2">
            {slots
              .filter((s) => s.free)
              .map((s) => (
                <button
                  key={s.startIso}
                  type="button"
                  disabled={enviando}
                  onClick={() => void agendar(s.startIso)}
                  className="rounded-lg border border-stone-700 bg-stone-800 px-2 py-2 text-sm text-stone-100 transition hover:border-violet-500 disabled:opacity-50"
                >
                  {s.labelLocal}
                </button>
              ))}
          </div>
        )}
      </div>

      {erro ? <p className="mt-3 text-sm text-red-400">{erro}</p> : null}
    </div>
  )
}
