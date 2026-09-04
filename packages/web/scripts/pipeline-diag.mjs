import { createClient } from '@supabase/supabase-js'
// Run with: node --env-file=packages/web/.env.producao.local packages/web/scripts/pipeline-diag.mjs   (produção)
// Contra o banco de teste, troque por --env-file=packages/web/.env.development

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const { data: admins } = await supa.from('users').select('id, name, email, role, org_id, is_active').eq('role', 'admin').limit(5)
console.log('ADMINS:', admins)

const orgId = admins?.[0]?.org_id
if (!orgId) {
  console.error('SEM org_id — abortando')
  process.exit(1)
}
console.log(`\nUsing org_id: ${orgId}`)

const { data: stages } = await supa.from('kanban_stages').select('id, name, position, is_active, type').order('position')
console.log(`\nKANBAN_STAGES total: ${stages?.length ?? 0}`)
stages?.forEach(s => console.log(`  - ${s.position}. ${s.name} (active=${s.is_active}, type=${s.type})`))

const { count: leadsTotal } = await supa.from('leads').select('*', { count: 'exact', head: true }).eq('org_id', orgId)
console.log(`\nLEADS total na org: ${leadsTotal}`)

const { count: leadsActive } = await supa.from('leads').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('is_active', true)
console.log(`LEADS is_active=true: ${leadsActive}`)

const { count: leadsWithStage } = await supa.from('leads').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('is_active', true).not('stage_id', 'is', null)
console.log(`LEADS is_active + stage_id != null: ${leadsWithStage}`)

const { count: leadsKanbanReady } = await supa.from('leads').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('is_active', true).not('stage_id', 'is', null).is('lost_reason', null)
console.log(`LEADS is_active + stage_id + lost_reason=null: ${leadsKanbanReady}`)

const activeStageIds = (stages ?? []).filter(s => s.is_active).map(s => s.id)
const { count: leadsActiveStages } = await supa.from('leads').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('is_active', true).in('stage_id', activeStageIds).is('lost_reason', null)
console.log(`LEADS em kanban_stages.is_active=true: ${leadsActiveStages}`)

console.log('\n--- BREAKDOWN POR STAGE (kanban_stages.is_active=true) ---')
for (const s of stages?.filter(x => x.is_active) ?? []) {
  const { count } = await supa.from('leads').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('is_active', true).eq('stage_id', s.id).is('lost_reason', null)
  console.log(`  ${s.name.padEnd(30)}: ${count}`)
}

console.log('\n--- LEADS META (candidatos a CreativeChip) ---')
const { data: metaLeads } = await supa
  .from('leads')
  .select('id, name, source, stage_id, is_active, lost_reason, metadata')
  .eq('org_id', orgId)
  .in('source', ['meta_ads', 'whatsapp_click_to_ad'])
  .order('created_at', { ascending: false })
  .limit(10)
console.log(`Top 10 leads meta_ads/CTWA:`)
metaLeads?.forEach(l => console.log(`  - ${(l.name ?? '?').padEnd(25)} | src=${l.source.padEnd(22)} | stage=${l.stage_id?.slice(0,8) ?? 'NULL'.padEnd(8)} | active=${l.is_active} | lost=${l.lost_reason ?? '-'} | ad_id=${l.metadata?.ad_id ?? 'NULL'}`))

const { count: leadsWithAdId } = await supa.from('leads').select('*', { count: 'exact', head: true }).eq('org_id', orgId).not('metadata->>ad_id', 'is', null)
console.log(`\nLEADS na org com metadata.ad_id: ${leadsWithAdId}`)

const { count: adsWithThumb } = await supa.from('meta_ads').select('*', { count: 'exact', head: true }).not('creative->>thumbnail_url', 'is', null)
console.log(`META_ADS com creative.thumbnail_url: ${adsWithThumb}`)

console.log('\n--- CRUZAMENTO: leads com ad_id que casa em meta_ads ---')
const { data: leadsAd } = await supa
  .from('leads')
  .select('id, name, source, metadata, stage_id, is_active, lost_reason')
  .eq('org_id', orgId)
  .not('metadata->>ad_id', 'is', null)
  .limit(20)
console.log(`Leads c/ ad_id: ${leadsAd?.length ?? 0}`)
if (leadsAd?.length) {
  const adIds = [...new Set(leadsAd.map(l => l.metadata.ad_id))]
  const { data: ads } = await supa.from('meta_ads').select('meta_ad_id, name, creative').in('meta_ad_id', adIds)
  const adMap = new Map((ads ?? []).map(a => [a.meta_ad_id, a]))
  leadsAd.forEach(l => {
    const ad = adMap.get(l.metadata.ad_id)
    const thumb = ad?.creative?.thumbnail_url ? 'YES' : 'NO'
    const visible = l.is_active && l.stage_id && !l.lost_reason ? 'VISIBLE' : 'HIDDEN'
    console.log(`  - ${(l.name ?? '?').padEnd(25)} ad_id=${l.metadata.ad_id} ad_found=${ad ? 'YES' : 'NO'} thumb=${thumb} ${visible}`)
  })
}
