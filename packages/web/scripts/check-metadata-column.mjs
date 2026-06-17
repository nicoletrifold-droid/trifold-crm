import { createClient } from '@supabase/supabase-js'

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// Try to query metadata column
const { data, error } = await supa
  .from('leads')
  .select('id, metadata')
  .limit(1)

if (error) {
  console.log('❌ Column metadata does NOT exist:')
  console.log('  Error:', error.message)
} else {
  console.log('✅ Column metadata EXISTS')
  console.log('  Sample:', JSON.stringify(data?.[0]))

  // Count leads with non-empty metadata
  const { count: nonEmpty } = await supa
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .not('metadata', 'eq', '{}')
  console.log(`  Leads with non-empty metadata: ${nonEmpty}`)

  // Count leads with metadata.ad_id
  const { count: withAdId } = await supa
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .not('metadata->>ad_id', 'is', null)
  console.log(`  Leads with metadata.ad_id: ${withAdId}`)
}
