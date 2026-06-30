import { NextRequest, NextResponse } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"
import { createElement } from "react"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { buildAnalyticsReportData } from "@web/lib/analytics-report-data"
import { resolvePeriod } from "@web/lib/analytics/period"
import { AnalyticsReportPDF } from "@web/lib/pdf/analytics-report-pdf"

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { appUser } = auth

  const roleError = requireRole(appUser, ["admin", "supervisor"])
  if (roleError) return roleError

  // Story 75-31/75-69: o PDF sob demanda segue o período da tela (range/from/to
  // na URL). Sem esses params, resolvePeriod cai no padrão (30 dias) — o relatório
  // sempre reflete um período (não existe mais caminho "sem período").
  const sp = req.nextUrl.searchParams
  const period = resolvePeriod(sp.get("range") ?? undefined, sp.get("from") ?? undefined, sp.get("to") ?? undefined)

  const data = await buildAnalyticsReportData(auth.supabase, appUser.org_id, period)

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
