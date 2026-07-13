import { NextRequest, NextResponse } from "next/server"
import { getServerUser } from "@web/lib/auth"
import { createClient } from "@web/lib/supabase/server"

export async function POST(req: NextRequest) {
  await getServerUser()

  const { alertId } = await req.json()
  if (!alertId) {
    return NextResponse.json({ error: "alertId obrigatório" }, { status: 400 })
  }

  // Alertas de "lead parado" têm id "stale-<leadId>" e não correspondem a um
  // follow_up_log — nada a resolver no banco (o dismiss é só client-side).
  if (typeof alertId === "string" && alertId.startsWith("stale-")) {
    return NextResponse.json({ success: true })
  }

  const supabase = await createClient()

  // A lista deduplica por lead: marcar como feito deve limpar TODOS os follow-ups
  // pendentes/enviados daquele lead (senão o lead reaparece com outro log).
  const { data: logRow } = await supabase
    .from("follow_up_log")
    .select("lead_id")
    .eq("id", alertId)
    .single()

  const query = supabase.from("follow_up_log").update({ status: "done" })
  const { error } = logRow?.lead_id
    ? await query.eq("lead_id", logRow.lead_id).in("status", ["pending", "sent"])
    : await query.eq("id", alertId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
