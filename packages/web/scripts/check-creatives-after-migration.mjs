import { createClient } from '@supabase/supabase-js'

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// 1. Estado dos meta_ads
const { count: adsTotal } = await supa.from('meta_ads').select('*', { count: 'exact', head: true })
const { count: adsWithThumb } = await supa.from('meta_ads').select('*', { count: 'exact', head: true }).not('creative->>thumbnail_url', 'is', null)
const { count: adsWithImage } = await supa.from('meta_ads').select('*', { count: 'exact', head: true }).not('creative->>image_url', 'is', null)
console.log(`META_ADS total: ${adsTotal}`)
console.log(`META_ADS com creative.thumbnail_url: ${adsWithThumb}`)
console.log(`META_ADS com creative.image_url: ${adsWithImage}`)

// Sample dos ads mais recentes
const { data: adsSample } = await supa.from('meta_ads').select('meta_ad_id, name, status, creative, synced_at').order('synced_at', { ascending: false }).limit(3)
console.log('\n3 ads mais recentes:')
adsSample?.forEach(a => {
  const keys = a.creative ? Object.keys(a.creative) : []
  const thumb = a.creative?.thumbnail_url ? a.creative.thumbnail_url.slice(0, 60) + '...' : 'NULL'
  console.log(`  - synced=${a.synced_at}`)
  console.log(`    name=${a.name?.slice(0,50)}`)
  console.log(`    keys=${keys.join(',')}`)
  console.log(`    thumb=${thumb}`)
})

// 2. Estado dos leads com metadata.ad_id
const { count: leadsAdId } = await supa.from('leads').select('*', { count: 'exact', head: true }).not('metadata->>ad_id', 'is', null)
console.log(`\nLEADS com metadata.ad_id: ${leadsAdId}`)

// 3. Cruzamento: leads com ad_id que casa em meta_ads E que tem thumbnail
const { data: leadsAd } = await supa
  .from('leads')
  .select('id, name, source, metadata, stage_id, is_active, lost_reason')
  .not('metadata->>ad_id', 'is', null)
  .eq('is_active', true)
  .is('lost_reason', null)
  .not('stage_id', 'is', null)
  .order('created_at', { ascending: false })
  .limit(30)

console.log(`\nLeads ativos no pipeline com ad_id: ${leadsAd?.length ?? 0}`)
if (leadsAd?.length) {
  const adIds = [...new Set(leadsAd.map(l => l.metadata.ad_id))]
  const { data: ads } = await supa.from('meta_ads').select('meta_ad_id, name, creative').in('meta_ad_id', adIds)
  const adMap = new Map((ads ?? []).map(a => [a.meta_ad_id, a]))
  console.log(`\nUnique ad_ids: ${adIds.length}, Meta_ads encontrados: ${ads?.length ?? 0}`)
  const withThumb = leadsAd.filter(l => adMap.get(l.metadata.ad_id)?.creative?.thumbnail_url)
  console.log(`Leads VISIBLE no pipeline COM thumbnail renderizável: ${withThumb.length}`)
  if (withThumb.length > 0) {
    console.log('\nPrimeiros 5 leads que vão renderizar CreativeChip:')
    withThumb.slice(0, 5).forEach(l => {
      const ad = adMap.get(l.metadata.ad_id)
      console.log(`  - lead=${l.name?.slice(0,25).padEnd(25)} ad=${ad.name?.slice(0,40)} thumb=YES`)
    })
  } else {
    console.log('\n⚠️ Leads têm ad_id mas meta_ads ainda não tem thumbnail (sync 50-1 não rodou ainda).')
    console.log('Primeiros 3 ad_ids referenciados:')
    leadsAd.slice(0, 3).forEach(l => {
      const ad = adMap.get(l.metadata.ad_id)
      console.log(`  - ad_id=${l.metadata.ad_id} found=${ad ? 'YES' : 'NO'} creative_keys=${ad?.creative ? Object.keys(ad.creative).join(',') : '-'}`)
    })
  }
}
