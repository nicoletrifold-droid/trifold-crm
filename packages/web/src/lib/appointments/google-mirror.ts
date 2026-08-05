// Story 75-275 — espelho de UM appointment no Google Calendar, num só lugar.
//
// POR QUE EXISTE: o sistema tem QUATRO pontos que criam appointment (modal interno,
// link público da imobiliária, visita retroativa do feedback, e a Nicole). Antes, o
// único que espelhava fazia a sequência inline: `createCalendarEvent` → `if (id) update
// appointments`. Repetir isso nos outros seria repetir quatro vezes a chance de esquecer
// o prefixo [IMOB], esquecer de persistir o id, ou — o pior — esquecer que a falha do
// Google é silenciosa. Aqui a sequência inteira mora junta; a rota só diz "espelha isto".
//
// FAIL-OPEN COM RASTRO: Google fora do ar não pode impedir uma visita de ser marcada,
// então nada aqui lança. O que estava errado antes não era o fail-open — era ser CEGO:
// `console.error` e mais nada, ninguém descobria. Agora a falha fica em
// `appointments.metadata.google_sync`, auditável depois.

import type { SupabaseClient } from "@supabase/supabase-js"
import {
  createCalendarEvent,
  deleteCalendarEvent,
  isCalendarMirrorEnabled,
  updateCalendarEvent,
} from "@web/lib/google-calendar"

/** Duração padrão quando o appointment não tem `duration_minutes` (compromissos de 1h). */
const DEFAULT_DURATION_MIN = 60

export interface MirrorableAppointment {
  id: string
  scheduled_at: string
  duration_minutes?: number | null
  location?: string | null
  notes?: string | null
  client_name?: string | null
  team?: string | null
  google_event_id?: string | null
}

function windowOf(appt: MirrorableAppointment): { startAt: Date; endAt: Date } {
  const startAt = new Date(appt.scheduled_at)
  const minutes = appt.duration_minutes ?? DEFAULT_DURATION_MIN
  return { startAt, endAt: new Date(startAt.getTime() + minutes * 60000) }
}

function titleOf(appt: MirrorableAppointment, displayName?: string | null): string {
  const name = displayName?.trim() || appt.client_name?.trim() || ""
  return `Visita ao decorado${name ? ` — ${name}` : ""}`
}

function descriptionOf(appt: MirrorableAppointment, origin?: string): string {
  return [
    appt.location ? `Local: ${appt.location}` : "",
    appt.notes?.trim() ?? "",
    origin ?? "",
  ]
    .filter(Boolean)
    .join("\n")
}

/**
 * Registra o resultado da sincronização em `metadata.google_sync`.
 *
 * 🔥 LÊ ANTES DE ESCREVER de propósito: `metadata` é jsonb e `.update({metadata})`
 * SUBSTITUI o objeto inteiro. O appointment vindo do link da imobiliária guarda ali
 * `origem`, `imobiliaria_nome` e `corretor_parceiro` — dados que a agenda mostra na tela
 * (Story 81-6). Escrever sem mesclar apagaria isso em silêncio.
 */
async function recordSync(
  supabase: SupabaseClient,
  appointmentId: string,
  status: { ok: boolean; action: "create" | "update"; error?: string }
): Promise<void> {
  const { data } = await supabase
    .from("appointments")
    .select("metadata")
    .eq("id", appointmentId)
    .single()

  const current = (data?.metadata as Record<string, unknown> | null) ?? {}
  await supabase
    .from("appointments")
    .update({
      metadata: {
        ...current,
        google_sync: {
          ok: status.ok,
          action: status.action,
          at: new Date().toISOString(),
          ...(status.error ? { error: status.error.slice(0, 300) } : {}),
        },
      },
    })
    .eq("id", appointmentId)
}

/**
 * Cria o evento no Google e guarda o `google_event_id`. Best-effort: nunca lança.
 *
 * @param origin linha extra na descrição (ex.: "Agendado pela Nicole.") — opcional.
 */
export async function mirrorCreate(
  supabase: SupabaseClient,
  appt: MirrorableAppointment,
  opts?: { displayName?: string | null; origin?: string }
): Promise<string | null> {
  // Espelho desligado (kill-switch ou sem credencial) = no-op silencioso. NÃO é falha:
  // registrar `google_sync: {ok:false}` aqui mentiria, e faria duas escritas por
  // agendamento em todo ambiente sem credencial (dev, preview).
  if (!isCalendarMirrorEnabled()) return null

  try {
    const { startAt, endAt } = windowOf(appt)
    const eventId = await createCalendarEvent({
      title: titleOf(appt, opts?.displayName),
      description: descriptionOf(appt, opts?.origin),
      startAt,
      endAt,
      team: appt.team as "house" | "imob" | null | undefined,
    })

    if (eventId) {
      await supabase.from("appointments").update({ google_event_id: eventId }).eq("id", appt.id)
      return eventId
    }

    // Chegou aqui com o espelho ATIVO e `null` = falha real do Google (o caso desligado
    // saiu no guard acima). Vale registrar.
    await recordSync(supabase, appt.id, { ok: false, action: "create", error: "createCalendarEvent devolveu null" })
    return null
  } catch (err) {
    console.error("[google-mirror] mirrorCreate falhou:", err)
    await recordSync(supabase, appt.id, { ok: false, action: "create", error: String(err) }).catch(() => {})
    return null
  }
}

/**
 * MOVE o evento de um appointment remarcado. Se não havia evento (appointment criado
 * enquanto a integração estava desligada), ou se o evento não existe mais no Google
 * (apagado à mão → 404), **cria** — senão a remarcação seria a única operação capaz de
 * deixar a visita permanentemente fora do calendário.
 */
export async function mirrorUpdate(
  supabase: SupabaseClient,
  appt: MirrorableAppointment,
  opts?: { displayName?: string | null; origin?: string }
): Promise<void> {
  if (!isCalendarMirrorEnabled()) return

  try {
    if (!appt.google_event_id) {
      await mirrorCreate(supabase, appt, opts)
      return
    }

    const { startAt, endAt } = windowOf(appt)
    const ok = await updateCalendarEvent(appt.google_event_id, {
      title: titleOf(appt, opts?.displayName),
      description: descriptionOf(appt, opts?.origin),
      startAt,
      endAt,
      team: appt.team as "house" | "imob" | null | undefined,
    })

    if (ok) return

    // Não deu: tenta recriar. Se o evento tinha sumido do Google, isto conserta; se o
    // Google está fora, `mirrorCreate` registra a falha e a vida segue.
    await mirrorCreate(supabase, { ...appt, google_event_id: null }, opts)
  } catch (err) {
    console.error("[google-mirror] mirrorUpdate falhou:", err)
    await recordSync(supabase, appt.id, { ok: false, action: "update", error: String(err) }).catch(() => {})
  }
}

/**
 * Apaga o evento e limpa o `google_event_id`. Best-effort.
 *
 * Limpar a coluna importa: appointment cancelado que guarde um id morto faria uma
 * eventual remarcação tentar mover um evento inexistente.
 */
export async function mirrorDelete(
  supabase: SupabaseClient,
  appointmentId: string,
  googleEventId: string | null | undefined
): Promise<void> {
  if (!googleEventId) return
  try {
    await deleteCalendarEvent(googleEventId)
    await supabase.from("appointments").update({ google_event_id: null }).eq("id", appointmentId)
  } catch (err) {
    console.error("[google-mirror] mirrorDelete falhou:", err)
  }
}
