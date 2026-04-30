"use client"

export interface EmailAlert {
  id: string
  type: string
  message: string
  severity: "red" | "orange" | "yellow"
  created_at: string
}

interface Props {
  alerts: EmailAlert[]
}

const SEVERITY_STYLES: Record<string, string> = {
  red: "border-red-200 bg-red-50 text-red-700",
  orange: "border-orange-200 bg-orange-50 text-orange-700",
  yellow: "border-amber-200 bg-amber-50 text-amber-700",
}

const SEVERITY_ICONS: Record<string, string> = {
  red: "🔴",
  orange: "🟠",
  yellow: "⚠️",
}

export function EmailAlertsPanel({ alerts }: Props) {
  const formatTime = (iso: string) =>
    new Date(iso).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <h3 className="text-sm font-medium text-stone-700">
        Alertas
        {alerts.length > 0 && (
          <span className="ml-2 inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium bg-red-50 text-red-600">
            {alerts.length}
          </span>
        )}
      </h3>

      {alerts.length === 0 ? (
        <p className="mt-2 text-xs text-stone-400">Nenhum alerta nas últimas horas</p>
      ) : (
        <div className="mt-3 space-y-2">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`rounded border px-3 py-2 text-xs ${SEVERITY_STYLES[alert.severity] ?? SEVERITY_STYLES.yellow}`}
            >
              <p className="font-medium">
                {SEVERITY_ICONS[alert.severity]} {alert.message}
              </p>
              <p className="mt-0.5 text-[10px] opacity-70">{formatTime(alert.created_at)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
