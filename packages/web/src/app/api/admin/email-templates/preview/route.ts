import { NextRequest, NextResponse } from "next/server"
import { getServerUser } from "@web/lib/auth"
import { renderBaseLayout } from "@web/lib/email-layout"

export async function POST(request: NextRequest) {
  const user = await getServerUser()
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json()
  const { html_body, subject, variables } = body as {
    html_body: string
    subject?: string
    variables?: Record<string, string>
  }

  if (!html_body) {
    return NextResponse.json({ error: "html_body required" }, { status: 400 })
  }

  const resolved = resolveVariablesForPreview(html_body, variables ?? {})
  const html = renderBaseLayout(resolved, { orgName: "Trifold" })

  return NextResponse.json({ html, subject: subject ?? "" })
}

function resolveVariablesForPreview(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    vars[key] ??
    `<span style="color:#f97316;font-weight:bold;background:#fff7ed;padding:0 2px;border-radius:2px;">[${key.toUpperCase()}]</span>`
  )
}
