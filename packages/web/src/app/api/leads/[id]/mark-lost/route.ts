import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"

const REPRESAMENTO_STAGE = "00000000-0000-0000-0001-000000000008"
const NAO_QUALIFICADO_STAGE = "95327bd7-3e88-4038-aa16-250a74ab085c"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = await getServerUser()
  const supabase = await createClient()
  const body = (await req.json()) as { reason?: string; type?: "represamento" | "nao_qualificado" }

  const reason = body.reason?.trim() || null
  const stageId = body.type === "nao_qualificado" ? NAO_QUALIFICADO_STAGE : REPRESAMENTO_STAGE

  // 1. Atualiza stage e lost_reason
  const { error: updateErr } = await supabase
    .from("leads")
    .update({
      stage_id: stageId,
      lost_reason: reason,
    })
    .eq("id", id)
    .eq("org_id", user.orgId)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // 2. Cancela tarefas pendentes
  await supabase
    .from("lead_tasks")
    .update({ completed_at: new Date().toISOString(), completed_by: user.id })
    .eq("lead_id", id)
    .eq("org_id", user.orgId)
    .is("completed_at", null)

  // 3. Registra atividade
  await supabase.from("activities").insert({
    org_id: user.orgId,
    lead_id: id,
    user_id: user.id,
    type: "lead_lost",
    description: reason || "Lead marcado como perdido",
  })

  return NextResponse.json({ ok: true })
}
