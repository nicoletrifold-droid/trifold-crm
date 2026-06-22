import { createClient } from '@supabase/supabase-js'

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const orgId = '00000000-0000-0000-0000-000000000001'

// Bug suspeito na diag1: .in('source', [...]) com enum pode falhar. Vamos forçar.
const { data: metaLeads, count: metaCount } = await supa
  .from('leads')
  .select('id, name, source, stage_id, is_active, metadata, utm_content, created_at', { count: 'exact' })
  .eq('org_id', orgId)
  .eq('source', 'meta_ads')
  .order('created_at', { ascending: false })
  .limit(20)
console.log(`Leads source=meta_ads na org: ${metaCount}`)
metaLeads?.slice(0, 10).forEach(l => {
  const md = l.metadata
  const adId = md?.ad_id
  console.log(`  - ${(l.name ?? '?').slice(0,22).padEnd(22)} | created=${l.created_at?.slice(0,10)} | metadata_keys=${md ? Object.keys(md).join(',') : 'NULL/none'} | ad_id=${adId ?? '-'}`)
})

// Quantos meta_ads têm creative.thumbnail_url ou outras chaves expandidas
const { data: adsExpanded } = await supa
  .from('meta_ads')
  .select('meta_ad_id, name, status, creative, synced_at')
  .order('synced_at', { ascending: false })
  .limit(30)

const stats = { onlyId: 0, expanded: 0, withThumb: 0, withImage: 0, withStorySpec: 0 }
adsExpanded?.forEach(a => {
  const keys = a.creative ? Object.keys(a.creative) : []
  if (keys.length === 1 && keys[0] === 'id') stats.onlyId++
  else if (keys.length > 1) stats.expanded++
  if (a.creative?.thumbnail_url) stats.withThumb++
  if (a.creative?.image_url) stats.withImage++
  if (a.creative?.object_story_spec) stats.withStorySpec++
})
console.log('\nMeta_ads sample (30 mais recentes):')
console.log(stats)
console.log('\nPrimeiros 3 com keys completas:')
adsExpanded?.slice(0, 3).forEach(a => console.log(`  - ${a.name?.slice(0,40)} | synced=${a.synced_at} | creative=${JSON.stringify(a.creative).slice(0, 200)}`))

// Filtro JSONB direto no Postgres
const { count: thumbCount } = await supa
  .from('meta_ads')
  .select('*', { count: 'exact', head: true })
  .not('creative->>thumbnail_url', 'is', null)
console.log(`\nMeta_ads com creative->>thumbnail_url IS NOT NULL: ${thumbCount}`)

// Leads com metadata.ad_id usando notação JSONB
const { count: withAdIdCount } = await supa
  .from('leads')
  .select('*', { count: 'exact', head: true })
  .eq('org_id', orgId)
  .not('metadata->>ad_id', 'is', null)
console.log(`Leads com metadata->>ad_id IS NOT NULL: ${withAdIdCount}`)
