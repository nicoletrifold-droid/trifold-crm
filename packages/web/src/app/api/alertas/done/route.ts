import { NextRequest, NextResponse } from "next/server"
import { getServerUser } from "@web/lib/auth"
import { createClient } from "@web/lib/supabase/server"

export async function POST(req: NextRequest) {
  await getServerUser()

  const { alertId } = await req.json()
  if (!alertId) {
    return NextResponse.json({ error: "alertId obrigatório" }, { status: 400 })
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from("follow_up_log")
    .update({ status: "done" })
    .eq("id", alertId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
