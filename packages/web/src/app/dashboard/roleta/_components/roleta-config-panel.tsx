"use client"

import { useState, useTransition, useEffect } from "react"
import { Clock, SlidersHorizontal, Bell, Users, ShieldCheck } from "lucide-react"
import type { GestorUser } from "../page"

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
  priorizar_lead_ativo: boolean
  max_leads_per_day: number
  notify_user_on_distribution: string | null
  notify_user_on_fora_horario: string | null
}

interface Props {
  initialConfig: RoletaConfig | null
  gestores: GestorUser[]
}

export function RoletaConfigPanel({ initialConfig, gestores }: Props) {
  const defaults: RoletaConfig = {
    is_active: false,
    business_days: [1, 2, 3, 4, 5],
    business_hour_start: "08:00",
    business_hour_end: "18:00",
    timezone: "America/Sao_Paulo",
    notify_push: true,
    notify_email: true,
    notify_whatsapp: true,
    priorizar_lead_ativo: true,
    max_leads_per_day: 50,
    notify_user_on_distribution: null,
    notify_user_on_fora_horario: null,
  }

  const [config, setConfig] = useState<RoletaConfig>(initialConfig ?? defaults)
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState(false)

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

  const selectCls =
    "w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-white focus:border-[#E8856A] focus:outline-none"

  const sectionLabel = "text-xs font-semibold uppercase tracking-wide text-stone-500"

  return (
    <div className="rounded-xl border border-stone-800 bg-stone-900 p-5 space-y-5">

      {/* ── Header — toggle ativo/pausado ── */}
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <SlidersHorizontal className={`h-4 w-4 ${config.is_active ? "text-emerald-400" : "text-stone-500"}`} />
            Configuração da Roleta
          </h2>
          <button
            onClick={() => { setConfig((c) => ({ ...c, is_active: !c.is_active })); setSaved(false) }}
            aria-label={config.is_active ? "Desativar roleta" : "Ativar roleta"}
            aria-pressed={config.is_active}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              config.is_active ? "bg-emerald-500" : "bg-stone-700"
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              config.is_active ? "translate-x-6" : "translate-x-1"
            }`} />
          </button>
        </div>
        <p className={`mt-1.5 text-xs font-medium ${config.is_active ? "text-emerald-400" : "text-stone-500"}`}>
          {config.is_active
            ? "Roleta ativa — leads serão distribuídos automaticamente"
            : "Roleta pausada — nenhum lead será distribuído"}
        </p>
      </div>

      <div className="border-t border-stone-800" />

      {/* ── Horário de funcionamento ── */}
      <section aria-label="Horário de funcionamento">
        <p className={`${sectionLabel} mb-3 flex items-center gap-1.5`}>
          <Clock className="h-3.5 w-3.5" /> Horário de funcionamento
        </p>

        <div className="space-y-3">
          {/* Day buttons */}
          <fieldset>
            <legend className="sr-only">Dias de atendimento</legend>
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

          {/* Time range */}
          <fieldset>
            <legend className="sr-only">Horário de atendimento</legend>
            <div className="flex flex-wrap items-end gap-3">
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
              <span className="text-stone-600 text-sm pb-2">—</span>
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
        </div>
      </section>

      <div className="border-t border-stone-800" />

      {/* ── Regras de distribuição ── */}
      <section aria-label="Regras de distribuição">
        <p className={`${sectionLabel} mb-3`}>Regras de distribuição</p>

        <div className="rounded-lg border border-stone-800 bg-stone-800/30 divide-y divide-stone-800">

          {/* Priorizar lead ativo */}
          <div className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-2.5 min-w-0">
                <ShieldCheck className="h-4 w-4 text-[#E8856A] shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-white leading-snug">
                    Priorizar lead ativo
                  </p>
                  <p className="text-xs text-stone-400 mt-0.5">
                    Enviar lead para o corretor que já está atendendo o cliente, mesmo que não esteja na roleta.
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setConfig((c) => ({ ...c, priorizar_lead_ativo: !c.priorizar_lead_ativo })); setSaved(false) }}
                aria-label={config.priorizar_lead_ativo ? "Desativar priorização" : "Ativar priorização"}
                aria-pressed={config.priorizar_lead_ativo}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  config.priorizar_lead_ativo ? "bg-[#E8856A]" : "bg-stone-700"
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  config.priorizar_lead_ativo ? "translate-x-6" : "translate-x-1"
                }`} />
              </button>
            </div>
          </div>

          {/* Limite diário */}
          <div className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <label htmlFor="max-leads-day" className="text-sm font-semibold text-white block leading-snug">
                Limite diário por corretor
              </label>
              <p className="text-xs text-stone-400 mt-0.5">
                Número máximo de leads recebidos por corretor em um dia.
              </p>
            </div>
            <input
              id="max-leads-day"
              type="number"
              min={1}
              max={999}
              value={config.max_leads_per_day}
              onChange={(e) => {
                const v = parseInt(e.target.value)
                if (!isNaN(v) && v > 0) {
                  setConfig((c) => ({ ...c, max_leads_per_day: v }))
                  setSaved(false)
                }
              }}
              className="w-24 rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-white text-center focus:border-[#E8856A] focus:outline-none"
            />
          </div>
        </div>
      </section>

      <div className="border-t border-stone-800" />

      {/* ── Notificações ── */}
      <section aria-label="Notificações">
        <p className={`${sectionLabel} mb-3 flex items-center gap-1.5`}>
          <Bell className="h-3.5 w-3.5" /> Notificações
        </p>

        <div className="rounded-lg border border-stone-800 bg-stone-800/30 divide-y divide-stone-800">

          {/* Notificações ao corretor */}
          <div className="p-4">
            <p className="text-xs font-semibold text-stone-300 mb-2.5">Ao corretor</p>
            <div className="flex flex-wrap gap-4">
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

          {/* Notificações à imobiliária */}
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-stone-500" />
              <p className="text-xs font-semibold text-stone-300">A gestores da imobiliária</p>
            </div>

            <div>
              <label htmlFor="notify-dist" className="text-xs text-stone-500 block mb-1">
                Ao distribuir um lead para um corretor
              </label>
              <select
                id="notify-dist"
                value={config.notify_user_on_distribution ?? ""}
                onChange={(e) => { setConfig((c) => ({ ...c, notify_user_on_distribution: e.target.value || null })); setSaved(false) }}
                className={selectCls}
              >
                <option value="">Não notificar</option>
                {gestores.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} — {g.email}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="notify-fora" className="text-xs text-stone-500 block mb-1">
                Quando lead chegar fora do horário da roleta
              </label>
              <select
                id="notify-fora"
                value={config.notify_user_on_fora_horario ?? ""}
                onChange={(e) => { setConfig((c) => ({ ...c, notify_user_on_fora_horario: e.target.value || null })); setSaved(false) }}
                className={selectCls}
              >
                <option value="">Não notificar</option>
                {gestores.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} — {g.email}
                  </option>
                ))}
              </select>
            </div>
          </div>

        </div>
      </section>

      {/* ── Save ── */}
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
