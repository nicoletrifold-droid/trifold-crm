"use client"

import { useState, useTransition, useEffect } from "react"
import { Clock, SlidersHorizontal, Bell } from "lucide-react"

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

interface RoletaConfig {
  is_active: boolean
  business_days: number[]
  business_hour_start: string
  business_hour_end: string
  timezone: string
  notify_push: boolean
  notify_email: boolean
  notify_whatsapp: boolean
}

interface Props {
  initialConfig: RoletaConfig | null
}

export function RoletaConfigPanel({ initialConfig }: Props) {
  const defaults: RoletaConfig = {
    is_active: false,
    business_days: [1, 2, 3, 4, 5],
    business_hour_start: "08:00",
    business_hour_end: "18:00",
    timezone: "America/Sao_Paulo",
    notify_push: true,
    notify_email: true,
    notify_whatsapp: true,
  }

  const [config, setConfig] = useState<RoletaConfig>(initialConfig ?? defaults)
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState(false)

  // Auto-dismiss "Salvo!" after 3s
  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(false), 3000)
    return () => clearTimeout(t)
  }, [saved])

  function toggleDay(day: number) {
    setConfig((c) => ({
      ...c,
      business_days: c.business_days.includes(day)
        ? c.business_days.filter((d) => d !== day)
        : [...c.business_days, day].sort(),
    }))
    setSaved(false)
  }

  function save() {
    setSaveError(false)
    startTransition(async () => {
      const res = await fetch("/api/roleta/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      })
      if (res.ok) {
        setSaved(true)
      } else {
        setSaveError(true)
      }
    })
  }

  return (
    <div className="rounded-xl border border-stone-800 bg-stone-900 p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <SlidersHorizontal className={`h-4 w-4 ${config.is_active ? "text-emerald-400" : "text-stone-500"}`} />
          Configuração da Roleta
        </h2>
        <button
          onClick={() => { setConfig((c) => ({ ...c, is_active: !c.is_active })); setSaved(false) }}
          aria-label={config.is_active ? "Desativar roleta" : "Ativar roleta"}
          aria-pressed={config.is_active}
          title={config.is_active ? "Desativar roleta" : "Ativar roleta"}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            config.is_active ? "bg-emerald-500" : "bg-stone-700"
          }`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            config.is_active ? "translate-x-6" : "translate-x-1"
          }`} />
        </button>
      </div>

      {config.is_active ? (
        <p className="text-xs text-emerald-400 font-medium">Roleta ativa — leads serão distribuídos automaticamente</p>
      ) : (
        <p className="text-xs text-stone-500">Roleta pausada — nenhum lead será distribuído</p>
      )}

      {/* Business days */}
      <fieldset>
        <legend className="text-xs font-medium text-stone-400 mb-2 flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" /> Dias de atendimento
        </legend>
        <div className="grid grid-cols-7 gap-1.5">
          {DAYS.map((label, idx) => (
            <button
              key={idx}
              onClick={() => toggleDay(idx)}
              aria-pressed={config.business_days.includes(idx)}
              aria-label={`${label} — ${config.business_days.includes(idx) ? "selecionado" : "não selecionado"}`}
              className={`h-8 rounded-lg text-xs font-semibold transition-colors ${
                config.business_days.includes(idx)
                  ? "bg-[#E8856A] text-white"
                  : "bg-stone-800 text-stone-400 hover:bg-stone-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Hours */}
      <fieldset>
        <legend className="sr-only">Horário de atendimento</legend>
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label htmlFor="hour-start" className="text-xs font-medium text-stone-400 block mb-1">Início</label>
            <input
              id="hour-start"
              type="time"
              value={config.business_hour_start}
              onChange={(e) => { setConfig((c) => ({ ...c, business_hour_start: e.target.value })); setSaved(false) }}
              className="rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-white focus:border-[#E8856A] focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="hour-end" className="text-xs font-medium text-stone-400 block mb-1">Fim</label>
            <input
              id="hour-end"
              type="time"
              value={config.business_hour_end}
              onChange={(e) => { setConfig((c) => ({ ...c, business_hour_end: e.target.value })); setSaved(false) }}
              className="rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-white focus:border-[#E8856A] focus:outline-none"
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-stone-600">Fuso horário: {config.timezone}</p>
      </fieldset>

      {/* Notifications */}
      <div>
        <p className="text-xs font-medium text-stone-400 mb-2 flex items-center gap-1.5">
          <Bell className="h-3.5 w-3.5" /> Notificações ao corretor
        </p>
        <div className="flex flex-wrap gap-3">
          {(
            [
              { key: "notify_push", label: "Push" },
              { key: "notify_email", label: "E-mail" },
              { key: "notify_whatsapp", label: "WhatsApp" },
            ] as const
          ).map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config[key]}
                onChange={(e) => { setConfig((c) => ({ ...c, [key]: e.target.checked })); setSaved(false) }}
                className="h-4 w-4 rounded border-stone-700 accent-[#E8856A]"
              />
              <span className="text-sm text-stone-300">{label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={save}
          disabled={isPending}
          className="rounded-lg bg-[#E8856A] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#d4705a] disabled:opacity-50"
        >
          {isPending ? "Salvando…" : "Salvar configuração"}
        </button>
        <span role="status" aria-live="polite" className="text-xs">
          {saved && <span className="text-emerald-400">Salvo!</span>}
          {saveError && <span className="text-red-400">Erro ao salvar. Tente novamente.</span>}
        </span>
      </div>
    </div>
  )
}
