import { NextResponse } from 'next/server'
import { requireAuth } from '@web/lib/api-auth'

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { supabase, appUser } = auth

  const { data, error } = await supabase
    .from('meta_ad_accounts')
    .select('meta_account_id, name, currency, access_token, status, last_synced_at')
    .eq('org_id', appUser.org_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: 'database_error' }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({
      has_token: false,
      last_4: null,
      ad_account_id: null,
      status: null,
      last_synced_at: null,
    })
  }

  return NextResponse.json({
    has_token: !!data.access_token,
    last_4: data.access_token ? data.access_token.slice(-4) : null,
    ad_account_id: data.meta_account_id,
    status: data.status,
    last_synced_at: data.last_synced_at,
  })
}

export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { supabase, appUser } = auth

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const { token, ad_account_id } = body as Record<string, unknown>

  if (typeof token !== 'string' || token.trim() === '') {
    return NextResponse.json({ error: 'token_required' }, { status: 400 })
  }

  if (typeof ad_account_id !== 'string' || !ad_account_id.startsWith('act_')) {
    return NextResponse.json(
      { error: 'ad_account_id_invalid', detail: 'Must start with act_' },
      { status: 400 }
    )
  }

  const { error } = await supabase.from('meta_ad_accounts').upsert(
    {
      org_id: appUser.org_id,
      meta_account_id: ad_account_id,
      access_token: token.trim(),
      status: 'disconnected',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'org_id,meta_account_id' }
  )

  if (error) {
    return NextResponse.json({ error: 'database_error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
