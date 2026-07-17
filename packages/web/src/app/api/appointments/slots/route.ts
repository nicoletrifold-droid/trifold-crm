import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { getOrgSchedule } from "@web/lib/roleta/business-time"
import {
  imobSlotsForDay,
  buildDayOptions,
  type ImobBusySlot,
} from "@web/lib/appointments/imob-slots"
import { isBookableLocation } from "@web/lib/appointments/locations"

// Story 81-8 (Epic 81) — disponibilidade da agenda para o MODAL INTERNO, no mesmo
// formato do link público: dias abertos + grade de horários livres/ocupados da
// EQUIPE pedida (house × imob não se enxergam — 81-1). O usuário só escolhe entre
// horários livres; o POST segue como guarda final (409 na corrida).
//
// GET /api/appointments/slots?team=house|imob&date=YYYY-MM-DD&location=Decorado%20Vind
//  → { days } sempre; { slots } quando date+location válidos.
//
// Equipe efetiva espelha o resolveTeam do POST: perfil imob → imob; admin/supervisor
// escolhem via query; demais → house.
export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const url = new URL(request.url)
  const teamParam = url.searchParams.get("team")
  const team: "house" | "imob" =
    appUser.role === "imob"
      ? "imob"
      : ["admin", "supervisor"].includes(appUser.role) && teamParam === "imob"
        ? "imob"
        : "house"

  const { week, timezone } = await getOrgSchedule(appUser.org_id, supabase)
  const payload: Record<string, unknown> = { team, days: buildDayOptions(timezone, week) }

  const date = url.searchParams.get("date")
  const location = url.searchParams.get("location") ?? ""
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && isBookableLocation(location)) {
    const [y, mo, d] = date.split("-").map(Number) as [number, number, number]
    // Janela com folga de fuso; a grade filtra por sobreposição real.
    const dayStart = new Date(Date.UTC(y, mo - 1, d - 1, 0, 0)).toISOString()
    const dayEnd = new Date(Date.UTC(y, mo - 1, d + 2, 0, 0)).toISOString()
    const { data: busy } = await supabase
      .from("appointments")
      .select("scheduled_at, duration_minutes, location, calendly_event_uri")
      .eq("org_id", appUser.org_id)
      .eq("team", team)
      .in("status", ["scheduled", "confirmed"])
      .gte("scheduled_at", dayStart)
      .lte("scheduled_at", dayEnd)
    payload.slots = imobSlotsForDay({
      y,
      mo,
      d,
      location,
      week,
      timezone,
      busy: (busy ?? []) as ImobBusySlot[],
      now: new Date(),
    })
  }

  return NextResponse.json(payload)
}
