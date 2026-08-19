import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { buildDailyLeadsReport } from "@web/lib/reports/daily-leads-report"
import { sendDailyReport } from "@web/lib/reports/send-daily-report"
// Story 75-345 — a lista de destinatários deixou de ser só a env.
import { resolveDailyReportRecipients } from "@web/lib/reports/recipients"

// Story 75-45 — relatório diário de leads via WhatsApp (diretor).
// Agendado no vercel.json para 10:59 UTC = 07:59 BRT (antes da roleta reabrir
// às 08:00, fechando o dia anterior).
//
// Story 75-345 — os destinatários saem do CRM: usuários escolhidos em
// Configurações › Relatório Diário, MAIS a env `DAILY_REPORT_RECIPIENTS` (que fica
// para número que não é usuário). Sem lista configurada, o comportamento é
// idêntico ao de antes desta story.
const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001" // Trifold Engenharia

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get("authorization")
  if (!cronSecret) {
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 })
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const envList = (process.env.DAILY_REPORT_RECIPIENTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

  const orgId = process.env.DAILY_REPORT_ORG_ID ?? DEFAULT_ORG_ID
  const admin = createAdminClient()

  const destinatarios = await resolveDailyReportRecipients(admin, orgId, envList)
  if (destinatarios.length === 0) {
    // Nem lista na tela, nem env: não há para quem enviar. Devolve explícito em vez
    // de "ok" silencioso — é o que aparece no log da Vercel se alguém zerar a lista.
    return NextResponse.json({ skipped: "nenhum destinatário configurado" })
  }
  const recipients = destinatarios.map((d) => d.telefone)

  try {
    const vars = await buildDailyLeadsReport(admin, orgId)
    const result = await sendDailyReport(admin, orgId, recipients, vars)
    if (result.errors.length > 0) {
      console.error("[daily-report] erros de envio:", result.errors)
    }
    // `destinatarios` no retorno para o log dizer QUEM recebeu, não só quantos.
    return NextResponse.json({ ok: true, vars, destinatarios, ...result })
  } catch (e) {
    console.error("[daily-report] falha:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
