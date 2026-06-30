"use client"

import { useState } from "react"
import { Clock, SlidersHorizontal, Bell, Users, ShieldCheck, Timer } from "lucide-react"
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
  sla_alertas_enabled: boolean
  sla_alerta_corretor_min: number
  sla_alerta_gestor_min: number
}

interface ScheduleRow {
  weekday: number // 0=Dom … 6=Sáb
  is_open: boolean
  open: string // "HH:MM"
  close: string // "HH:MM"
}

interface Props {
  initialConfig: RoletaConfig | null
  initialSchedule: ScheduleRow[]
  gestores: GestorUser[]
}

export function RoletaConfigPanel({ initialConfig, initialSchedule, gestores }: Props) {
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
    sla_alertas_enabled: false,
    sla_alerta_corretor_min: 30,
    sla_alerta_gestor_min: 60,
  }

  const [config, setConfig] = useState<RoletaConfig>(initialConfig ?? defaults)
  const [schedule, setSchedule] = useState<ScheduleRow[]>(initialSchedule)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [slaError, setSlaError] = useState<string | null>(null)

  // Story 75-78: salva um tempo de SLA validando corretor < gestor (espelha a regra da API).
  function persistSlaMin(field: "sla_alerta_corretor_min" | "sla_alerta_gestor_min", v: number) {
    if (!Number.isInteger(v) || v <= 0) return
    const corretor = field === "sla_alerta_corretor_min" ? v : config.sla_alerta_corretor_min
    const gestor = field === "sla_alerta_gestor_min" ? v : config.sla_alerta_gestor_min
    if (corretor >= gestor) {
      setSlaError("O alerta ao corretor deve ser menor que a escalada ao gestor.")
      setConfig((c) => ({ ...c })) // mantém estado; usuário corrige
      return
    }
    setSlaError(null)
    void persist({ [field]: v })
  }

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

  // Agenda por dia (Story 75-59) — salva em roleta_schedule (não no config).
  async function persistSchedule(next: ScheduleRow[]) {
    const prev = schedule
    setSchedule(next)
    setSaving(true)
    setSaved(false)
    setSaveError(false)
    try {
      const res = await fetch("/api/roleta/schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: next }),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      } else {
        setSaveError(true)
        setSchedule(prev)
      }
    } catch {
      setSaveError(true)
      setSchedule(prev)
    } finally {
      setSaving(false)
    }
  }

  function updateDay(weekday: number, patch: Partial<ScheduleRow>) {
    void persistSchedule(schedule.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)))
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

      {/* ── Horário de funcionamento — agenda por dia (Story 75-59) ── */}
      <section aria-label="Horário de funcionamento">
        <p className={`${sectionLabel} mb-3 flex items-center gap-1.5`}>
          <Clock className="h-3.5 w-3.5" /> Horário de funcionamento
        </p>

        <div className="space-y-2">
          {schedule.map((day) => (
            <div key={day.weekday} className="flex items-center gap-3">
              <span className="w-10 shrink-0 text-sm font-medium text-gray-900 dark:text-white">{DAYS[day.weekday]}</span>
              <button
                type="button"
                onClick={() => updateDay(day.weekday, { is_open: !day.is_open })}
                disabled={saving}
                aria-pressed={day.is_open}
                aria-label={`${DAYS[day.weekday]} — ${day.is_open ? "aberto" : "fechado"}`}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                  day.is_open ? "bg-emerald-500" : "bg-stone-300 dark:bg-stone-700"
                }`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  day.is_open ? "translate-x-4" : "translate-x-1"
                }`} />
              </button>
              {day.is_open ? (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    aria-label={`${DAYS[day.weekday]} — abre`}
                    value={day.open}
                    onChange={(e) => setSchedule((s) => s.map((d) => (d.weekday === day.weekday ? { ...d, open: e.target.value } : d)))}
                    onBlur={(e) => updateDay(day.weekday, { open: e.target.value })}
                    className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-[#E8856A] focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-white"
                  />
                  <span className="text-stone-400 dark:text-stone-600 text-sm">—</span>
                  <input
                    type="time"
                    aria-label={`${DAYS[day.weekday]} — fecha`}
                    value={day.close}
                    onChange={(e) => setSchedule((s) => s.map((d) => (d.weekday === day.weekday ? { ...d, close: e.target.value } : d)))}
                    onBlur={(e) => updateDay(day.weekday, { close: e.target.value })}
                    className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-[#E8856A] focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-white"
                  />
                </div>
              ) : (
                <span className="text-sm text-stone-400 dark:text-stone-600">Fechado</span>
              )}
            </div>
          ))}
          <p className="mt-2 text-xs text-stone-400 dark:text-stone-600">Fuso horário: {config.timezone}</p>
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

      <div className="border-t border-stone-200 dark:border-stone-800" />

      {/* ── SLA / Tempo de atendimento (Story 75-78) ── */}
      <section aria-label="SLA e tempo de atendimento">
        <p className={`${sectionLabel} mb-3 flex items-center gap-1.5`}>
          <Timer className="h-3.5 w-3.5" /> SLA / Tempo de atendimento
        </p>

        <div className="rounded-lg border border-stone-200 bg-stone-50 divide-y divide-stone-200 dark:border-stone-800 dark:bg-stone-800/30 dark:divide-stone-800">

          {/* Liga/desliga os alertas de SLA — auto-salva */}
          <div className="p-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">Alertas de SLA</p>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                Avisa o corretor (e escala ao gestor) quando um lead distribuído fica sem atendimento. O relógio
                conta da distribuição até o 1º atendimento, só dentro do horário da roleta.
              </p>
            </div>
            <button
              onClick={() => void persist({ sla_alertas_enabled: !config.sla_alertas_enabled })}
              disabled={saving}
              aria-label={config.sla_alertas_enabled ? "Desativar alertas de SLA" : "Ativar alertas de SLA"}
              aria-pressed={config.sla_alertas_enabled}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                config.sla_alertas_enabled ? "bg-[#E8856A]" : "bg-stone-300 dark:bg-stone-700"
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                config.sla_alertas_enabled ? "translate-x-6" : "translate-x-1"
              }`} />
            </button>
          </div>

          {/* Alertar corretor após (min) — salva ao sair do campo */}
          <div className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <label htmlFor="sla-corretor-min" className="text-sm font-semibold text-gray-900 dark:text-white block leading-snug">
                Alertar corretor após (min)
              </label>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                Tempo sem atendimento até o corretor receber o aviso (push).
              </p>
            </div>
            <input
              id="sla-corretor-min"
              type="number"
              min={1}
              max={1440}
              value={config.sla_alerta_corretor_min}
              onChange={(e) => {
                const v = parseInt(e.target.value)
                if (!isNaN(v) && v > 0) setConfig((c) => ({ ...c, sla_alerta_corretor_min: v }))
              }}
              onBlur={(e) => {
                const v = parseInt(e.target.value)
                if (!isNaN(v)) persistSlaMin("sla_alerta_corretor_min", v)
              }}
              className="w-24 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-gray-900 text-center focus:border-[#E8856A] focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-white"
            />
          </div>

          {/* Escalar p/ gestor após (min) — salva ao sair do campo */}
          <div className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <label htmlFor="sla-gestor-min" className="text-sm font-semibold text-gray-900 dark:text-white block leading-snug">
                Escalar p/ gestor após (min)
              </label>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                Tempo até escalar ao gestor (WhatsApp) — é a meta de SLA.
              </p>
            </div>
            <input
              id="sla-gestor-min"
              type="number"
              min={1}
              max={1440}
              value={config.sla_alerta_gestor_min}
              onChange={(e) => {
                const v = parseInt(e.target.value)
                if (!isNaN(v) && v > 0) setConfig((c) => ({ ...c, sla_alerta_gestor_min: v }))
              }}
              onBlur={(e) => {
                const v = parseInt(e.target.value)
                if (!isNaN(v)) persistSlaMin("sla_alerta_gestor_min", v)
              }}
              className="w-24 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-gray-900 text-center focus:border-[#E8856A] focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-white"
            />
          </div>
        </div>

        {slaError && <p className="mt-2 text-xs text-red-500">{slaError}</p>}
      </section>

    </div>
  )
}
