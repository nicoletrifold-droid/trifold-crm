import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Story 75-174 — Notifica a equipe IMOB (Daiana) por WhatsApp quando uma
 * imobiliária parceira marca visita pelo link público (/agendar/[token]).
 *
 * WhatsApp proativo (fora da janela de 24h) SÓ sai por template aprovado — usa o
 * HSM `nova_visita_imob` (pt_BR, UTILITY, 3 params posicionais):
 *   {{1}} nome do lead · {{2}} dia e hora (BRT) · {{3}} nome da imobiliária.
 * Espelha o envio de template já usado em reports/send-daily-report.ts e
 * notificacoes.ts. Fire-and-forget: acumula erros, nunca lança (a visita já foi
 * gravada; a notificação não pode derrubar o agendamento).
 */
export async function notifyImobVisitWhatsApp(
  admin: SupabaseClient,
  orgId: string,
  params: { leadName: string; whenLabel: string; imobiliariaNome: string }
): Promise<{ sent: number; errors: string[] }> {
  const errors: string[] = []

  const { data: config } = await admin
    .from("whatsapp_config")
    .select("phone_number_id, access_token")
    .eq("org_id", orgId)
    .maybeSingle()
  if (!config?.phone_number_id || !config?.access_token) {
    return { sent: 0, errors: ["whatsapp_config ausente"] }
  }

  // Destinatários = usuários IMOB ativos com telefone (hoje: Daiana; à prova de
  // futuro se a equipe IMOB crescer).
  const { data: recipients } = await admin
    .from("users")
    .select("phone")
    .eq("org_id", orgId)
    .eq("role", "imob")
    .eq("is_active", true)
    .not("phone", "is", null)
  const phones = [...new Set((recipients ?? []).map((r) => (r.phone as string)?.trim()).filter(Boolean))]
  if (phones.length === 0) return { sent: 0, errors: ["nenhum usuário IMOB com telefone"] }

  const url = `https://graph.facebook.com/v21.0/${config.phone_number_id}/messages`
  const bodyParams = [params.leadName, params.whenLabel, params.imobiliariaNome]

  let sent = 0
  for (const to of phones) {
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
            name: "nova_visita_imob",
            language: { code: "pt_BR" },
            components: [
              { type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) },
            ],
          },
        }),
      })
      if (!res.ok) errors.push(`${to}: ${res.status} ${await res.text()}`)
      else sent++
    } catch (e) {
      errors.push(`${to}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return { sent, errors }
}
