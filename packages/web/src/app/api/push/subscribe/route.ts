import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@web/lib/api-auth'

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const body = await req.json()
  const { endpoint, p256dh, auth: authKey } = body

  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const deviceInfo = req.headers.get('user-agent') ?? undefined

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: appUser.id,
      endpoint,
      p256dh,
      auth: authKey,
      device_info: deviceInfo,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,endpoint' }
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const { endpoint } = await req.json()
  if (!endpoint) return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 })

  await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', appUser.id)
    .eq('endpoint', endpoint)

  return NextResponse.json({ ok: true })
}
