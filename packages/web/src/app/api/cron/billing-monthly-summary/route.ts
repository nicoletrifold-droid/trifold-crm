import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { sendEmail } from "@web/lib/email"
import { tentarAppUrl } from "@web/lib/tenancy/app-url-fallback"
import { hojeSaoPaulo, toIsoDate, type SaoPauloDate } from "@web/lib/billing/reminder-schedule"
import {
  mesAnterior,
  somarMonetarioPorServicoMoeda,
  somarTotalPorMoeda,
  somarTecnicoPorServicoMetrica,
  formatMoeda,
  MEDIA_BUDGET_SLUG,
  type CostRow,
} from "@web/lib/billing/cost-summary"

// Story 78-12 — Resumo mensal automático de gasto (best-effort, 1×/mês). Agrega
// `service_cost_snapshots` do MÊS ANTERIOR completo, por serviço e por moeda (nunca somando
// USD+BRL — NFR-7), e envia e-mail aos admins ativos. Zero cadastro manual: o sinal vem 100% do
// custo já coletado pelos coletores (78-3/78-5/78-7...).
//
// Blocos do e-mail:
//   1. Gasto monetário por serviço (currency IS NOT NULL);
//   2. Total consolidado POR MOEDA, EXCLUINDO Meta Ads do "a pagar" (CON-8) — Meta Ads aparece
//      em linha própria rotulada "budget de mídia";
//   3. Uso técnico (currency IS NULL) — informativo, sem valor monetário, EXCLUINDO métricas de
//      bookkeeping (collection_error / collection_health_alert_sent).
//
// Guard interno de dia 1: o cron roda todo dia (mesmo padrão observável de 78-8/78-11), mas só
// age no dia 1 (America/Sao_Paulo). Dedup por período via billing_monthly_summary_log (nunca 2
// e-mails para o mesmo mês). Guard CRON_SECRET/Bearer. Dry-run: GET ?dry=1 (não envia nem grava).

export const dynamic = "force-dynamic"

const PG_UNIQUE_VIOLATION = "23505"

type ServiceMeta = { slug: string; name: string }
type AdminRow = { id: string; name: string | null; email: string | null }

type SnapshotJoinRow = {
  service_id: string
  metric: string
  value: number | string
  currency: string | null
  platform_services: ServiceMeta | ServiceMeta[] | null
}

/** Normaliza a relação to-one do PostgREST (pode vir objeto ou array de 1). */
function svcOf(row: SnapshotJoinRow): ServiceMeta | null {
  const ps = row.platform_services
  if (!ps) return null
  return Array.isArray(ps) ? (ps[0] ?? null) : ps
}

function buildHtml(params: {
  /** Story 900-66 — a base do link chega por parâmetro: quem resolve é o handler, que sabe abortar. */
  appUrl: string
  periodo: string
  porServicoMoeda: Array<{ nome: string; slug: string; currency: string; total: number }>
  totalPorMoeda: Map<string, number>
  metaAds: Array<{ currency: string; total: number }>
  tecnico: Array<{ nome: string; metric: string; total: number }>
}): string {
  const { periodo, porServicoMoeda, totalPorMoeda, metaAds, tecnico } = params

  const linhasServico =
    porServicoMoeda.length > 0
      ? porServicoMoeda
          .map((l) => `<li>${l.nome}: <strong>${formatMoeda(l.currency, l.total)}</strong></li>`)
          .join("")
      : "<li>Nenhum gasto monetário coletado neste período.</li>"

  const linhasTotal =
    totalPorMoeda.size > 0
      ? Array.from(totalPorMoeda.entries())
          .map(([c, v]) => `<li>Total ${c}: <strong>${formatMoeda(c, v)}</strong></li>`)
          .join("")
      : "<li>Sem total a exibir.</li>"

  const blocoMetaAds =
    metaAds.length > 0
      ? `<h3>Budget de mídia (não entra no total a pagar)</h3><ul>` +
        metaAds
          .map((l) => `<li>Meta Ads: <strong>${formatMoeda(l.currency, l.total)}</strong></li>`)
          .join("") +
        `</ul>`
      : ""

  const blocoTecnico =
    tecnico.length > 0
      ? `<h3>Uso técnico (informativo, sem custo)</h3><ul>` +
        tecnico
          .map((l) => `<li>${l.nome} — ${l.metric}: <strong>${l.total}</strong></li>`)
          .join("") +
        `</ul>`
      : ""

  return (
    `<p>Olá,</p>` +
    `<p>Resumo de billing da plataforma referente a <strong>${periodo}</strong> (mês anterior).</p>` +
    `<h3>Gasto por serviço</h3><ul>${linhasServico}</ul>` +
    `<h3>Total consolidado (infraestrutura, por moeda)</h3><ul>${linhasTotal}</ul>` +
    blocoMetaAds +
    blocoTecnico +
    `<p><a href="${params.appUrl}/dashboard">Abrir o painel</a></p>`
  )
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

  // ── Guard de dia 1 (só age no primeiro dia do mês, America/Sao_Paulo) ──
  if (hoje.d !== 1) {
    return NextResponse.json({ ok: true, skipped: "not_day_1", hoje: toIsoDate(hoje) })
  }

  const { periodo, inicio, fim } = mesAnterior(hoje)

  // ── Query: snapshots do mês anterior + slug/name do serviço ──
  const { data: rowsRaw, error: qErr } = await admin
    .from("service_cost_snapshots")
    .select("service_id, metric, value, currency, platform_services!inner(slug, name)")
    .gte("snapshot_date", inicio)
    .lte("snapshot_date", fim)

  if (qErr) {
    console.error("[billing-monthly-summary] erro ao buscar snapshots:", qErr.message)
    return NextResponse.json({ ok: false, error: qErr.message }, { status: 500 })
  }

  const joinRows = (rowsRaw ?? []) as unknown as SnapshotJoinRow[]

  // Metadados por service_id (slug/name) e conjunto de service_ids de Meta Ads.
  const metaById = new Map<string, ServiceMeta>()
  const metaAdsIds = new Set<string>()
  for (const r of joinRows) {
    const svc = svcOf(r)
    if (!svc) continue
    if (!metaById.has(r.service_id)) metaById.set(r.service_id, svc)
    if (svc.slug === MEDIA_BUDGET_SLUG) metaAdsIds.add(r.service_id)
  }

  const rows: CostRow[] = joinRows.map((r) => ({
    service_id: r.service_id,
    metric: r.metric,
    value: r.value,
    currency: r.currency,
  }))

  // ── Agregações puras ──
  const monetarioMap = somarMonetarioPorServicoMoeda(rows)
  const totalPorMoeda = somarTotalPorMoeda(rows, metaAdsIds) // exclui Meta Ads do total (CON-8)
  const tecnicoMap = somarTecnicoPorServicoMetrica(rows)

  // Meta Ads em linha própria (budget de mídia), NÃO somado ao total.
  const porServicoMoeda: Array<{ nome: string; slug: string; currency: string; total: number }> = []
  const metaAds: Array<{ currency: string; total: number }> = []
  for (const m of monetarioMap.values()) {
    const svc = metaById.get(m.service_id)
    const nome = svc?.name ?? m.service_id
    const slug = svc?.slug ?? ""
    if (slug === MEDIA_BUDGET_SLUG) {
      metaAds.push({ currency: m.currency, total: m.total })
    } else {
      porServicoMoeda.push({ nome, slug, currency: m.currency, total: m.total })
    }
  }

  const tecnico = Array.from(tecnicoMap.values()).map((t) => ({
    nome: metaById.get(t.service_id)?.name ?? t.service_id,
    metric: t.metric,
    total: t.total,
  }))

  // Story 900-66 (AC4) — quem não tem URL não envia: o resumo inteiro é abandonado (nada de
  // e-mail com link quebrado), sem reivindicar o dedup do período — assim, ligada a URL, o mês
  // seguinte volta a ser enviável.
  const base = tentarAppUrl(process.env.NEXT_PUBLIC_APP_URL, "cron/billing-monthly-summary")
  if (!base.ok) {
    return NextResponse.json({ ok: true, skipped: "app_url_indisponivel", period: periodo })
  }

  const html = buildHtml({ appUrl: base.url, periodo, porServicoMoeda, totalPorMoeda, metaAds, tecnico })
  const subject = `Resumo de billing — ${periodo}`

  // ── Dry-run: não envia nem grava dedup ──
  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      period: periodo,
      janela: { inicio, fim },
      porServicoMoeda,
      totalPorMoeda: Object.fromEntries(totalPorMoeda),
      metaAds,
      tecnico,
    })
  }

  // ── Dedup atômico (claim-first): reivindica o período ANTES de enviar (AC5, REL-001) ──
  // Fecha a corrida entre runs concorrentes pelo banco: o INSERT do marcador é a fonte da verdade.
  // Só quem grava a linha (23505 → já reivindicado) envia. Mesmo padrão do cron de anomalia
  // (billing_cost_alerts_sent). Sem retry: se o envio posterior falhar, NÃO reprocessamos o mês
  // (AUTO-DECISION da story — best-effort) para nunca arriscar 2 e-mails do mesmo período.
  const { data: claimRows, error: claimErr } = await admin
    .from("billing_monthly_summary_log")
    .insert({ period: periodo })
    .select("period")

  if (claimErr) {
    if (claimErr.code === PG_UNIQUE_VIOLATION) {
      return NextResponse.json({ ok: true, skipped: "already_sent", period: periodo })
    }
    console.error("[billing-monthly-summary] erro ao reivindicar dedup:", claimErr.message)
    return NextResponse.json({ ok: false, error: claimErr.message }, { status: 500 })
  }
  if (!claimRows || claimRows.length === 0) {
    // Sem linha retornada = período já reivindicado por outro run → não envia (dedup).
    return NextResponse.json({ ok: true, skipped: "already_sent", period: periodo })
  }

  // ── Destinatários: todos os admins ativos, SEM filtro org_id (dado da plataforma) ──
  const { data: adminsRaw } = await admin
    .from("users")
    .select("id, name, email")
    .eq("role", "admin")
    .eq("is_active", true)
  const admins = (adminsRaw ?? []) as AdminRow[]

  // Envio best-effort: falha de um admin não bloqueia os demais nem trava o dedup (78-8/78-11).
  let sent = 0
  let errors = 0
  const pending: Promise<unknown>[] = []
  for (const a of admins) {
    if (!a.email) continue
    pending.push(
      sendEmail({ to: a.email, subject, html })
        .then(() => {
          sent++
        })
        .catch((e: unknown) => {
          errors++
          console.error("[billing-monthly-summary] email:", a.email, e)
        })
    )
  }
  await Promise.allSettled(pending)

  // Dedup já reivindicado atomicamente ANTES do envio (claim-first, REL-001). Sem retry:
  // não reprocessamos o mês mesmo que algum envio tenha falhado (best-effort — AUTO-DECISION).
  const summary = {
    ok: true,
    period: periodo,
    janela: { inicio, fim },
    servicosMonetarios: porServicoMoeda.length,
    metaAdsLinhas: metaAds.length,
    tecnicoLinhas: tecnico.length,
    emailsSent: sent,
    emailErrors: errors,
  }
  console.log("[billing-monthly-summary] concluído:", summary)
  return NextResponse.json(summary)
}
