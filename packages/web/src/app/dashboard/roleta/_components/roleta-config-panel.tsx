"use client"

import { useState } from "react"
import { Clock, SlidersHorizontal, Bell, Users, ShieldCheck } from "lucide-react"
import type { GestorUser } from "../page"

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

interface RoletaConfig {
  is_active: boolean
  business_days: number[]
  business_hour_start: string
  business_hour_end: string
  weekend_hour_start: string | null
  weekend_hour_end: string | null
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
    weekend_hour_start: null,
    weekend_hour_end: null,
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
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [saveError, setSaveError] = useState(false)

  async function persist(patch: Partial<RoletaConfig>) {
    const next = { ...config, ...patch }
    setConfig(next)
    setSaving(true)
    setSaved(false)
    setSaveError(false)
    try {
      const res = await fetch("/api/roleta/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      } else {
        setSaveError(true)
        // revert on error
        setConfig(config)
      }
    } catch {
      setSaveError(true)
      setConfig(config)
    } finally {
      setSaving(false)
    }
  }

  function toggleDay(day: number) {
    const newDays = config.business_days.includes(day)
      ? config.business_days.filter((d) => d !== day)
      : [...config.business_days, day].sort()
    void persist({ business_days: newDays })
  }

  const selectCls =
    "w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#E8856A] focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-white"
  const sectionLabel = "text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-500"

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-5 dark:border-stone-800 dark:bg-stone-900">

      {/* ── Header — toggle ativo/pausado — auto-salva ── */}
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <SlidersHorizontal className={`h-4 w-4 ${config.is_active ? "text-emerald-600 dark:text-emerald-400" : "text-stone-400 dark:text-stone-500"}`} />
            Configuração da Roleta
          </h2>
          <div className="flex items-center gap-2">
            {saving && <span className="text-xs text-stone-400 dark:text-stone-500 animate-pulse">Salvando…</span>}
            {saved  && <span className="text-xs text-emerald-500">Salvo ✓</span>}
            {saveError && <span className="text-xs text-red-400">Erro ao salvar</span>}
            <button
              onClick={() => void persist({ is_active: !config.is_active })}
              disabled={saving}
              aria-label={config.is_active ? "Desativar roleta" : "Ativar roleta"}
              aria-pressed={config.is_active}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                config.is_active ? "bg-emerald-500" : "bg-stone-300 dark:bg-stone-700"
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                config.is_active ? "translate-x-6" : "translate-x-1"
              }`} />
            </button>
          </div>
        </div>
        <p className={`mt-1.5 text-xs font-medium ${config.is_active ? "text-emerald-600 dark:text-emerald-400" : "text-stone-500"}`}>
          {config.is_active
            ? "Roleta ativa — leads serão distribuídos automaticamente"
            : "Roleta pausada — nenhum lead será distribuído"}
        </p>
      </div>

      <div className="border-t border-stone-200 dark:border-stone-800" />

      {/* ── Horário de funcionamento ── */}
      <section aria-label="Horário de funcionamento">
        <p className={`${sectionLabel} mb-3 flex items-center gap-1.5`}>
          <Clock className="h-3.5 w-3.5" /> Horário de funcionamento
        </p>

        <div className="space-y-3">
          {/* Day buttons — auto-salvam ao clicar */}
          <fieldset>
            <legend className="sr-only">Dias de atendimento</legend>
            <div className="grid grid-cols-7 gap-1.5">
              {DAYS.map((label, idx) => (
                <button
                  key={idx}
                  onClick={() => toggleDay(idx)}
                  disabled={saving}
                  aria-pressed={config.business_days.includes(idx)}
                  aria-label={`${label} — ${config.business_days.includes(idx) ? "selecionado" : "não selecionado"}`}
                  className={`h-8 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
                    config.business_days.includes(idx)
                      ? "bg-[#E8856A] text-white"
                      : "bg-stone-100 text-stone-500 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Time range — salva ao sair do campo */}
          <fieldset>
            <legend className="sr-only">Horário de atendimento</legend>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="hour-start" className="text-xs font-medium text-stone-500 dark:text-stone-400 block mb-1">Início</label>
                <input
                  id="hour-start"
                  type="time"
                  value={config.business_hour_start}
                  onChange={(e) => setConfig((c) => ({ ...c, business_hour_start: e.target.value }))}
                  onBlur={(e) => void persist({ business_hour_start: e.target.value })}
                  className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#E8856A] focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-white"
                />
              </div>
              <span className="text-stone-400 dark:text-stone-600 text-sm pb-2">—</span>
              <div>
                <label htmlFor="hour-end" className="text-xs font-medium text-stone-500 dark:text-stone-400 block mb-1">Fim</label>
                <input
                  id="hour-end"
                  type="time"
                  value={config.business_hour_end}
                  onChange={(e) => setConfig((c) => ({ ...c, business_hour_end: e.target.value }))}
                  onBlur={(e) => void persist({ business_hour_end: e.target.value })}
                  className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#E8856A] focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-white"
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-stone-400 dark:text-stone-600">Fuso horário: {config.timezone}</p>
          </fieldset>

          {/* Horário de fim de semana */}
          {(config.business_days.includes(0) || config.business_days.includes(6)) && (
            <fieldset className="mt-4 pt-4 border-t border-stone-100 dark:border-stone-800">
              <legend className="text-xs font-semibold text-stone-500 dark:text-stone-500 mb-2">
                Horário específico para fim de semana
              </legend>
              <p className="text-xs text-stone-400 dark:text-stone-600 mb-3">
                Se não preenchido, usa o horário dos dias úteis acima.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label htmlFor="weekend-hour-start" className="text-xs font-medium text-stone-500 dark:text-stone-400 block mb-1">Início</label>
                  <input
                    id="weekend-hour-start"
                    type="time"
                    value={config.weekend_hour_start ?? ""}
                    onChange={(e) => setConfig((c) => ({ ...c, weekend_hour_start: e.target.value || null }))}
                    onBlur={(e) => void persist({ weekend_hour_start: e.target.value || null })}
                    className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#E8856A] focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-white"
                  />
                </div>
                <span className="text-stone-400 dark:text-stone-600 text-sm pb-2">—</span>
                <div>
                  <label htmlFor="weekend-hour-end" className="text-xs font-medium text-stone-500 dark:text-stone-400 block mb-1">Fim</label>
                  <input
                    id="weekend-hour-end"
                    type="time"
                    value={config.weekend_hour_end ?? ""}
                    onChange={(e) => setConfig((c) => ({ ...c, weekend_hour_end: e.target.value || null }))}
                    onBlur={(e) => void persist({ weekend_hour_end: e.target.value || null })}
                    className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#E8856A] focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-white"
                  />
                </div>
                {(config.weekend_hour_start || config.weekend_hour_end) && (
                  <button
                    type="button"
                    onClick={() => void persist({ weekend_hour_start: null, weekend_hour_end: null })}
                    className="text-xs text-stone-400 hover:text-red-500 transition-colors pb-2 dark:text-stone-500 dark:hover:text-red-400"
                  >
                    Limpar
                  </button>
                )}
              </div>
            </fieldset>
          )}
        </div>
      </section>

      <div className="border-t border-stone-200 dark:border-stone-800" />

      {/* ── Regras de distribuição ── */}
      <section aria-label="Regras de distribuição">
        <p className={`${sectionLabel} mb-3`}>Regras de distribuição</p>

        <div className="rounded-lg border border-stone-200 bg-stone-50 divide-y divide-stone-200 dark:border-stone-800 dark:bg-stone-800/30 dark:divide-stone-800">

          {/* Priorizar lead ativo — auto-salva */}
          <div className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-2.5 min-w-0">
                <ShieldCheck className="h-4 w-4 text-[#E8856A] shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">
                    Priorizar lead ativo
                  </p>
                  <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                    Enviar lead para o corretor que já está atendendo o cliente, mesmo que não esteja na roleta.
                  </p>
                </div>
              </div>
              <button
                onClick={() => void persist({ priorizar_lead_ativo: !config.priorizar_lead_ativo })}
                disabled={saving}
                aria-label={config.priorizar_lead_ativo ? "Desativar priorização" : "Ativar priorização"}
                aria-pressed={config.priorizar_lead_ativo}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                  config.priorizar_lead_ativo ? "bg-[#E8856A]" : "bg-stone-300 dark:bg-stone-700"
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  config.priorizar_lead_ativo ? "translate-x-6" : "translate-x-1"
                }`} />
              </button>
            </div>
          </div>

          {/* Limite diário — salva ao sair do campo */}
          <div className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <label htmlFor="max-leads-day" className="text-sm font-semibold text-gray-900 dark:text-white block leading-snug">
                Limite diário por corretor
              </label>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
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
                if (!isNaN(v) && v > 0) setConfig((c) => ({ ...c, max_leads_per_day: v }))
              }}
              onBlur={(e) => {
                const v = parseInt(e.target.value)
                if (!isNaN(v) && v > 0) void persist({ max_leads_per_day: v })
              }}
              className="w-24 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-gray-900 text-center focus:border-[#E8856A] focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-white"
            />
          </div>
        </div>
      </section>

      <div className="border-t border-stone-200 dark:border-stone-800" />

      {/* ── Notificações ── */}
      <section aria-label="Notificações">
        <p className={`${sectionLabel} mb-3 flex items-center gap-1.5`}>
          <Bell className="h-3.5 w-3.5" /> Notificações
        </p>

        <div className="rounded-lg border border-stone-200 bg-stone-50 divide-y divide-stone-200 dark:border-stone-800 dark:bg-stone-800/30 dark:divide-stone-800">

          {/* Notificações ao corretor — auto-salvam */}
          <div className="p-4">
            <p className="text-xs font-semibold text-stone-600 dark:text-stone-300 mb-2.5">Ao corretor</p>
            <div className="flex flex-wrap gap-4">
              {(
                [
                  { key: "notify_push",      label: "Push" },
                  { key: "notify_email",     label: "E-mail" },
                  { key: "notify_whatsapp",  label: "WhatsApp" },
                ] as const
              ).map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config[key]}
                    onChange={(e) => void persist({ [key]: e.target.checked })}
                    className="h-4 w-4 rounded border-stone-300 accent-[#E8856A] dark:border-stone-700"
                  />
                  <span className="text-sm text-stone-700 dark:text-stone-300">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Notificações à imobiliária — auto-salvam */}
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-stone-400 dark:text-stone-500" />
              <p className="text-xs font-semibold text-stone-600 dark:text-stone-300">A gestores da imobiliária</p>
            </div>

            <div>
              <label htmlFor="notify-dist" className="text-xs text-stone-500 dark:text-stone-500 block mb-1">
                Ao distribuir um lead para um corretor
              </label>
              <select
                id="notify-dist"
                value={config.notify_user_on_distribution ?? ""}
                onChange={(e) => void persist({ notify_user_on_distribution: e.target.value || null })}
                className={selectCls}
              >
                <option value="">Não notificar</option>
                {gestores.map((g) => (
                  <option key={g.id} value={g.id}>{g.name} — {g.email}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="notify-fora" className="text-xs text-stone-500 dark:text-stone-500 block mb-1">
                Quando lead chegar fora do horário da roleta
              </label>
              <select
                id="notify-fora"
                value={config.notify_user_on_fora_horario ?? ""}
                onChange={(e) => void persist({ notify_user_on_fora_horario: e.target.value || null })}
                className={selectCls}
              >
                <option value="">Não notificar</option>
                {gestores.map((g) => (
                  <option key={g.id} value={g.id}>{g.name} — {g.email}</option>
                ))}
              </select>
            </div>
          </div>

        </div>
      </section>

    </div>
  )
}
