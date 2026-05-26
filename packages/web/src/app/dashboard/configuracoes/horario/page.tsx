import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"
import Link from "next/link"

const DAYS_OF_WEEK = [
  { key: "monday", label: "Segunda-feira" },
  { key: "tuesday", label: "Terça-feira" },
  { key: "wednesday", label: "Quarta-feira" },
  { key: "thursday", label: "Quinta-feira" },
  { key: "friday", label: "Sexta-feira" },
  { key: "saturday", label: "Sábado" },
  { key: "sunday", label: "Domingo" },
] as const

interface DaySchedule {
  start: string
  end: string
  enabled: boolean
}

interface BusinessHoursConfig {
  always_on: boolean
  hours: Record<string, DaySchedule>
}

const DEFAULT_CONFIG: BusinessHoursConfig = {
  always_on: true,
  hours: {
    monday: { start: "08:00", end: "18:00", enabled: true },
    tuesday: { start: "08:00", end: "18:00", enabled: true },
    wednesday: { start: "08:00", end: "18:00", enabled: true },
    thursday: { start: "08:00", end: "18:00", enabled: true },
    friday: { start: "08:00", end: "18:00", enabled: true },
    saturday: { start: "08:00", end: "12:00", enabled: true },
    sunday: { start: "08:00", end: "12:00", enabled: false },
  },
}

export default async function HorarioConfigPage() {
  const user = await getServerUser()
  const supabase = await createClient()
  // Edição de horário de atendimento — modelado como acesso ao sub-módulo
  // "configuracoes.horario" (herda de "configuracoes" quando sem exceção).
  const isAdmin = await canAccess(user.id, user.orgId, "configuracoes.horario")

  const { data: agentConfig } = await supabase
    .from("agent_config")
    .select("id, business_hours")
    .eq("org_id", user.orgId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()

  const raw = agentConfig?.business_hours as Record<string, unknown> | null
  const alwaysOn = raw?.always_on === true || raw?.always_on === undefined // default: 24h
  const savedHours = (raw?.hours ?? raw ?? {}) as Record<string, DaySchedule>
  const hours: Record<string, DaySchedule> = { ...DEFAULT_CONFIG.hours, ...savedHours }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/configuracoes"
          className="text-sm text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
        >
          &larr; Configurações
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-stone-900 dark:text-stone-100">
          Horário de Atendimento
        </h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Defina quando a Nicole atende automaticamente
        </p>
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <form
          action={async (formData: FormData) => {
            "use server"
            const supabaseServer = await (
              await import("@web/lib/supabase/server")
            ).createClient()
            const { getServerUser: getUser } = await import("@web/lib/auth")
            const { canAccess: canAccessFn } = await import("@web/lib/permissions")
            const currentUser = await getUser()
            if (!(await canAccessFn(currentUser.id, currentUser.orgId, "configuracoes.horario"))) return

            const isAlwaysOn = formData.get("always_on") === "on"

            const config: BusinessHoursConfig = {
              always_on: isAlwaysOn,
              hours: {},
            }

            if (!isAlwaysOn) {
              const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
              for (const day of days) {
                config.hours[day] = {
                  start: (formData.get(`${day}_start`) as string) || "08:00",
                  end: (formData.get(`${day}_end`) as string) || "18:00",
                  enabled: formData.get(`${day}_enabled`) === "on",
                }
              }
            }

            const { data: existing } = await supabaseServer
              .from("agent_config")
              .select("id")
              .eq("org_id", currentUser.orgId)
              .eq("is_active", true)
              .limit(1)
              .maybeSingle()

            if (existing) {
              await supabaseServer
                .from("agent_config")
                .update({ business_hours: config })
                .eq("id", existing.id)
            } else {
              await supabaseServer.from("agent_config").insert({
                org_id: currentUser.orgId,
                business_hours: config,
              })
            }
          }}
        >
          {/* 24h Toggle */}
          <div className="mb-6 rounded-lg border border-stone-200 p-4 dark:border-stone-800">
            <label className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">Atendimento 24 horas</p>
                <p className="text-xs text-stone-500 dark:text-stone-400">A Nicole responde a qualquer hora do dia, todos os dias</p>
              </div>
              <input
                type="checkbox"
                name="always_on"
                defaultChecked={alwaysOn}
                disabled={!isAdmin}
                className="h-5 w-5 rounded border-stone-300 text-orange-600 focus:ring-orange-500 dark:border-stone-600"
              />
            </label>
          </div>

          {/* Custom hours — only shown when not 24h */}
          <div className={alwaysOn ? "pointer-events-none opacity-40" : ""}>
            <p className="mb-3 text-sm font-medium text-stone-700 dark:text-stone-300">
              Horários por dia da semana
            </p>
            <p className="mb-4 text-xs text-stone-400 dark:text-stone-500">
              Fora desses horários, a Nicole envia mensagem de fora do expediente e retoma no próximo dia útil
            </p>
            <div className="space-y-3">
              {DAYS_OF_WEEK.map(({ key, label }) => {
                const day = hours[key] ?? DEFAULT_CONFIG.hours[key]!
                return (
                  <div
                    key={key}
                    className="flex items-center gap-4 rounded-lg border border-stone-200 px-4 py-3 dark:border-stone-800"
                  >
                    <label className="flex w-40 items-center gap-2.5">
                      <input
                        type="checkbox"
                        name={`${key}_enabled`}
                        defaultChecked={day.enabled}
                        disabled={!isAdmin}
                        className="h-4 w-4 rounded border-stone-300 text-orange-600 focus:ring-orange-500 dark:border-stone-600"
                      />
                      <span className="text-sm text-stone-700 dark:text-stone-300">{label}</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        name={`${key}_start`}
                        defaultValue={day.start}
                        disabled={!isAdmin}
                        className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100 disabled:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:disabled:bg-stone-800/60"
                      />
                      <span className="text-xs text-stone-400 dark:text-stone-500">até</span>
                      <input
                        type="time"
                        name={`${key}_end`}
                        defaultValue={day.end}
                        disabled={!isAdmin}
                        className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100 disabled:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:disabled:bg-stone-800/60"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {isAdmin && (
            <div className="mt-6">
              <button
                type="submit"
                className="rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-orange-700"
              >
                Salvar configuração
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
