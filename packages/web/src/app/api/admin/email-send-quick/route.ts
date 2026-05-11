import { NextRequest, NextResponse } from "next/server"
import { getServerUser } from "@web/lib/auth"
import { sendTemplateEmail } from "@web/lib/email"

export async function POST(request: NextRequest) {
  const user = await getServerUser()
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = (await request.json()) as {
    templateSlug: string
    to: { email: string; name?: string }
    variables: Record<string, string>
    subjectOverride?: string
  }

  if (!body.templateSlug || !body.to?.email) {
    return NextResponse.json({ error: "templateSlug and to.email are required" }, { status: 400 })
  }

  const result = await sendTemplateEmail({
    templateSlug: body.templateSlug,
    to: body.to,
    variables: body.variables ?? {},
    triggeredBy: "manual:quick-send",
    orgId: user.orgId,
    priority: 1,
    subjectOverride: body.subjectOverride,
  })

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ logId: result.logId, queued: result.queued })
}
