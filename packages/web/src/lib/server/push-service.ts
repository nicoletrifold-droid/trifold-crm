import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export async function sendPushToUser(
  supabase: SupabaseClient,
  userId: string,
  payload: { title: string; body: string; url: string }
): Promise<void> {
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
