import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import type { DailyReportVars } from "./daily-leads-report"

/**
 * Story 75-45 — Envia o relatório diário via template HSM `relatorio_diario_leads`
 * (pt_BR) para cada destinatário (E.164). Espelha o envio de template já usado em
 * notificacoes.ts (sendWhatsApp). Não lança por destinatário: acumula erros.
 */
export async function sendDailyReport(
  admin: SupabaseClient,
  orgId: string,
  recipients: string[],
  vars: DailyReportVars
): Promise<{ sent: number; errors: string[] }> {
  const { data: config } = await admin
    .from("whatsapp_config")
    .select("phone_number_id, access_token")
    .eq("org_id", orgId)
    .single()

  if (!config?.phone_number_id || !config?.access_token) {
    throw new Error("whatsapp_config não encontrada para org")
  }

  const url = `https://graph.facebook.com/v21.0/${config.phone_number_id}/messages`
  const params = [
    vars.data,
    vars.total,
    vars.canais,
    vars.corretores,
    vars.distribuidos,
    vars.tempo,
  ]

  let sent = 0
  const errors: string[] = []

  for (const to of recipients) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: "relatorio_diario_leads",
            language: { code: "pt_BR" },
            components: [
              {
                type: "body",
                parameters: params.map((text) => ({ type: "text", text })),
              },
            ],
          },
        }),
      })
      if (!res.ok) {
        errors.push(`${to}: ${res.status} ${await res.text()}`)
      } else {
        sent++
      }
    } catch (e) {
      errors.push(`${to}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return { sent, errors }
}
