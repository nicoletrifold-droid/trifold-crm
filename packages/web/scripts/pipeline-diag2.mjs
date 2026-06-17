import { createClient } from '@supabase/supabase-js'

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const orgId = '00000000-0000-0000-0000-000000000001'

// Investigação 1: status real de meta_ads
const { count: adsTotal } = await supa.from('meta_ads').select('*', { count: 'exact', head: true })
const { count: adsActive } = await supa.from('meta_ads').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE')
const { count: adsWithCreative } = await supa.from('meta_ads').select('*', { count: 'exact', head: true }).not('creative', 'is', null)
console.log(`META_ADS total: ${adsTotal}`)
console.log(`META_ADS status=ACTIVE: ${adsActive}`)
console.log(`META_ADS creative IS NOT NULL: ${adsWithCreative}`)

// Sample de creatives
const { data: adsSample } = await supa.from('meta_ads').select('meta_ad_id, name, status, creative, synced_at').not('creative', 'is', null).order('synced_at', { ascending: false }).limit(5)
console.log('\nSample 5 ads mais recentes com creative:')
adsSample?.forEach(a => {
  const keys = a.creative ? Object.keys(a.creative) : []
  console.log(`  - ${a.name?.slice(0,40)} | status=${a.status} | synced=${a.synced_at} | keys=${keys.join(',')}`)
})

// Investigação 2: webhook_logs recentes (pra ver se webhook Meta está chegando)
const { data: webhookLogs } = await supa
  .from('webhook_logs')
  .select('source, status, created_at')
  .in('source', ['meta', 'meta-ads', 'whatsapp'])
  .order('created_at', { ascending: false })
  .limit(10)
console.log('\nÚltimos 10 webhook_logs (meta/whatsapp):')
webhookLogs?.forEach(w => console.log(`  - ${w.created_at} | ${w.source} | ${w.status}`))

// Investigação 3: leads com source meta — algum tem metadata mesmo que sem ad_id?
const { data: metaSrcLeads } = await supa
  .from('leads')
  .select('id, name, source, stage_id, is_active, metadata, utm_content, utm_campaign')
  .eq('org_id', orgId)
  .in('source', ['meta_ads', 'whatsapp_click_to_ad'])
  .order('created_at', { ascending: false })
  .limit(10)
console.log(`\nTop 10 leads source=meta_ads/CTWA (na org real): ${metaSrcLeads?.length ?? 0}`)
metaSrcLeads?.forEach(l => console.log(`  - ${(l.name ?? '?').padEnd(25)} | src=${l.source.padEnd(22)} | metadata=${JSON.stringify(l.metadata)?.slice(0,80)}`))

// Investigação 4: lead que o user lucas abriu - pra entender por que pipeline tá vazio na sessao dele
const { data: openedLead } = await supa
  .from('leads')
  .select('id, name, source, stage_id, is_active, lost_reason, assigned_broker_id, org_id, metadata')
  .eq('id', '0f51d993-c25b-41be-af80-17b55d0a59c8')
  .single()
console.log('\nLead que foi aberto na sessao:')
console.log(openedLead)
