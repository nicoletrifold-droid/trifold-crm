import { CancelButton } from "./cancel-button"

interface AppointmentInfo {
  id: string
  scheduled_at: string
  duration_minutes: number
  location: string | null
  status: string
  client_name: string | null
  cancel_token: string
  property: { id: string; name: string } | null
}

async function getAppointment(token: string): Promise<AppointmentInfo | null> {
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ??
      process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000"

    const res = await fetch(`${baseUrl}/api/appointments/cancel/${token}`, {
      cache: "no-store",
    })

    if (!res.ok) return null

    const json = (await res.json()) as { data: AppointmentInfo }
    return json.data
  } catch {
    return null
  }
}

function extractProperty(raw: unknown): { id: string; name: string } | null {
  if (Array.isArray(raw)) return (raw[0] as { id: string; name: string }) ?? null
  return (raw as { id: string; name: string }) ?? null
}

export default async function CancelarPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const appointment = await getAppointment(token)

  if (!appointment) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-950 px-4">
        <div className="w-full max-w-md text-center">
          <div className="mb-6 text-4xl">🔍</div>
          <h1 className="text-xl font-bold text-stone-100">Compromisso não encontrado</h1>
          <p className="mt-2 text-sm text-stone-400">
            Este link pode ter expirado ou ser inválido.
          </p>
        </div>
      </div>
    )
  }

  const property = extractProperty(appointment.property)

  const scheduledDate = new Date(appointment.scheduled_at)
  const formattedDate = scheduledDate.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
  const formattedTime = scheduledDate.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  })

  const isCancelled = appointment.status === "cancelled"

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-950 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">
            Trifold
          </p>
          <h1 className="mt-1 text-2xl font-bold text-stone-100">
            {isCancelled ? "Compromisso cancelado" : "Cancelar compromisso"}
          </h1>
        </div>

        {/* Appointment card */}
        <div className="rounded-2xl border border-stone-800 bg-stone-900 p-6 shadow-xl">
          {appointment.client_name && (
            <p className="mb-4 text-sm text-stone-400">
              Olá, <span className="font-medium text-stone-200">{appointment.client_name}</span>!
            </p>
          )}

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-stone-500">📅</span>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
                  Data e hora
                </p>
                <p className="text-sm font-medium capitalize text-stone-200">
                  {formattedDate} às {formattedTime}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-stone-500">📍</span>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
                  Local
                </p>
                <p className="text-sm font-medium text-stone-200">
                  {appointment.location ?? "Stand Trifold"}
                </p>
              </div>
            </div>

            {property && (
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-stone-500">🏢</span>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
                    Empreendimento
                  </p>
                  <p className="text-sm font-medium text-stone-200">{property.name}</p>
                </div>
              </div>
            )}

            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-stone-500">⏱️</span>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
                  Duração
                </p>
                <p className="text-sm font-medium text-stone-200">
                  {appointment.duration_minutes} minutos
                </p>
              </div>
            </div>
          </div>

          {!isCancelled && (
            <div className="mt-6 border-t border-stone-800 pt-6">
              <CancelButton token={token} />
            </div>
          )}

          {isCancelled && (
            <div className="mt-6 rounded-xl border border-green-500/30 bg-green-500/10 px-6 py-4 text-center">
              <p className="text-sm font-semibold text-green-400">
                Este compromisso já foi cancelado.
              </p>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-stone-600">
          Se você não solicitou este cancelamento, entre em contato conosco.
        </p>
      </div>
    </div>
  )
}
