import { createClient } from '@supabase/supabase-js'

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const START = '2026-06-01'
const END = '2026-06-07'

console.log(`\nMeta Ads spend — ${START} a ${END}\n`)

// Total geral (campaign level, todas as orgs)
const { data: rows, error } = await supa
  .from('meta_insights_daily')
  .select('org_id, date, spend, clicks, impressions, leads')
  .eq('level', 'campaign')
  .gte('date', START)
  .lte('date', END)

if (error) {
  console.error('Erro:', error.message)
  process.exit(1)
}

if (!rows || rows.length === 0) {
  console.log('Nenhum registro encontrado em meta_insights_daily para este período.')
  process.exit(0)
}

const totalSpend = rows.reduce((s, r) => s + Number(r.spend || 0), 0)
const totalClicks = rows.reduce((s, r) => s + Number(r.clicks || 0), 0)
const totalImpressions = rows.reduce((s, r) => s + Number(r.impressions || 0), 0)
const totalLeads = rows.reduce((s, r) => s + Number(r.leads || 0), 0)

console.log(`Registros (campaign-level): ${rows.length}`)
console.log(`TOTAL GASTO:     R$ ${totalSpend.toFixed(2)}`)
console.log(`Total cliques:   ${totalClicks}`)
console.log(`Total impressões:${totalImpressions}`)
console.log(`Total leads:     ${totalLeads}`)

// Quebra por dia
console.log('\n— Por dia —')
const byDay = new Map()
for (const r of rows) {
  byDay.set(r.date, (byDay.get(r.date) || 0) + Number(r.spend || 0))
}
for (const d of [...byDay.keys()].sort()) {
  console.log(`${d}: R$ ${byDay.get(d).toFixed(2)}`)
}

// Quebra por org
console.log('\n— Por org —')
const byOrg = new Map()
for (const r of rows) {
  byOrg.set(r.org_id, (byOrg.get(r.org_id) || 0) + Number(r.spend || 0))
}
for (const [org, spend] of byOrg.entries()) {
  console.log(`${org}: R$ ${spend.toFixed(2)}`)
}
