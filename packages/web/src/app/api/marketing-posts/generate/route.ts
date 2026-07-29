import { NextResponse } from "next/server"
import { marketingGuard } from "@web/lib/marketing/guard"
import {
  createAnthropicClient,
  generateMarketingSuggestions,
  type CampaignSummary,
  type CreativePerformanceRow,
  type PropertyOption,
} from "@trifold/ai"

// Story 75-219 (AC6/AC7) — monta o contexto real de performance e chama o
// Sonnet no padrão do pipeline da Nicole/behavior-analysis. Fail-open: erro da
// Claude API, JSON inválido ou timeout → NENHUMA linha inserida; o agente só
// cria posts com status='sugerido' e não existe caminho de publicação
// automática nesta story.
//
// Sonnet com adaptive thinking pode levar dezenas de segundos; sem maxDuration
// a função cai no timeout default do Vercel antes do modelo responder.
export const maxDuration = 90

const PERIOD_DAYS = 30

export async function POST() {
  const g = await marketingGuard()
  if (g.error) return g.error
  const { admin, supabase, appUser } = g

  // ⚠️ Client por acesso (Dev Notes da story — INEQUÍVOCO):
  // - creative_performance: client do USUÁRIO. A RPC é SECURITY INVOKER com
  //   WHERE org_id = user_org_id() AND is_admin_or_supervisor() (mig 101) —
  //   via service-role auth.uid() é NULL e ela devolve 0 linhas SILENCIOSAMENTE.
  // - meta_campaigns/meta_insights_daily/properties: client do usuário
  //   (policies org_isolation / leitura staff).
  // - marketing_posts: admin client (RLS habilitada SEM policies).
  const [creativesRes, campaignsRes, insightsRes, propertiesRes] = await Promise.all([
    supabase.rpc("creative_performance", { p_days: PERIOD_DAYS }),
    supabase
      .from("meta_campaigns")
      .select("meta_campaign_id, name, status")
      .eq("org_id", appUser.org_id),
    supabase
      .from("meta_insights_daily")
      .select("entity_id, spend, impressions, clicks, leads")
      .eq("org_id", appUser.org_id)
      .eq("level", "campaign")
      .gte(
        "date",
        (() => {
          const d = new Date()
          d.setDate(d.getDate() - PERIOD_DAYS)
          return d.toISOString().split("T")[0]!
        })()
      ),
    supabase
      .from("properties")
      .select("id, name, status, city, delivery_date, differentials")
      .eq("org_id", appUser.org_id)
      .eq("is_active", true),
  ])

  const queryError =
    creativesRes.error ?? campaignsRes.error ?? insightsRes.error ?? propertiesRes.error
  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 })
  }

  const creatives = (creativesRes.data ?? []) as CreativePerformanceRow[]
  // Sanity check (Dev Notes): 0 linhas com dados Meta sincronizados = client
  // errado (falha silenciosa clássica da RPC via service-role).
  console.log(`[marketing-posts/generate] creative_performance rows: ${creatives.length}`)

  // Agregação por campanha (mesmo desenho da rota /api/meta-ads/campaigns).
  const aggByEntity = new Map<
    string,
    { spend: number; impressions: number; clicks: number; leads_meta: number }
  >()
  for (const i of insightsRes.data ?? []) {
    const agg = aggByEntity.get(i.entity_id) ?? {
      spend: 0,
      impressions: 0,
      clicks: 0,
      leads_meta: 0,
    }
    agg.spend += Number(i.spend ?? 0)
    agg.impressions += Number(i.impressions ?? 0)
    agg.clicks += Number(i.clicks ?? 0)
    agg.leads_meta += Number(i.leads ?? 0)
    aggByEntity.set(i.entity_id, agg)
  }

  const campaigns: CampaignSummary[] = (campaignsRes.data ?? []).map((c) => {
    const agg = aggByEntity.get(c.meta_campaign_id) ?? {
      spend: 0,
      impressions: 0,
      clicks: 0,
      leads_meta: 0,
    }
    return {
      name: c.name ?? c.meta_campaign_id,
      status: c.status ?? null,
      spend: Math.round(agg.spend * 100) / 100,
      impressions: agg.impressions,
      clicks: agg.clicks,
      leads_meta: agg.leads_meta,
    }
  })

  const properties = (propertiesRes.data ?? []) as PropertyOption[]

  if (creatives.length === 0 && campaigns.length === 0) {
    return NextResponse.json(
      { error: "Sem dados de campanhas Meta sincronizados para analisar. Sincronize a integração Meta Ads antes de gerar sugestões." },
      { status: 422 }
    )
  }

  try {
    const anthropic = createAnthropicClient()
    const suggestions = await generateMarketingSuggestions(anthropic, {
      periodDays: PERIOD_DAYS,
      creatives,
      campaigns,
      properties,
      now: new Date().toISOString(),
    })

    if (!suggestions) {
      // JSON inválido do modelo → nada é persistido (AC7).
      return NextResponse.json(
        { error: "A Lídia retornou um formato inválido. Tente novamente." },
        { status: 502 }
      )
    }

    // empreendimento_id precisa existir na org — id alucinado vira null
    // (post institucional) em vez de quebrar o INSERT na FK.
    const validPropertyIds = new Set(properties.map((p) => p.id))
    const rows = suggestions.map((s) => ({
      org_id: appUser.org_id,
      empreendimento_id:
        s.empreendimento_id && validPropertyIds.has(s.empreendimento_id)
          ? s.empreendimento_id
          : null,
      canal: s.canal,
      copy: s.copy,
      scheduled_for: s.scheduled_for,
      justificativa: s.justificativa,
      status: "sugerido" as const,
      origem: "agente" as const,
      created_by: null,
    }))

    const { data, error } = await admin
      .from("marketing_posts")
      .insert(rows)
      .select(
        "id, org_id, empreendimento_id, canal, copy, arte_url, scheduled_for, status, justificativa, origem, created_by, created_at, updated_at, properties:empreendimento_id(name)"
      )

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ posts: data ?? [] })
  } catch (err) {
    // Fail-open (AC7): o erro fica contido na feature; nada foi inserido.
    console.error("[marketing-posts/generate] erro ao gerar sugestões:", err)
    return NextResponse.json(
      { error: "Falha ao gerar sugestões. Tente novamente." },
      { status: 500 }
    )
  }
}
