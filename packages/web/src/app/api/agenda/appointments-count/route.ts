import { NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { canAccess } from "@web/lib/permissions"
import { getUpcomingAppointmentsCount } from "@web/lib/agenda/appointments-count"

// Story 75-286 — contagem viva do badge "Agenda" (compromissos futuros e
// ativos da org). Mesmo gate do menu/página (canAccess "agenda") e mesma RLS
// do layout (cliente user-scoped do requireAuth).
export const dynamic = "force-dynamic"

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  if (!(await canAccess(auth.appUser.id, auth.appUser.org_id, "agenda"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const count = await getUpcomingAppointmentsCount(auth.supabase, auth.appUser.org_id)
    return NextResponse.json({ count })
  } catch {
    return NextResponse.json({ error: "appointments_count_failed" }, { status: 500 })
  }
}
