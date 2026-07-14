import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { sendEmail } from "@web/lib/email"
import { sendPushToUser } from "@web/lib/server/push-service"
import { logEvent } from "@web/lib/logger"
import { hojeSaoPaulo, toIsoDate, type SaoPauloDate } from "@web/lib/billing/reminder-schedule"
import {
  diasAlvoConsecutivos,
  detectarFalhaConsecutiva,
  formatDateBr,
  CONSECUTIVE_ERROR_THRESHOLD_DAYS,
  type SnapshotErrorRow,
} from "@web/lib/billing/collection-health"

// Story 78-13 — Alerta de falha de COLETA persistente (best-effort). NÃO é um coletor de
// saldo/crédito: nenhuma API dos serviços do Epic 78 expõe saldo restante, e o projeto não
// usa Vercel AI Gateway (grep zero — Sinal 1 N/A, documentado na story, sem código aqui).
//
// Sinal-fonte (Story 78-3): `service_cost_snapshots.metric='collection_error'` gravado por
// `run-collector.ts` em toda falha isolada de coletor. Uma credencial revogada/pagamento
// recusado tende a falhar de forma PERSISTENTE (dia após dia), não em 1 dia isolado
// (timeout/instabilidade pontual). Detectamos N=3 dias corridos consecutivos de erro.
//
// Dedup diário SEM migration nova: inserimos um marcador `metric='collection_health_alert_sent'`
// em `service_cost_snapshots` — a 2ª tentativa do dia colide com o UNIQUE(service_id,
// snapshot_date, metric) já existente (migration 164) → não reenvia. Atômico, garantido pelo
// banco. Query de candidatos é data-driven (sem lista hardcoded) → cobre openai/whatsapp/meta_ads
// automaticamente assim que 78-4/78-6/78-10 forem implementadas, sem tocar nesta story.
//
// Guard CRON_SECRET/Bearer (padrão do épico). Dry-run: GET ?dry=1 (não grava marcador nem envia).
// Best-effort: erro numa linha/serviço/admin não derruba o restante (NFR-3).

export const dynamic = "force-dynamic"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://crm.trifold.eng.br"

// Código de erro Postgres para violação de UNIQUE (o dedup funcionando, não uma falha).
const PG_UNIQUE_VIOLATION = "23505"

type ServiceRow = {
  id: string
  slug: string
  name: string
  enabled: boolean
  billing_url: string
}

type AdminRow = { id: string; name: string | null; email: string | null }

/**
 * Mensagem HONESTA (AC12): comunica que a COLETA de custo falhou N dias seguidos — não afirma
 * categoricamente "sua cobrança falhou". Aponta o billing_url do catálogo como próxima ação.
 */
function buildMensagem(
  serviceName: string,
  billingUrl: string,
  diasAlvoBr: string[]
): { subject: string; pushTitle: string; pushBody: string; html: string } {
  const n = diasAlvoBr.length
  const diasStr = diasAlvoBr.join(", ")
  const subject = `[Trifold] Coleta de custo falhando: ${serviceName} (${n} dias seguidos)`
  const pushTitle = "Falha de coleta de billing"
  const pushBody = `${serviceName}: a coleta automática de custo falhou ${n} dias seguidos. Verifique o billing do provedor.`
  const html =
    `<p>Olá,</p>` +
    `<p>A coleta automática de custo do serviço <strong>${serviceName}</strong> falhou nos ` +
    `últimos <strong>${n} dias seguidos</strong> (${diasStr}).</p>` +
    `<p>Isso <em>pode</em> indicar: credencial revogada/expirada, cota ou pagamento recusado no ` +
    `provedor, ou uma mudança na API do fornecedor — <strong>não é uma confirmação</strong> de que ` +
    `a cobrança falhou, apenas um sinal indireto de coleta persistentemente com erro.</p>` +
    `<p>Verifique diretamente no painel do fornecedor: <a href="${billingUrl}">${billingUrl}</a></p>`
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
  const hojeIso = toIsoDate(hoje)
  const diasAlvo = diasAlvoConsecutivos(hoje) // [hoje-1, hoje-2, hoje-3]
  const diasAlvoBr = [...diasAlvo].reverse().map(formatDateBr) // cronológico p/ leitura humana

  // ── 1. Buscar linhas de erro nos dias-alvo (data-driven, sem filtro de serviço) ──
  const { data: errorRowsRaw, error: qErr } = await admin
    .from("service_cost_snapshots")
    .select("service_id, snapshot_date")
    .eq("metric", "collection_error")
    .in("snapshot_date", diasAlvo)

  if (qErr) {
    console.error("[billing-collection-health] erro ao buscar snapshots:", qErr.message)
    return NextResponse.json({ ok: false, error: qErr.message }, { status: 500 })
  }

  const errorRows = (errorRowsRaw ?? []) as SnapshotErrorRow[]
  const servicosVerificados = new Set(errorRows.map((r) => r.service_id)).size

  // ── 2. Detecção pura de falha consecutiva (3/3 dias) ──
  const servicosComFalha = detectarFalhaConsecutiva(errorRows, diasAlvo)

  if (servicosComFalha.size === 0) {
    const summary = {
      ok: true,
      dryRun,
      hoje: hojeIso,
      diasAlvo,
      threshold: CONSECUTIVE_ERROR_THRESHOLD_DAYS,
      servicosVerificados,
      servicosComFalhaConsecutiva: 0,
      alertasEnviados: 0,
      dedupPulados: 0,
    }
    console.log("[billing-collection-health] nenhuma falha consecutiva:", summary)
    return NextResponse.json(summary)
  }

  // ── 3. Buscar catálogo dos serviços em falha e filtrar desabilitados (AC4) ──
  const { data: servicosRaw, error: svcErr } = await admin
    .from("platform_services")
    .select("id, slug, name, enabled, billing_url")
    .in("id", Array.from(servicosComFalha))

  if (svcErr) {
    console.error("[billing-collection-health] erro ao buscar platform_services:", svcErr.message)
    return NextResponse.json({ ok: false, error: svcErr.message }, { status: 500 })
  }

  const servicos = ((servicosRaw ?? []) as ServiceRow[]).filter((s) => s.enabled)

  // ── 4. Dedup atômico via INSERT + UNIQUE, depois envio best-effort ──
  const wouldAlert: Array<Record<string, unknown>> = []
  let alertasEnviados = 0
  let dedupPulados = 0
  let alertErrors = 0

  // Admins ativos (dado da plataforma — sem filtro org_id, padrão 78-8/78-11). Buscados 1x.
  let admins: AdminRow[] = []
  if (!dryRun) {
    const { data: adminsRaw } = await admin
      .from("users")
      .select("id, name, email")
      .eq("role", "admin")
      .eq("is_active", true)
    admins = (adminsRaw ?? []) as AdminRow[]
  }

  const pending: Promise<unknown>[] = []

  for (const svc of servicos) {
    if (dryRun) {
      wouldAlert.push({ service: svc.name, slug: svc.slug, billing_url: svc.billing_url })
      continue
    }

    // Dedup: INSERT (não upsert) do marcador. Sucesso → alertar; 23505 → já alertado hoje.
    const { error: insErr } = await admin.from("service_cost_snapshots").insert({
      service_id: svc.id,
      snapshot_date: hojeIso,
      metric: "collection_health_alert_sent",
      value: 1,
      currency: null,
      collection_status: "ok",
      raw_response: { dias_alvo: diasAlvo, threshold: CONSECUTIVE_ERROR_THRESHOLD_DAYS },
    })

    if (insErr) {
      if (insErr.code === PG_UNIQUE_VIOLATION) {
        // Dedup funcionando — já alertado hoje. Não é falha, não reenvia.
        dedupPulados++
        continue
      }
      // Qualquer outro erro: loga e pula ESTE serviço isoladamente (NFR-3).
      logEvent({
        level: "error",
        category: "cron",
        event_type: "billing_collection_health_marker_failed",
        message: insErr.message,
        metadata: { service: svc.slug, hojeIso },
        source: "api/cron/billing-collection-health",
      })
      alertErrors++
      continue
    }

    // Marcador gravado → enviar alerta (best-effort, .catch independente por envio).
    const { subject, pushTitle, pushBody, html } = buildMensagem(svc.name, svc.billing_url, diasAlvoBr)
    for (const a of admins) {
      if (a.email) {
        pending.push(
          sendEmail({ to: a.email, subject, html }).catch((e: unknown) => {
            alertErrors++
            console.error("[billing-collection-health] email:", a.email, e)
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
          console.error("[billing-collection-health] push:", a.id, e)
        })
      )
    }
    alertasEnviados++
  }

  await Promise.allSettled(pending)

  const summary = {
    ok: true,
    dryRun,
    hoje: hojeIso,
    diasAlvo,
    threshold: CONSECUTIVE_ERROR_THRESHOLD_DAYS,
    servicosVerificados,
    servicosComFalhaConsecutiva: servicosComFalha.size,
    alertasEnviados,
    dedupPulados,
    alertErrors,
    ...(dryRun ? { wouldAlert } : {}),
  }
  console.log("[billing-collection-health] concluído:", summary)
  return NextResponse.json(summary)
}
