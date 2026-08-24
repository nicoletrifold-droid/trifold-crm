import { NextRequest, NextResponse } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"
import { createElement } from "react"
import { Resend } from "resend"
import { createAdminClient } from "@web/lib/supabase/admin"
import { logEventOnce } from "@web/lib/logger"
import {
  claimCronRun,
  finishCronRun,
  INTERVALO_MINIMO_ANALYTICS_REPORT_SEGUNDOS,
} from "@web/lib/cron/claim-run"
import { buildAnalyticsReportData } from "@web/lib/analytics-report-data"
import { AnalyticsReportPDF } from "@web/lib/pdf/analytics-report-pdf"
import { resolvePeriod } from "@web/lib/analytics/period"

// O render do PDF leva ~105s em produção — a rota nunca declarou limite e vinha
// contando com o default implícito da plataforma (Story 75-367). Mesmo valor de
// `supremo-sync`, `sienge-customer-sync` e `nicole-agenda-reconcile`.
export const maxDuration = 300

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

  // Story 75-367 — este cron chegou DUAS vezes por agendamento: dois `emailId`
  // distintos no Resend na run de 24/08 (`delivered` às 02:01:52Z e 02:02:49Z),
  // mesmo conteúdo, mesmo anexo. É a mesma assinatura de gatilho duplicado da
  // 75-352, e o gatilho é externo ao repo (`vercel.json` tem a rota uma vez, não
  // há workflow nem pg_cron). A trava não depende de descobrir qual é.
  //
  // Vem DEPOIS da checagem do `Bearer` de propósito: não abrir superfície pré-auth.
  // E antes de qualquer query, do `buildAnalyticsReportData` e do `renderToBuffer`
  // — quem perde a corrida não pode pagar 105s de PDF para depois jogar fora.
  const { runId, claimed } = await claimCronRun(
    supabase,
    "analytics-report",
    INTERVALO_MINIMO_ANALYTICS_REPORT_SEGUNDOS
  )

  if (!claimed) {
    // `logEventOnce` porque esta é a ÚLTIMA escrita antes do response: o `logEvent`
    // fire-and-forget morre no congelamento da lambda (Story 87-6). Sem esta linha,
    // "chegou um e-mail só" seria compatível tanto com "a trava pegou" quanto com
    // "o gatilho duplicado sumiu" — e a correção ficaria não verificável em produção.
    await logEventOnce({
      level: "warn",
      category: "cron",
      event_type: "ANALYTICS_REPORT_RUN_DUPLICADA",
      message:
        "Invocação duplicada do cron de relatório semanal — run anterior ainda dentro do intervalo mínimo. Nenhum e-mail enviado.",
      metadata: {
        job: "analytics-report",
        intervalo_minimo_s: INTERVALO_MINIMO_ANALYTICS_REPORT_SEGUNDOS,
      },
      source: "api/cron/analytics-report",
    })

    return NextResponse.json({ sent: 0, errors: 0, skipped_reason: "already_running" })
  }

  if (runId === null) {
    // FAIL-CLOSED, ao contrário do `followup`. O helper é fail-open de propósito
    // (`{ runId: null, claimed: true }` quando o RPC falha) porque lá existe uma
    // segunda trava por lead cobrindo o caso. Aqui não existe segunda trava: seguir
    // sem trava é exatamente reabrir o bug que esta story fecha. Um relatório
    // atrasado é recuperável; dois e-mails idênticos, não.
    await logEventOnce({
      level: "error",
      category: "cron",
      event_type: "ANALYTICS_REPORT_CLAIM_INDISPONIVEL",
      message:
        "claim_cron_run indisponível para o relatório semanal — envio abortado (fail-closed). Sem trava não há como garantir e-mail único.",
      metadata: {
        job: "analytics-report",
        intervalo_minimo_s: INTERVALO_MINIMO_ANALYTICS_REPORT_SEGUNDOS,
      },
      source: "api/cron/analytics-report",
    })

    return NextResponse.json({ sent: 0, errors: 0, skipped_reason: "claim_indisponivel" })
  }

  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name")

  if (!orgs || orgs.length === 0) {
    // O recibo também é devido aqui: com o claim no topo, sair sem `finishCronRun`
    // deixaria `finished_at` nulo para sempre numa run que de fato terminou.
    await finishCronRun(supabase, runId, { sent: 0, errors: 0 })
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
            <li>Novos leads (entradas): <strong>${data.entradas}</strong> (${data.entradasDelta >= 0 ? "+" : ""}${data.entradasDelta} vs. período anterior) · <strong>${data.ativos}</strong> ativos</li>
            <li>Visitas realizadas (7d): <strong>${data.visitasRealizadas}</strong> (${data.visitou} na etapa Visitou)</li>
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

  await finishCronRun(supabase, runId, { sent, errors })

  return NextResponse.json({ sent, errors })
}
