/**
 * Story 75-262 — BACKFILL do nível de ANÚNCIO do Meta.
 *
 * POR QUE EXISTE: o cron `meta-sync-insights` usa `date_preset: "yesterday"`.
 * Consertar a CHECK constraint (migration 211) faz o sync voltar a funcionar
 * **de amanhã em diante** e deixa o buraco de 08/06 até hoje — 8 semanas sem um
 * único dado de criativo, que é justamente o nível que decide arte.
 *
 * COMO RODAR (uma vez, depois da migration 211 aplicada):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/backfill-meta-ad-insights.ts
 *   # opcional: DESDE=2026-06-08 ATE=2026-08-03  (default: 2026-06-08 → ontem)
 *
 * SEGURANÇA:
 *   • Só o nível `ad` — não toca campanha nem conjunto, que estão corretos.
 *   • `upsert` com a mesma chave do cron (`org_id,level,entity_id,date`), então
 *     rodar duas vezes não duplica.
 *   • Fatia em janelas de 7 dias: `time_range` largo com level=ad estoura o
 *     limite de linhas da Graph API numa conta com muitos anúncios.
 *   • Usa o rate limiter de `@trifold/shared`, igual ao cron.
 *
 * ⚠️ Rodar ANTES da migration 211 não serve para nada: cada upsert vai bater na
 * mesma constraint que causou o buraco, e o script aborta no primeiro erro com a
 * mensagem do Postgres (que já nomeia a constraint).
 */

import { createClient } from "@supabase/supabase-js"
import { metaFetch } from "@trifold/shared"
import { resolverAmbiente } from "./lib/db-env"

const DESDE = process.env.DESDE ?? "2026-06-08"
const ATE = process.env.ATE ?? new Date(Date.now() - 86_400_000).toISOString().split("T")[0]!
const JANELA_DIAS = 7

const FIELDS = [
  "ad_id",
  "spend",
  "impressions",
  "reach",
  "clicks",
  "ctr",
  "cpc",
  "cpm",
  "frequency",
  "actions",
  "cost_per_action_type",
  "outbound_clicks",
  "quality_ranking",
  "engagement_rate_ranking",
  "conversion_rate_ranking",
].join(",")

interface Row {
  ad_id: string
  date_start: string
  spend?: string
  impressions?: string
  reach?: string
  clicks?: string
  ctr?: string
  cpc?: string
  cpm?: string
  frequency?: string
  actions?: Array<{ action_type: string; value: string }>
  cost_per_action_type?: Array<{ action_type: string; value: string }>
  outbound_clicks?: Array<{ action_type: string; value: string }>
  quality_ranking?: string
  engagement_rate_ranking?: string
  conversion_rate_ranking?: string
}

const num = (v: string | undefined): number | null => (v == null ? null : Number(v))
const acao = (arr: Row["actions"], tipo: string): number =>
  Number(arr?.find((a) => a.action_type === tipo)?.value ?? 0)
const custo = (arr: Row["cost_per_action_type"], tipo: string): number | null => {
  const v = arr?.find((a) => a.action_type === tipo)?.value
  return v == null ? null : Number(v)
}

function janelas(desde: string, ate: string): Array<{ since: string; until: string }> {
  const out: Array<{ since: string; until: string }> = []
  const fim = new Date(ate)
  let cur = new Date(desde)
  while (cur <= fim) {
    const until = new Date(Math.min(cur.getTime() + (JANELA_DIAS - 1) * 86_400_000, fim.getTime()))
    out.push({ since: cur.toISOString().split("T")[0]!, until: until.toISOString().split("T")[0]! })
    cur = new Date(until.getTime() + 86_400_000)
  }
  return out
}

async function paginar(path: string, token: string, params: Record<string, string>): Promise<Row[]> {
  const out: Row[] = []
  let after: string | undefined
  do {
    const res = await metaFetch<{ data: Row[]; paging?: { cursors?: { after?: string }; next?: string } }>(
      path,
      token,
      { params: { ...params, limit: "200", ...(after ? { after } : {}) } },
    )
    out.push(...(res.data ?? []))
    after = res.paging?.next ? res.paging?.cursors?.after : undefined
  } while (after)
  return out
}

async function main(): Promise<void> {
  // Story 900-3b (AC3): alvo por `scripts/lib/db-env.ts` — allowlist que falha FECHADA,
  // default TESTE. `escreve: true` porque este backfill faz `upsert` em
  // `meta_ad_insights`.
  const alvo = resolverAmbiente({ escreve: true })
  const key = alvo.serviceRoleKey
  if (!key) throw new Error(`SUPABASE_SERVICE_ROLE_KEY ausente para o ambiente "${alvo.ambiente}"`)
  const db = createClient(alvo.url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  // Sem a migration 211 o primeiro upsert com ranking real estoura na constraint.
  // Não faço sonda: o erro do Postgres já é explícito, e sonda que insere linha
  // falsa em produção para "testar" é pior que a falha honesta.
  // Se aparecer `..._ranking_check` no erro: a 211 não foi aplicada.

  const { data: accounts, error: accErr } = await db
    .from("meta_ad_accounts")
    .select("org_id, meta_account_id, access_token")
    .eq("status", "active")
  if (accErr) throw accErr
  if (!accounts?.length) throw new Error("nenhuma conta ativa")

  const js = janelas(DESDE, ATE)
  console.log(`Backfill nível=ad · ${DESDE} → ${ATE} · ${js.length} janelas de ${JANELA_DIAS}d · ${accounts.length} contas\n`)

  let totalLinhas = 0
  for (const acc of accounts) {
    if (!acc.access_token) {
      console.warn(`  ${acc.meta_account_id}: sem token — pulando`)
      continue
    }
    for (const j of js) {
      const rows = await paginar(`${acc.meta_account_id}/insights`, acc.access_token, {
        level: "ad",
        time_range: JSON.stringify({ since: j.since, until: j.until }),
        time_increment: "1", // uma linha POR DIA — sem isso a janela vira 1 linha agregada
        fields: FIELDS,
      })
      if (rows.length === 0) {
        console.log(`  ${acc.meta_account_id} ${j.since}→${j.until}: 0`)
        continue
      }
      const payload = rows.map((r) => ({
        org_id: acc.org_id,
        level: "ad",
        entity_id: r.ad_id,
        date: r.date_start,
        spend: num(r.spend),
        impressions: num(r.impressions),
        reach: num(r.reach),
        clicks: num(r.clicks),
        ctr: num(r.ctr),
        cpc: num(r.cpc),
        cpm: num(r.cpm),
        frequency: num(r.frequency),
        leads: acao(r.actions, "lead"),
        messaging_conversations_started: acao(
          r.actions,
          "onsite_conversion.messaging_conversation_started_7d",
        ),
        cost_per_lead: custo(r.cost_per_action_type, "lead"),
        outbound_clicks: acao(r.outbound_clicks, "outbound_click"),
        landing_page_views: acao(r.actions, "landing_page_view"),
        quality_ranking: r.quality_ranking ?? null,
        engagement_rate_ranking: r.engagement_rate_ranking ?? null,
        conversion_rate_ranking: r.conversion_rate_ranking ?? null,
        actions: r.actions ?? null,
        synced_at: new Date().toISOString(),
      }))
      const { error } = await db
        .from("meta_insights_daily")
        .upsert(payload, { onConflict: "org_id,level,entity_id,date" })
      if (error) throw new Error(`upsert ${j.since}→${j.until}: ${error.message}`)
      totalLinhas += payload.length
      console.log(`  ${acc.meta_account_id} ${j.since}→${j.until}: ${payload.length} linhas`)
    }
  }

  console.log(`\n✅ ${totalLinhas} linhas gravadas.`)
  console.log("Conferir: select min(date), max(date), count(*) from meta_insights_daily where level='ad';")
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e)
  process.exit(1)
})
