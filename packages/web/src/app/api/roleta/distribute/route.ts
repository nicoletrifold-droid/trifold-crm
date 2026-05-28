import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { distributeLeadToNextBroker } from "@web/lib/roleta/distributor"

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser } = auth

  if (!["admin", "supervisor"].includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const leadId = typeof body?.lead_id === "string" ? (body.lead_id as string) : null

  if (!leadId) {
    return NextResponse.json({ error: "lead_id obrigatório" }, { status: 400 })
  }

  const result = await distributeLeadToNextBroker(leadId, appUser.org_id)
  return NextResponse.json(result)
}
