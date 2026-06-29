import { NextRequest, NextResponse } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"
import { createElement } from "react"
import { Resend } from "resend"
import { createAdminClient } from "@web/lib/supabase/admin"
import { buildAnalyticsReportData } from "@web/lib/analytics-report-data"
import { AnalyticsReportPDF } from "@web/lib/pdf/analytics-report-pdf"
import { resolvePeriod } from "@web/lib/analytics/period"

const CRON_SECRET = process.env.CRON_SECRET
const RESEND_API_KEY = process.env.RESEND_API_KEY
const REPORT_RECIPIENTS = process.env.ANALYTICS_REPORT_EMAILS
  ? process.env.ANALYTICS_REPORT_EMAILS.split(",").map((e) => e.trim())
  : ["alexandre@trifold.eng.br", "marcos@trifold.eng.br"]
const SENDER = "Trifold CRM <contato@trifold.com.br>"

export async function GET(request: NextRequest) {
  if (!CRON_SECRET) {
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 })
  }
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!RESEND_API_KEY) {
    console.error("[ANALYTICS-REPORT] RESEND_API_KEY not configured")
    return NextResponse.json({ error: "Email not configured" }, { status: 503 })
  }

  const supabase = createAdminClient()

  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name")

  if (!orgs || orgs.length === 0) {
    return NextResponse.json({ sent: 0, message: "No organizations found" })
  }

  const resend = new Resend(RESEND_API_KEY)
  let sent = 0
  let errors = 0

  for (const org of orgs) {
    try {
      // Relatório AUTOMÁTICO é sempre a janela de 7 dias (7 dias vs 7 dias
      // anteriores) — Story 75-69: todos os blocos seguem o mesmo período.
      const data = await buildAnalyticsReportData(supabase, org.id, resolvePeriod("7d"))
      const pdfElement = createElement(AnalyticsReportPDF, { data })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const buffer = await renderToBuffer(pdfElement as any)

      const dateLabel = new Date().toLocaleDateString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
      const filename = `relatorio-analytics-${dateLabel.replace(/\//g, "-")}.pdf`

      const { error } = await resend.emails.send({
        from: SENDER,
        to: REPORT_RECIPIENTS,
        subject: `Resumo semanal de leads · ${data.periodRange}`,
        html: `
          <p>Olá!</p>
          <p>Segue o relatório semanal de analytics da plataforma Trifold CRM.</p>
          <p><strong>Período:</strong> ${data.rangeLabel} (${data.periodRange})</p>
          <ul>
            <li>Novos leads: <strong>${data.novosLeads}</strong> (${data.novosLeadsDelta >= 0 ? "+" : ""}${data.novosLeadsDelta} vs. período anterior)</li>
            <li>Fechamentos: <strong>${data.fechamentos}</strong></li>
            <li>Perdidos: <strong>${data.perdidos}</strong></li>
          </ul>
          <p>O relatório completo está em anexo.</p>
        `,
        attachments: [
          {
            filename,
            content: Buffer.from(buffer),
            contentType: "application/pdf",
          },
        ],
      })

      if (error) {
        console.error(`[ANALYTICS-REPORT] Failed for org ${org.id}:`, error)
        errors++
      } else {
        sent++
      }
    } catch (err) {
      console.error(`[ANALYTICS-REPORT] Error for org ${org.id}:`, err)
      errors++
    }
  }

  return NextResponse.json({ sent, errors })
}
