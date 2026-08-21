import "server-only"

import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logEvent } from '@web/lib/logger'

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

/**
 * Story 75-363 — todo push deixa EXATAMENTE 1 evento em `system_events`.
 *
 * Antes, "push entregue" e "push para ninguém" eram indistinguíveis: VAPID
 * quebrada ficou 81 dias muda (75-355) e a escalação de preço da 75-361 avisou
 * um corretor sem nenhuma subscription — só se descobriu cruzando tabelas à mão.
 * O rastro é best-effort e nunca afeta o envio.
 *
 * Contrato mantido: nunca lança (há chamadores com `await` sem catch dentro de
 * cron) e o retorno segue `void`.
 */
export async function sendPushToUser(
  supabase: SupabaseClient,
  userId: string,
  payload: { title: string; body: string; url: string }
): Promise<void> {
  try {
    if (!ensureVapid()) {
      logEvent({
        level: 'error',
        category: 'system',
        event_type: 'PUSH_VAPID_AUSENTE',
        message: 'Push abortado: VAPID não configurada (subject/public/private)',
        metadata: { user_id: userId, title: payload.title },
        source: 'push-service',
      })
      return
    }

    const { data: subs, error: queryError } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', userId)

    if (!subs || subs.length === 0) {
      logEvent({
        level: 'warn',
        category: 'system',
        event_type: 'PUSH_SEM_SUBSCRIPTION',
        message: queryError
          ? 'Push não enviado: consulta de subscriptions falhou'
          : 'Push para ninguém: destinatário sem subscription',
        metadata: {
          user_id: userId,
          title: payload.title,
          query_error: queryError?.message ?? null,
        },
        source: 'push-service',
      })
      return
    }

    let enviados = 0
    let expiradas = 0
    const statusCodesDeFalha: Array<number | null> = []

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(payload)
          )
          enviados++
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode
          if (statusCode === 410) {
            expiradas++
            try {
              await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
            } catch {
              // limpeza é manutenção — falhar aqui não pode derrubar o envio
            }
          } else {
            statusCodesDeFalha.push(statusCode ?? null)
          }
        }
      })
    )

    if (enviados > 0) {
      logEvent({
        level: 'info',
        category: 'system',
        event_type: 'PUSH_ENVIADO',
        message: `Push entregue a ${enviados} subscription(s)`,
        metadata: {
          user_id: userId,
          title: payload.title,
          enviados,
          expiradas,
          falhas: statusCodesDeFalha.length,
        },
        source: 'push-service',
      })
    } else {
      logEvent({
        level: 'warn',
        category: 'system',
        event_type: 'PUSH_SEM_ENTREGA',
        message: `Push com ${subs.length} subscription(s) e zero entregas`,
        metadata: {
          user_id: userId,
          title: payload.title,
          subscriptions: subs.length,
          expiradas,
          status_codes: statusCodesDeFalha,
        },
        source: 'push-service',
      })
    }
  } catch (err) {
    // Contrato: nunca lança. O rastro do imprevisto vai para o console do Vercel.
    console.error('[push-service] falha inesperada:', err)
  }
}
