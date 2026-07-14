import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { sendEmail } from "@web/lib/email"
import { sendPushToUser } from "@web/lib/server/push-service"
import { hojeSaoPaulo, toIsoDate, type SaoPauloDate } from "@web/lib/billing/reminder-schedule"
import {
  mtdWindows,
  somarPorMoeda,
  avaliarAnomalias,
  formatMoeda,
  ANOMALY_MOM_THRESHOLD,
  type CostRow,
  type AnomalyTrigger,
} from "@web/lib/billing/cost-summary"

// Story 78-12 — Alerta de anomalia de gasto (best-effort, 1×/dia). Compara o gasto acumulado do
// mês corrente (MTD: dia 1 → ontem) de cada serviço com o MESMO intervalo de dias do mês anterior
// (comparação proporcional — AUTO-DECISION da story), por moeda (NFR-7, nunca soma USD+BRL).
//
// Gatilhos (independentes, podem disparar ambos no mesmo mês):
//   - cost_anomaly_mom:   aumento >= +50% MoM (default fixo, funciona sem nenhuma config — AC6);
//   - threshold_absolute: override opcional monthly_cost_alert_threshold cruzado (AC8).
// Respeita cost_alerts_enabled (AC10) e só avalia serviços com custo monetário no mês (AC11).
// Dedup por (service_id, alert_type, period=mês corrente) via INSERT + UNIQUE (AC9). Guard
// CRON_SECRET/Bearer. Dry-run: GET ?dry=1 (avalia mas não grava dedup nem envia). E-mail + push
// aos admins ativos, best-effort (78-8/78-11).

export const dynamic = "force-dynamic"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://crm.trifold.eng.br"

// Código de erro Postgres para violação de UNIQUE (o dedup funcionando, não uma falha).
const PG_UNIQUE_VIOLATION = "23505"

type ServiceRow = {
  id: string
  slug: string
  name: string
  monthly_cost_alert_threshold: number | string | null
}

type AdminRow = { id: string; name: string | null; email: string | null }

function buildMensagem(
  serviceName: string,
  trigger: AnomalyTrigger
): { subject: string; pushTitle: string; pushBody: string; html: string } {
  const atualStr = formatMoeda(trigger.currency, trigger.mtdAtual)
  const refStr = formatMoeda(trigger.currency, trigger.mtdAnterior)

  if (trigger.type === "threshold_absolute") {
    const limiteStr = formatMoeda(trigger.currency, trigger.threshold ?? 0)
    const subject = `[Trifold] Gasto acima do limite: ${serviceName} (${atualStr})`
    const pushTitle = "Gasto acima do limite"
    const pushBody = `${serviceName}: gasto do mês (${atualStr}) cruzou o limite configurado (${limiteStr}).`
    const html =
      `<p>Olá,</p>` +
      `<p>O gasto acumulado do mês do serviço <strong>${serviceName}</strong> ` +
      `(<strong>${atualStr}</strong>) cruzou o limite absoluto configurado (${limiteStr}).</p>` +
      `<p><a href="${APP_URL}/dashboard">Abrir o painel</a></p>`
    return { subject, pushTitle, pushBody, html }
  }

  // cost_anomaly_mom
  const pctStr = Number.isFinite(trigger.percentual)
    ? `+${Math.round(trigger.percentual * 100)}%`
    : "sem base no mês anterior"
  const subject = `[Trifold] Gasto anômalo: ${serviceName} (${pctStr} vs. mês anterior)`
  const pushTitle = "Gasto anômalo detectado"
  const pushBody = `${serviceName}: gasto do mês (${atualStr}) subiu ${pctStr} vs. o mesmo período do mês anterior (${refStr}).`
  const html =
    `<p>Olá,</p>` +
    `<p>O gasto acumulado do mês do serviço <strong>${serviceName}</strong> está ` +
    `<strong>${pctStr}</strong> acima do mesmo período do mês anterior.</p>` +
    `<p>Mês corrente (até ontem): <strong>${atualStr}</strong> · Mesmo período do mês anterior: ${refStr}</p>` +
    `<p>Verifique se há uso fora do padrão. <a href="${APP_URL}/dashboard">Abrir o painel</a></p>`
  return { subject, pushTitle, pushBody, html }
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
  const hoje: SaoPauloDate = hojeSaoPaulo(now)

  // ── Sem "ontem" no mês corrente ainda (dia 1) → nada a avaliar ──
  const windows = mtdWindows(hoje)
  if (!windows) {
    return NextResponse.json({ ok: true, skipped: "day_1_no_mtd_yet", hoje: toIsoDate(hoje) })
  }
  const { periodoAtual, atualInicio, atualFim, anteriorInicio, anteriorFim } = windows

  // ── Serviços habilitados e com alerta ligado ──
  const { data: servicosRaw, error: svcErr } = await admin
    .from("platform_services")
    .select("id, slug, name, monthly_cost_alert_threshold")
    .eq("enabled", true)
    .eq("cost_alerts_enabled", true)

  if (svcErr) {
    console.error("[billing-cost-anomaly] erro ao buscar serviços:", svcErr.message)
    return NextResponse.json({ ok: false, error: svcErr.message }, { status: 500 })
  }
  const servicos = (servicosRaw ?? []) as ServiceRow[]
  if (servicos.length === 0) {
    return NextResponse.json({ ok: true, periodoAtual, servicosAvaliados: 0, alertasEnviados: 0 })
  }
  const serviceIds = servicos.map((s) => s.id)

  // ── Snapshots monetários das 2 janelas (currency IS NOT NULL) ──
  const selectCols = "service_id, value, currency"
  const [atualRes, anteriorRes] = await Promise.all([
    admin
      .from("service_cost_snapshots")
      .select(selectCols)
      .in("service_id", serviceIds)
      .not("currency", "is", null)
      .gte("snapshot_date", atualInicio)
      .lte("snapshot_date", atualFim),
    admin
      .from("service_cost_snapshots")
      .select(selectCols)
      .in("service_id", serviceIds)
      .not("currency", "is", null)
      .gte("snapshot_date", anteriorInicio)
      .lte("snapshot_date", anteriorFim),
  ])

  if (atualRes.error || anteriorRes.error) {
    const msg = atualRes.error?.message ?? anteriorRes.error?.message ?? "query error"
    console.error("[billing-cost-anomaly] erro ao buscar snapshots:", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }

  const atualPorServico = new Map<string, CostRow[]>()
  const anteriorPorServico = new Map<string, CostRow[]>()
  for (const r of (atualRes.data ?? []) as CostRow[]) {
    const arr = atualPorServico.get(r.service_id) ?? []
    arr.push(r)
    atualPorServico.set(r.service_id, arr)
  }
  for (const r of (anteriorRes.data ?? []) as CostRow[]) {
    const arr = anteriorPorServico.get(r.service_id) ?? []
    arr.push(r)
    anteriorPorServico.set(r.service_id, arr)
  }

  // ── Admins ativos (dado da plataforma, sem org_id), buscados 1x ──
  let admins: AdminRow[] = []
  if (!dryRun) {
    const { data: adminsRaw } = await admin
      .from("users")
      .select("id, name, email")
      .eq("role", "admin")
      .eq("is_active", true)
    admins = (adminsRaw ?? []) as AdminRow[]
  }

  const wouldAlert: Array<Record<string, unknown>> = []
  let alertasEnviados = 0
  let dedupPulados = 0
  let alertErrors = 0
  let servicosAvaliados = 0
  const pending: Promise<unknown>[] = []

  for (const svc of servicos) {
    const atualRows = atualPorServico.get(svc.id) ?? []
    if (atualRows.length === 0) continue // sem gasto monetário no mês corrente (AC11)
    servicosAvaliados++

    const atualPorMoeda = somarPorMoeda(atualRows)
    const anteriorPorMoeda = somarPorMoeda(anteriorPorServico.get(svc.id) ?? [])
    const thresholdAbsoluto =
      svc.monthly_cost_alert_threshold != null ? Number(svc.monthly_cost_alert_threshold) : null

    const triggers = avaliarAnomalias({ atualPorMoeda, anteriorPorMoeda, thresholdAbsoluto })
    if (triggers.length === 0) continue

    // Dedup por (service, tipo): um tipo dispara no máximo 1x por mês, ainda que haja triggers
    // em múltiplas moedas (raro; serviços têm 1 moeda). Mantém o primeiro trigger de cada tipo.
    const porTipo = new Map<string, AnomalyTrigger>()
    for (const t of triggers) {
      if (!porTipo.has(t.type)) porTipo.set(t.type, t)
    }

    for (const trigger of porTipo.values()) {
      if (dryRun) {
        wouldAlert.push({
          service: svc.name,
          slug: svc.slug,
          type: trigger.type,
          currency: trigger.currency,
          mtdAtual: trigger.mtdAtual,
          mtdAnterior: trigger.mtdAnterior,
          percentual: trigger.percentual,
        })
        continue
      }

      // Dedup atômico: INSERT do marcador; 23505 → já alertado este mês p/ (serviço, tipo).
      const { error: insErr } = await admin.from("billing_cost_alerts_sent").insert({
        service_id: svc.id,
        alert_type: trigger.type,
        period: periodoAtual,
        details: {
          currency: trigger.currency,
          mtd_atual: trigger.mtdAtual,
          mtd_anterior: trigger.mtdAnterior,
          percentual: Number.isFinite(trigger.percentual) ? trigger.percentual : null,
          threshold: trigger.threshold ?? null,
        },
      })

      if (insErr) {
        if (insErr.code === PG_UNIQUE_VIOLATION) {
          dedupPulados++
          continue
        }
        console.error("[billing-cost-anomaly] erro ao gravar dedup:", svc.slug, insErr.message)
        alertErrors++
        continue
      }

      // Marcador gravado → notificar (best-effort, .catch por canal/admin).
      const { subject, pushTitle, pushBody, html } = buildMensagem(svc.name, trigger)
      for (const a of admins) {
        if (a.email) {
          pending.push(
            sendEmail({ to: a.email, subject, html }).catch((e: unknown) => {
              alertErrors++
              console.error("[billing-cost-anomaly] email:", a.email, e)
            })
          )
        }
        pending.push(
          sendPushToUser(admin, a.id, {
            title: pushTitle,
            body: pushBody,
            url: `${APP_URL}/dashboard`,
          }).catch((e: unknown) => {
            alertErrors++
            console.error("[billing-cost-anomaly] push:", a.id, e)
          })
        )
      }
      alertasEnviados++
    }
  }

  await Promise.allSettled(pending)

  const summary = {
    ok: true,
    dryRun,
    periodoAtual,
    janelas: { atualInicio, atualFim, anteriorInicio, anteriorFim },
    threshold: ANOMALY_MOM_THRESHOLD,
    servicosAvaliados,
    alertasEnviados,
    dedupPulados,
    alertErrors,
    ...(dryRun ? { wouldAlert } : {}),
  }
  console.log("[billing-cost-anomaly] concluído:", summary)
  return NextResponse.json(summary)
}
