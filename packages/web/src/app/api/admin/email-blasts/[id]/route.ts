import { NextRequest, NextResponse } from "next/server"
import { getServerUser } from "@web/lib/auth"
import { createAdminClient } from "@web/lib/supabase/admin"

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getServerUser()
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const supabase = createAdminClient()

  // Verify blast belongs to org and is cancellable
  const { data: blast } = await supabase
    .from("email_blasts")
    .select("id, status")
    .eq("id", id)
    .eq("org_id", user.orgId)
    .single()

  if (!blast) return NextResponse.json({ error: "Blast não encontrado" }, { status: 404 })
  if (!["scheduled", "in_progress"].includes(blast.status)) {
    return NextResponse.json({ error: "Apenas blasts agendados ou em andamento podem ser cancelados" }, { status: 400 })
  }

  // Remove pending items from queue (join via email_logs triggered_by)
  const { data: logsToCancel } = await supabase
    .from("email_logs")
    .select("id")
    .like("triggered_by", `blast:${id}%`)
    .eq("org_id", user.orgId)

  if (logsToCancel?.length) {
    const logIds = logsToCancel.map((l) => l.id)
    await supabase
      .from("email_sends_queue")
      .delete()
      .in("email_log_id", logIds)
      .eq("status", "pending")

    await supabase
      .from("email_logs")
      .update({ status: "failed", error_message: "Blast cancelado" })
      .in("id", logIds)
      .eq("status", "pending")
  }

  await supabase
    .from("email_blasts")
    .update({ status: "cancelled" })
    .eq("id", id)

  return NextResponse.json({ success: true })
}
