import { NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { getBrokerNavCounts } from "@web/lib/broker/nav-counts"

// Story 75-287 — contagens vivas dos 4 badges do menu do corretor (Agenda,
// Chat, Meus Leads, Bolsão) em UMA resposta `{ counts: { [href]: number } }`.
// Mesmo gate do layout /broker (role broker) e mesma RLS (cliente user-scoped).
export const dynamic = "force-dynamic"

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const roleError = requireRole(auth.appUser, ["broker"])
  if (roleError) return roleError

  try {
    const counts = await getBrokerNavCounts(
      auth.supabase,
      auth.appUser.org_id,
      auth.appUser.id,
    )
    return NextResponse.json({
      counts: {
        "/broker/agenda": counts.agenda,
        "/broker/chat": counts.chat,
        "/broker/leads": counts.leads,
        "/broker/bolsao": counts.bolsao,
      },
    })
  } catch {
    return NextResponse.json({ error: "nav_counts_failed" }, { status: 500 })
  }
}
