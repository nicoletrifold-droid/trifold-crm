import "server-only"

import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'

let vapidConfigured = false

function ensureVapid(): boolean {
  if (vapidConfigured) return true
  const subject = process.env.VAPID_SUBJECT
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!subject || !publicKey || !privateKey) return false
  webpush.setVapidDetails(subject, publicKey, privateKey)
  vapidConfigured = true
  return true
}

export async function sendPushToUser(
  supabase: SupabaseClient,
  userId: string,
  payload: { title: string; body: string; url: string }
): Promise<void> {
  if (!ensureVapid()) return

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId)

  await Promise.allSettled(
    (subs ?? []).map((sub) =>
      webpush
        .sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        )
        .catch((err: { statusCode?: number }) => {
          if (err.statusCode === 410) {
            supabase
              .from('push_subscriptions')
              .delete()
              .eq('endpoint', sub.endpoint)
              .then(() => {})
          }
        })
    )
  )
}
