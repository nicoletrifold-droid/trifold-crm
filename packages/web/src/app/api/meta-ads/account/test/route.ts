import { NextResponse } from 'next/server'
import { requireAuth } from '@web/lib/api-auth'
import { metaFetch, MetaOAuthException, MetaPermissionError } from '@trifold/shared'

interface AdAccountResponse {
  id: string
  name: string
  currency: string
}

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { supabase, appUser } = auth

  const { data, error } = await supabase
    .from('meta_ad_accounts')
    .select('id, meta_account_id, access_token')
    .eq('org_id', appUser.org_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ ok: false, error: 'database_error' }, { status: 500 })
  }

  if (!data?.access_token) {
    return NextResponse.json({ ok: false, error: 'no_token' }, { status: 404 })
  }

  try {
    const account = await metaFetch<AdAccountResponse>(
      `/${data.meta_account_id}`,
      data.access_token,
      { params: { fields: 'id,name,currency' } }
    )

    await supabase
      .from('meta_ad_accounts')
      .update({
        name: account.name,
        currency: account.currency,
        status: 'active',
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.id)

    return NextResponse.json({ ok: true, name: account.name, currency: account.currency })
  } catch (err) {
    let errorCode = 'unknown'

    if (err instanceof MetaOAuthException) {
      errorCode = 'token_invalid'
    } else if (err instanceof MetaPermissionError) {
      errorCode = 'permission_denied'
    }

    await supabase
      .from('meta_ad_accounts')
      .update({
        status: 'error',
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.id)

    return NextResponse.json({ ok: false, error: errorCode }, { status: 422 })
  }
}
