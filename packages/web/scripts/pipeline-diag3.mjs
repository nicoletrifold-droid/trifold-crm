import { createClient } from '@supabase/supabase-js'

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)

// 1. Distinct sources existentes
const { data: sourcesRaw } = await supa.from('leads').select('source').limit(5000)
const sourcesCount = new Map()
sourcesRaw?.forEach(l => sourcesCount.set(l.source ?? 'NULL', (sourcesCount.get(l.source ?? 'NULL') ?? 0) + 1))
console.log('\nDistinct lead sources (first 5000):')
for (const [k, v] of [...sourcesCount.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${v}`)
}

// 2. lucas users
const { data: lucasUsers } = await supa.from('users').select('id, name, email, role, org_id, is_active').ilike('email', '%lucas%')
console.log('\nUsers com "lucas" no email:')
console.log(lucasUsers)

// 3. Leads recent
const { data: recentLeads } = await supa.from('leads').select('id, name, source, created_at, org_id, stage_id, is_active').order('created_at', { ascending: false }).limit(5)
console.log('\n5 leads mais recentes (org-wide):')
recentLeads?.forEach(l => console.log(`  - ${l.created_at} | ${(l.name ?? '?').slice(0,25).padEnd(25)} | src=${l.source} | active=${l.is_active}`))
