import { NextRequest, NextResponse } from "next/server"
import { buildDailyLeadsReport } from "@web/lib/reports/daily-leads-report"
import { sendDailyReport } from "@web/lib/reports/send-daily-report"
// Story 75-345 — a lista de destinatários deixou de ser só a env.
import { resolveDailyReportRecipients } from "@web/lib/reports/recipients"
// Story 900-23 — o cron deixou de rodar para UMA org fixa.
import {
  forEachActiveOrg,
  statusHttpParaResumo,
  type ResumoForEachOrg,
} from "@web/lib/tenancy/for-each-org"
import { trifoldOrgId } from "@web/lib/tenancy/trifold-org"

// Story 75-45 — relatório diário de leads via WhatsApp (diretor).
// Agendado no vercel.json para 10:59 UTC = 07:59 BRT (antes da roleta reabrir
// às 08:00, fechando o dia anterior).
//
// Story 75-345 — os destinatários saem do CRM: usuários escolhidos em
// Configurações › Relatório Diário, MAIS a env `DAILY_REPORT_RECIPIENTS` (que fica
// para número que não é usuário). Sem lista configurada, o comportamento é
// idêntico ao de antes desta story.
//
// Story 900-23 — o `DEFAULT_ORG_ID` morreu: o cron roda para TODAS as organizações
// ativas, uma de cada vez, com o erro de uma isolado das outras
// (`forEachActiveOrg`). O corpo da resposta passou a ser **por organização**.

const SOURCE = "api/cron/daily-report"

/** O que o callback devolve para uma organização — vira `resultados[i].resultado`. */
type ResultadoOrg =
  | { skipped: string }
  | {
      ok: true
      vars: Awaited<ReturnType<typeof buildDailyLeadsReport>>
      destinatarios: Awaited<ReturnType<typeof resolveDailyReportRecipients>>
      sent: number
      errors: unknown[]
    }

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

  /**
   * A org a que a env `DAILY_REPORT_RECIPIENTS` se aplica.
   *
   * `DAILY_REPORT_ORG_ID` sobreviveu, mas MUDOU DE PAPEL: antes decidia *qual org processar* (e
   * por isso o cron atendia uma só); agora decide *para qual das orgs ativas os telefones da env
   * valem*. A composição com `trifoldOrgId()` é feita **aqui, localmente** — de propósito. Se
   * fosse feita dentro de `trifoldOrgId()`, apontar o relatório diário para outra org
   * redirecionaria também o Telegram do `nicole-agenda-reconcile`, que usa o mesmo marcador
   * (AC10.4).
   */
  const orgDaEnvDeRecipients = process.env.DAILY_REPORT_ORG_ID ?? trifoldOrgId()

  const resumo: ResumoForEachOrg<ResultadoOrg> = await forEachActiveOrg<ResultadoOrg>(
    async (org, db) => {
      // ⚠️ A armadilha que a migração cria, e o motivo desta condição existir: sem ela, os
      // telefones de `DAILY_REPORT_RECIPIENTS` — que são pessoas da Trifold — passariam a receber
      // as métricas de negócio de TODAS as empresas. A env é um canal global sem destino por org;
      // iterar as orgs sem escopar quem recebe transforma a correção em vazamento.
      const envDaOrg = org.id === orgDaEnvDeRecipients ? envList : []

      const destinatarios = await resolveDailyReportRecipients(db, org.id, envDaOrg)
      if (destinatarios.length === 0) {
        // Nem lista na tela, nem env aplicável: não há para quem enviar NESTA org. Devolve
        // explícito em vez de "ok" silencioso — e não interrompe as outras organizações.
        return { skipped: "nenhum destinatário configurado" }
      }
      const recipients = destinatarios.map((d) => d.telefone)

      const vars = await buildDailyLeadsReport(db, org.id)
      const result = await sendDailyReport(db, org.id, recipients, vars)
      if (result.errors.length > 0) {
        console.error(`[daily-report] erros de envio (${org.name}):`, result.errors)
      }
      // `destinatarios` no retorno para o log dizer QUEM recebeu, não só quantos.
      return { ok: true, vars, destinatarios, ...result }
    },
    { source: SOURCE },
  )

  return NextResponse.json(
    {
      ok: resumo.falha === 0,
      total: resumo.total,
      sucesso: resumo.sucesso,
      falha: resumo.falha,
      resultados: resumo.resultados.map((r) => ({
        orgId: r.org.id,
        org: r.org.name,
        ok: r.ok,
        ...(r.ok ? r.resultado : { erro: r.erro }),
      })),
    },
    { status: statusHttpParaResumo(resumo) },
  )
}
