import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { sendEmail } from "@web/lib/email"
import { sendPushToUser } from "@web/lib/server/push-service"

// Story 78-8 — Motor de lembretes de vencimento de fatura (cron diário).
//
// Passo 1 — Alertar: para cada service_billing_reminders com status='pending' cuja janela
//   [due_date - alert_days_before, due_date] contém "hoje" (America/Sao_Paulo), marca
//   status='alerted' de forma ATÔMICA (UPDATE ... WHERE status='pending' RETURNING) e
//   dispara e-mail + push (canais REUSADOS — sendEmail/sendPushToUser) para todos os
//   admins ativos (role='admin', is_active=true, SEM filtro org_id — dado da plataforma).
// Passo 2 — Recorrência: para cada linha com due_date < hoje e billing_cycle monthly/annual,
//   avança due_date para o próximo ciclo (com clamp de dia-do-mês) e reseta status='pending'
//   / paid_at=NULL. Ciclo 'usage' não recorre automaticamente — sinalizado em precisaRevisaoManual.
//
// Guard CRON_SECRET (padrão de sla-alerts/boleto-scan). Dry-run: GET ?dry=1 (calcula/reporta
// sem enviar nem gravar). Best-effort: erro numa linha/admin não derruba o restante (NFR-3).

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://crm.trifold.eng.br"

type ReminderRow = {
  id: string
  service_id: string
  due_date: string
  expected_amount: number | null
  currency: string
  billing_cycle: string
  alert_days_before: number
  status: string
  platform_services: { slug: string; name: string } | null
}

type AdminRow = { id: string; name: string | null; email: string | null }

/** "Hoje" (y/m/d inteiros) em America/Sao_Paulo — nunca UTC cru (mesmo padrão de boleto-scan). */
function hojeSaoPaulo(now: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  return { y: get("year"), m: get("month"), d: get("day") }
}

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

/** "YYYY-MM-DD" de um {y,m,d}. */
function toIsoDate(dt: { y: number; m: number; d: number }): string {
  return `${dt.y}-${pad2(dt.m)}-${pad2(dt.d)}`
}

/**
 * Diferença inteira de dias de calendário (hoje - due_date). Positivo = vencido.
 * Compara via Date.UTC nos dois lados (evita o bug de ±1 dia do fuso). null se inválida.
 */
function diffDias(dueDateIso: string, hoje: { y: number; m: number; d: number }): number | null {
  const [y, m, d] = (dueDateIso.split("T")[0]?.split("-") ?? []).map(Number)
  if (!y || !m || !d) return null
  const dueUTC = Date.UTC(y, m - 1, d)
  const hojeUTC = Date.UTC(hoje.y, hoje.m - 1, hoje.d)
  return Math.round((hojeUTC - dueUTC) / 86_400_000)
}

/**
 * Avança due_date um ciclo (monthly = +1 mês, annual = +12 meses), tratando overflow de
 * dia-do-mês por clamp para o último dia do mês de destino (ex.: 31/01 mensal → 28/02 ou
 * 29/02 em ano bissexto). Projeto não usa date-fns — cálculo manual documentado (T4.2).
 */
function avancarCiclo(dueDateIso: string, cycle: "monthly" | "annual"): string | null {
  const [y, m, d] = (dueDateIso.split("T")[0]?.split("-") ?? []).map(Number)
  if (!y || !m || !d) return null
  const monthsToAdd = cycle === "annual" ? 12 : 1
  const total0 = m - 1 + monthsToAdd // mês 0-based acumulado
  const ny = y + Math.floor(total0 / 12)
  const nm0 = ((total0 % 12) + 12) % 12 // 0-based
  // Último dia do mês de destino (dia 0 do mês seguinte).
  const lastDay = new Date(Date.UTC(ny, nm0 + 1, 0)).getUTCDate()
  const nd = Math.min(d, lastDay)
  return `${ny}-${pad2(nm0 + 1)}-${pad2(nd)}`
}

function formatDateBr(iso: string): string {
  const [y, m, d] = iso.split("T")[0]?.split("-") ?? []
  return y && m && d ? `${d}/${m}/${y}` : iso
}

function formatAmount(amount: number | null, currency: string): string {
  if (amount === null || amount === undefined) return "valor não informado"
  return `${currency} ${amount.toFixed(2)}`
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 })
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const dryRun = new URL(request.url).searchParams.get("dry") === "1"
  const admin = createAdminClient()
  const now = new Date()
  const hoje = hojeSaoPaulo(now)
  const hojeIso = toIsoDate(hoje)

  const selectCols =
    "id, service_id, due_date, expected_amount, currency, billing_cycle, alert_days_before, status, platform_services!inner(slug, name, enabled)"

  // ── Passo 1: ALERTAR (janela [due_date - alert_days_before, due_date], status='pending') ──
  let alertsSent = 0
  let alertErrors = 0
  const wouldAlert: Array<Record<string, unknown>> = []

  const { data: pendentesRaw, error: pendErr } = await admin
    .from("service_billing_reminders")
    .select(selectCols)
    .eq("status", "pending")
    .eq("platform_services.enabled", true)

  if (pendErr) {
    console.error("[billing-reminders] erro ao buscar pendentes:", pendErr.message)
    return NextResponse.json({ ok: false, error: pendErr.message }, { status: 500 })
  }

  const pendentes = (pendentesRaw ?? []) as unknown as ReminderRow[]
  const naJanela = pendentes.filter((r) => {
    const diff = diffDias(r.due_date, hoje) // hoje - due
    if (diff === null) return false
    // Janela: due - alert_days_before <= hoje <= due  ⇔  -alert_days_before <= diff <= 0
    return diff <= 0 && diff >= -r.alert_days_before
  })

  if (naJanela.length > 0) {
    if (dryRun) {
      for (const r of naJanela) {
        wouldAlert.push({
          id: r.id,
          service: r.platform_services?.name ?? r.service_id,
          due_date: r.due_date,
          alert_days_before: r.alert_days_before,
        })
      }
    } else {
      // Dedup ATÔMICO: só notifica as linhas efetivamente marcadas (RETURNING). Uma 2ª execução
      // concorrente não encontra mais status='pending' e não reenvia (AC3).
      const ids = naJanela.map((r) => r.id)
      const { data: alertadasRaw, error: updErr } = await admin
        .from("service_billing_reminders")
        .update({ status: "alerted" })
        .in("id", ids)
        .eq("status", "pending")
        .select(
          "id, service_id, due_date, expected_amount, currency, billing_cycle, alert_days_before, status, platform_services(slug, name)"
        )

      if (updErr) {
        console.error("[billing-reminders] erro ao marcar alerted:", updErr.message)
      } else {
        const alertadas = (alertadasRaw ?? []) as unknown as ReminderRow[]

        // Destinatários: TODOS os admins ativos, SEM filtro org_id (dado da plataforma — AC4).
        const { data: adminsRaw } = await admin
          .from("users")
          .select("id, name, email")
          .eq("role", "admin")
          .eq("is_active", true)
        const admins = (adminsRaw ?? []) as AdminRow[]

        // Coleta todos os envios e AWAIT com Promise.allSettled (padrão de obras-approval-reminder):
        // em serverless, retornar a resposta antes dos envios os congela. Cada envio tem .catch
        // próprio (AC4/AC7) — falha de um canal/admin não bloqueia os demais nem interrompe o loop.
        const pending: Promise<unknown>[] = []
        for (const r of alertadas) {
          const serviceName = r.platform_services?.name ?? "Serviço"
          const valor = formatAmount(r.expected_amount, r.currency)
          const vencBr = formatDateBr(r.due_date)
          const subject = `[Trifold] Vencimento próximo: ${serviceName} (${vencBr})`
          const html =
            `<p>Olá,</p>` +
            `<p>O serviço <strong>${serviceName}</strong> tem uma fatura vencendo em <strong>${vencBr}</strong>.</p>` +
            `<p>Valor esperado: <strong>${valor}</strong> · Ciclo: ${r.billing_cycle}</p>` +
            `<p>Garanta o pagamento para não interromper a produção.</p>` +
            `<p><a href="${APP_URL}/dashboard">Abrir o painel</a></p>`

          for (const a of admins) {
            if (a.email) {
              pending.push(
                sendEmail({ to: a.email, subject, html }).catch((e: unknown) => {
                  alertErrors++
                  console.error("[billing-reminders] email:", a.email, e)
                })
              )
            }
            pending.push(
              sendPushToUser(admin, a.id, {
                title: "Fatura vencendo",
                body: `${serviceName} vence em ${vencBr} (${valor}).`,
                url: `${APP_URL}/dashboard`,
              }).catch((e: unknown) => {
                alertErrors++
                console.error("[billing-reminders] push:", a.id, e)
              })
            )
          }
          alertsSent++
        }
        await Promise.allSettled(pending)
      }
    }
  }

  // ── Passo 2: RECORRÊNCIA (due_date < hoje). Não colide com o Passo 1 (due >= hoje lá). ──
  let recorridas = 0
  let recorrErrors = 0
  const precisaRevisaoManual: string[] = []
  const wouldRecur: Array<Record<string, unknown>> = []

  const { data: vencidasRaw, error: vencErr } = await admin
    .from("service_billing_reminders")
    .select(selectCols)
    .lt("due_date", hojeIso)
    .eq("platform_services.enabled", true)

  if (vencErr) {
    console.error("[billing-reminders] erro ao buscar vencidas:", vencErr.message)
  } else {
    const vencidas = (vencidasRaw ?? []) as unknown as ReminderRow[]
    for (const r of vencidas) {
      if (r.billing_cycle === "monthly" || r.billing_cycle === "annual") {
        const proximo = avancarCiclo(r.due_date, r.billing_cycle)
        if (!proximo) {
          recorrErrors++
          console.error("[billing-reminders] due_date inválida na recorrência:", r.id, r.due_date)
          continue
        }
        if (dryRun) {
          wouldRecur.push({ id: r.id, de: r.due_date, para: proximo, cycle: r.billing_cycle })
        } else {
          const { error: recErr } = await admin
            .from("service_billing_reminders")
            .update({ due_date: proximo, status: "pending", paid_at: null })
            .eq("id", r.id)
          if (recErr) {
            recorrErrors++
            console.error("[billing-reminders] erro ao recorrer:", r.id, recErr.message)
          } else {
            recorridas++
          }
        }
      } else {
        // billing_cycle === 'usage' — sem regra de recorrência (Article IV): revisão manual.
        precisaRevisaoManual.push(r.id)
      }
    }
  }

  const summary = {
    ok: true,
    dryRun,
    hoje: hojeIso,
    passo1: {
      pendentes: pendentes.length,
      naJanela: naJanela.length,
      alertsSent,
      alertErrors,
      ...(dryRun ? { wouldAlert } : {}),
    },
    passo2: {
      recorridas,
      recorrErrors,
      precisaRevisaoManual,
      ...(dryRun ? { wouldRecur } : {}),
    },
  }
  console.log("[billing-reminders] concluído:", summary)
  return NextResponse.json(summary)
}
