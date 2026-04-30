import { NextRequest, NextResponse } from "next/server"
import { getServerUser } from "@web/lib/auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { sendTemplateEmail } from "@web/lib/email"

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getServerUser()
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const supabase = createAdminClient()

  const { data: log } = await supabase
    .from("email_logs")
    .select("*, email_templates(slug)")
    .eq("id", id)
    .eq("org_id", user.orgId)
    .single()

  if (!log) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (log.status !== "failed")
    return NextResponse.json({ error: "Only failed emails can be resent" }, { status: 400 })

  const templateSlug = (log.email_templates as { slug: string } | null)?.slug
  if (!templateSlug)
    return NextResponse.json({ error: "No template attached to this email" }, { status: 400 })

  const result = await sendTemplateEmail({
    templateSlug,
    to: { email: log.to_email as string, name: (log.to_name as string | null) ?? undefined },
    variables: (log.variables_used as Record<string, string>) ?? {},
    triggeredBy: `resend:${id}`,
    orgId: user.orgId,
    priority: 1,
  })

  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json({ logId: result.logId, queued: result.queued })
}
