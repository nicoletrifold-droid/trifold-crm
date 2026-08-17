import { NextRequest, NextResponse } from "next/server"
import { can } from "@web/lib/permissions"
import { requireAuth } from "@web/lib/api-auth"
import { gradeDaEquipe } from "@web/lib/appointments/team-slots"

// Story 81-8 (Epic 81) — disponibilidade da agenda para o MODAL INTERNO, no mesmo
// formato do link público: dias abertos + grade de horários livres/ocupados da
// EQUIPE pedida (house × imob não se enxergam — 81-1). O usuário só escolhe entre
// horários livres; o POST segue como guarda final (409 na corrida).
// Story 81-9: a grade é POR EQUIPE, sem local — qualquer compromisso ativo da
// equipe ocupa o horário (o local segue obrigatório só para criar).
//
// GET /api/appointments/slots?team=house|imob&date=YYYY-MM-DD
//  → { days } sempre; { slots } quando date válido.
//
// Equipe efetiva espelha o resolveTeam do POST: perfil imob → imob; admin/supervisor
// escolhem via query; demais → house.
export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const url = new URL(request.url)
  const teamParam = url.searchParams.get("team")
  // 75-307: espelha o resolveTeam do POST — escolher grade de outra equipe é
  // a mesma capability agenda.escolher_equipe.
  const team: "house" | "imob" =
    appUser.role === "imob"
      ? "imob"
      : (await can(appUser.id, appUser.org_id, "agenda.escolher_equipe")) && teamParam === "imob"
        ? "imob"
        : "house"

  // Story 75-331: a conta da grade saiu daqui para `lib/appointments/team-slots.ts`,
  // porque a rota PUBLICA do formulario precisa exatamente da mesma. O gate de
  // capability acima continua sendo responsabilidade desta rota.
  const grade = await gradeDaEquipe({
    supabase,
    orgId: appUser.org_id,
    team,
    date: url.searchParams.get("date"),
  })
  const payload: Record<string, unknown> = { team, days: grade.days }
  if (grade.slots) payload.slots = grade.slots

  return NextResponse.json(payload)
}
