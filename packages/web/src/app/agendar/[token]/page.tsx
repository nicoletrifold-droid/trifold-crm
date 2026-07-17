import { createAdminClient } from "@web/lib/supabase/admin"
import { getOrgSchedule } from "@web/lib/roleta/business-time"
import { LOCATIONS } from "@web/lib/appointments/locations"
import { buildDayOptions } from "@web/lib/appointments/imob-slots"
import { BookingForm } from "./booking-form"

// Story 81-4 (Epic 81) — página PÚBLICA de agendamento da imobiliária parceira
// (sem login; mesmo padrão de /agendar/cancelar/[token]). Token inválido ou
// revogado → aviso amigável, sem vazar nada.

export const dynamic = "force-dynamic"

export default async function AgendarImobiliariaPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const admin = createAdminClient()

  const uuidOk = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)
  const { data: imob } = uuidOk
    ? await admin
        .from("imobiliarias")
        .select("id, org_id, nome")
        .eq("booking_token", token)
        .maybeSingle()
    : { data: null }

  if (!imob) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-950 px-4">
        <div className="w-full max-w-md rounded-2xl bg-stone-900 p-8 text-center ring-1 ring-stone-800">
          <p className="text-3xl">🔗</p>
          <h1 className="mt-3 text-lg font-semibold text-stone-100">Link inválido ou desativado</h1>
          <p className="mt-2 text-sm text-stone-400">
            Este link de agendamento não está mais ativo. Fale com a equipe Trifold para receber
            um novo link.
          </p>
        </div>
      </div>
    )
  }

  const { week, timezone } = await getOrgSchedule(imob.org_id as string, admin)
  const days = buildDayOptions(timezone, week)

  return (
    <div className="min-h-screen bg-stone-950 px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        <div className="rounded-2xl bg-stone-900 p-6 ring-1 ring-stone-800 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-violet-400">
            Agenda Trifold · Parceria IMOB
          </p>
          <h1 className="mt-1 text-xl font-bold text-stone-100">{imob.nome as string}</h1>
          <p className="mt-1 text-sm text-stone-400">
            Marque a visita do seu cliente ao decorado. Compromisso de 1 hora, em hora cheia.
          </p>
          <div className="mt-6">
            <BookingForm token={token} locations={LOCATIONS} days={days} />
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-stone-600">
          Trifold Engenharia — link exclusivo da sua imobiliária. Não compartilhe.
        </p>
      </div>
    </div>
  )
}
