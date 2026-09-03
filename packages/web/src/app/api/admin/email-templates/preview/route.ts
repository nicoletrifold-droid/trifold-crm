import { NextRequest, NextResponse } from "next/server"
import { can } from "@web/lib/permissions"
import { getServerUser } from "@web/lib/auth"
import { renderBaseLayout } from "@web/lib/email-layout"
import { trifoldOrgId } from "@web/lib/tenancy/trifold-org"

export async function POST(request: NextRequest) {
  const user = await getServerUser()
  if (!(await can(user.id, user.orgId, "sistema.emails_gerenciar"))) {
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
  // Story 900-67 (AC5): ferramenta de PRÉ-VISUALIZAÇÃO do admin, não um envio a um tenant.
  // O `orgId` é fixado no da Trifold DE PROPÓSITO, para que a saída continue byte a byte a
  // de hoje (a logo). Omitir o campo faria `isMarcaTrifold(undefined) === false` e trocaria
  // silenciosamente o preview por texto — comportamento novo que ninguém pediu.
  const html = renderBaseLayout(resolved, { orgName: "Trifold", orgId: trifoldOrgId() })

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
