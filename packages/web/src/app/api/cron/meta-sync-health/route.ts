import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { sendTelegramAdminAlert } from "@web/lib/telegram"

const CRON_SECRET = process.env.CRON_SECRET
const ENTITIES_STALE_HOURS = 6
const INSIGHTS_STALE_HOURS = 26

function isBusinessHoursBRT(): boolean {
  // BRT = UTC-3 — horário comercial 08h–20h BRT = 11h–23h UTC
  const hourUTC = new Date().getUTCHours()
  return hourUTC >= 11 && hourUTC < 23
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!CRON_SECRET) {
    console.error("[META_SYNC_HEALTH] CRON_SECRET not configured")
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 })
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!isBusinessHoursBRT()) {
    return NextResponse.json({ ok: true, skipped: "outside_business_hours" })
  }

  const supabase = createAdminClient()
  const alerts: string[] = []

  // Check 1: entities sync (last 6h)
  const { data: lastEntities } = await supabase
    .from("meta_sync_log")
    .select("id, finished_at, status")
    .eq("sync_type", "entities")
    .eq("status", "success")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const entitiesStale = !lastEntities || lastEntities.finished_at < hoursAgo(ENTITIES_STALE_HOURS)
  if (entitiesStale) {
    const lastSeen = lastEntities
      ? new Date(lastEntities.finished_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
      : "nunca"
    console.warn(`[META_SYNC_HEALTH] Entities sync stale — last success: ${lastSeen}`)
    alerts.push(
      `⚠️ *[Meta Sync] Sync de campanhas parado*\n\nÚltimo sync de entidades: ${lastSeen}\n\nEsperado a cada ${ENTITIES_STALE_HOURS}h. Verifique o cron \`meta-sync-entities\`.`
    )
  }

  // Check 2: insights sync (last 26h)
  const { data: lastInsights } = await supabase
    .from("meta_sync_log")
    .select("id, finished_at, status")
    .eq("sync_type", "insights")
    .eq("status", "success")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const insightsStale = !lastInsights || lastInsights.finished_at < hoursAgo(INSIGHTS_STALE_HOURS)
  if (insightsStale) {
    const lastSeen = lastInsights
      ? new Date(lastInsights.finished_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
      : "nunca"
    console.warn(`[META_SYNC_HEALTH] Insights sync stale — last success: ${lastSeen}`)
    alerts.push(
      `⚠️ *[Meta Sync] Sync de insights parado*\n\nÚltimo sync de insights: ${lastSeen}\n\nEsperado diariamente. Verifique o cron \`meta-sync-insights\`.`
    )
  }

  // Check 3: token status
  const { data: errorAccounts } = await supabase
    .from("meta_ad_accounts")
    .select("id, meta_account_id")
    .eq("status", "error")

  if (errorAccounts && errorAccounts.length > 0) {
    const accountList = errorAccounts.map((a) => `\`${a.meta_account_id}\``).join(", ")
    console.warn(`[META_SYNC_HEALTH] Token error accounts: ${accountList}`)
    alerts.push(
      `🔴 *[Meta Sync] Token inválido ou expirado*\n\nContas afetadas: ${accountList}\n\nAcesse as configurações para renovar o token.`
    )
  }

  // Send all alerts
  for (const alert of alerts) {
    await sendTelegramAdminAlert(alert)
  }

  return NextResponse.json({
    ok: true,
    alerts_sent: alerts.length,
    checks: {
      entities_sync: {
        stale: entitiesStale,
        last_success_at: lastEntities?.finished_at ?? null,
      },
      insights_sync: {
        stale: insightsStale,
        last_success_at: lastInsights?.finished_at ?? null,
      },
      token_status: {
        accounts_with_error: errorAccounts?.length ?? 0,
      },
    },
  })
}
