import { NextRequest, NextResponse } from "next/server"
import { getServerUser } from "@web/lib/auth"
import { createAdminClient } from "@web/lib/supabase/admin"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getServerUser()
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const supabase = createAdminClient()

  const { data: blast } = await supabase
    .from("email_blasts")
    .select("id, name, status, total_recipients, scheduled_for, created_at")
    .eq("id", id)
    .eq("org_id", user.orgId)
    .single()

  if (!blast) return NextResponse.json({ error: "Blast não encontrado" }, { status: 404 })

  const { data: logs } = await supabase
    .from("email_logs")
    .select("status")
    .like("triggered_by", `blast:${id}%`)
    .eq("org_id", user.orgId)

  const stats = { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0, pending: 0 }
  for (const log of logs ?? []) {
    const s = log.status as keyof typeof stats
    if (s in stats) stats[s]++
  }

  return NextResponse.json({ data: { ...blast, ...stats, total_logs: logs?.length ?? 0 } })
}
