import { NextResponse } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"
import { createElement } from "react"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { buildAnalyticsReportData } from "@web/lib/analytics-report-data"
import { AnalyticsReportPDF } from "@web/lib/pdf/analytics-report-pdf"

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { appUser } = auth

  const roleError = requireRole(appUser, ["admin", "supervisor"])
  if (roleError) return roleError

  const data = await buildAnalyticsReportData(auth.supabase, appUser.org_id)

  const pdfElement = createElement(AnalyticsReportPDF, { data })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(pdfElement as any)

  const today = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }).replace(/\//g, "-")

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="relatorio-analytics-${today}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  })
}
