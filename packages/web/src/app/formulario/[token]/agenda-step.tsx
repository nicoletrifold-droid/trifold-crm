"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  gradeDoMes,
  mesesDisponiveis,
  nomeDoMes,
  rotuloDoDia,
  DIAS_DA_SEMANA,
} from "@web/lib/appointments/month-grid"

// Story 75-331 — o passo de agenda, depois do formulário enviado.
// Story 75-335 — apresentação em CALENDÁRIO MENSAL, a pedido do Marcos: mês em
// grade, clicar no dia, horários ao lado (modelo Calendly). A fileira de chips
// anterior não dava noção de calendário.
//
// A conta de calendário vive em lib/appointments/month-grid.ts, testada sem DOM.

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
  const [mes, setMes] = useState<string>("")
  const [date, setDate] = useState("")
  const [slots, setSlots] = useState<SlotOption[]>([])
  const [carregando, setCarregando] = useState(true)
  const [carregandoSlots, setCarregandoSlots] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState("")
  const [agendado, setAgendado] = useState<{ scheduled_at: string; location: string } | null>(null)

  useEffect(() => {
    let vivo = true
    void (async () => {
      try {
        const res = await fetch(`/api/formulario/${token}/agenda`, { cache: "no-store" })
        const json = (await res.json()) as { locations?: string[]; days?: DayOption[] }
        if (!vivo) return
        const dias = json.days ?? []
        setLocations(json.locations ?? [])
        setDays(dias)
        setLocation(json.locations?.[0] ?? "")
        setMes(mesesDisponiveis(dias.map((d) => d.date))[0] ?? "")
      } finally {
        if (vivo) setCarregando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [token])

  const disponiveis = useMemo(() => days.map((d) => d.date), [days])
  const meses = useMemo(() => mesesDisponiveis(disponiveis), [disponiveis])
  const semanas = useMemo(() => (mes ? gradeDoMes({ mes, disponiveis }) : []), [mes, disponiveis])
  const indiceMes = meses.indexOf(mes)

  const carregarSlots = useCallback(
    async (dia: string) => {
      setCarregandoSlots(true)
      setSlots([])
      try {
        const res = await fetch(`/api/formulario/${token}/agenda?date=${dia}`, { cache: "no-store" })
        const json = (await res.json()) as { slots?: SlotOption[] }
        setSlots(json.slots ?? [])
      } finally {
        setCarregandoSlots(false)
      }
    },
    [token]
  )

  function escolherDia(dia: string) {
    setDate(dia)
    setErro("")
    void carregarSlots(dia)
  }

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
        // 409 = alguém pegou o horário enquanto a pessoa decidia.
        if (res.status === 409 && date) void carregarSlots(date)
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
        <p className="mt-3 text-sm text-stone-400">
          Nossa equipe entra em contato com você. Se precisar remarcar, é só responder o WhatsApp.
        </p>
      </div>
    )
  }

  if (carregando) {
    return <p className="text-center text-sm text-stone-400">Carregando horários…</p>
  }

  // Sem dia aberto: a captação já aconteceu, então encerra bem em vez de
  // mostrar um calendário todo cinza.
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

  const livres = slots.filter((s) => s.free)

  return (
    <div>
      <h2 className="text-base font-semibold text-stone-100">Escolha o dia e o horário</h2>
      <p className="mt-1 text-sm text-stone-400">Visita de 1 hora, com um especialista.</p>

      {locations.length > 1 && (
        <select
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="mt-3 w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-100"
        >
          {locations.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      )}

      {/* Calendário à esquerda, horários à direita — modelo Calendly. No celular
          empilha, com os horários logo abaixo do dia escolhido. */}
      <div className="mt-4 gap-5 sm:flex">
        <div className="sm:flex-1">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMes(meses[indiceMes - 1] ?? mes)}
              disabled={indiceMes <= 0}
              className="rounded px-2 py-1 text-stone-400 disabled:opacity-30"
              aria-label="Mês anterior"
            >
              ‹
            </button>
            <span className="text-sm font-medium text-stone-200">
              {mes ? nomeDoMes(Number(mes.slice(0, 4)), Number(mes.slice(5, 7))) : ""}
            </span>
            <button
              type="button"
              onClick={() => setMes(meses[indiceMes + 1] ?? mes)}
              disabled={indiceMes >= meses.length - 1}
              className="rounded px-2 py-1 text-stone-400 disabled:opacity-30"
              aria-label="Próximo mês"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {DIAS_DA_SEMANA.map((d) => (
              <span key={d} className="pb-1 text-[11px] font-medium uppercase text-stone-500">
                {d}
              </span>
            ))}
            {semanas.flat().map((c, i) => {
              if (!c.date) return <span key={`v${i}`} />
              const selecionado = c.date === date
              return (
                <button
                  key={c.date}
                  type="button"
                  disabled={!c.disponivel}
                  onClick={() => escolherDia(c.date!)}
                  className={`aspect-square rounded-full text-sm transition ${
                    selecionado
                      ? "bg-orange-600 font-semibold text-white"
                      : c.disponivel
                        ? "bg-orange-500/10 font-medium text-orange-300 hover:bg-orange-500/25"
                        : "text-stone-600"
                  }`}
                >
                  {c.dia}
                </button>
              )
            })}
          </div>
        </div>

        <div className="mt-5 sm:mt-0 sm:w-44 sm:shrink-0">
          {!date ? (
            <p className="text-sm text-stone-500">Escolha um dia no calendário.</p>
          ) : (
            <>
              <p className="mb-2 text-sm font-medium text-stone-200">{rotuloDoDia(date)}</p>
              {carregandoSlots ? (
                <p className="text-sm text-stone-500">Carregando…</p>
              ) : livres.length === 0 ? (
                <p className="text-sm text-stone-500">
                  Sem horários livres neste dia. Escolha outro.
                </p>
              ) : (
                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {livres.map((s) => (
                    <button
                      key={s.startIso}
                      type="button"
                      disabled={enviando}
                      onClick={() => void agendar(s.startIso)}
                      className="w-full rounded-lg border border-orange-500/40 bg-transparent px-3 py-2.5 text-sm font-medium text-orange-300 transition hover:border-orange-400 hover:bg-orange-500/10 disabled:opacity-50"
                    >
                      {s.labelLocal}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {erro ? <p className="mt-3 text-sm text-red-400">{erro}</p> : null}
    </div>
  )
}
