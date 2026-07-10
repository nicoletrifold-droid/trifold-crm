import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Log sistêmico de NOTIFICAÇÕES FINANCEIRAS ao cliente (boleto: emissão,
 * vencimento, atraso). Alimenta o extrato "Notificações Financeiras"
 * (Sistema › Auditoria), legível por gestor, dividido por empreendimento.
 *
 * 1 linha por CANAL efetivamente disparado (whatsapp/email/push), com cliente,
 * empreendimento, tipo, canal, status e data. Escrito nos pontos de envio
 * (notifyNovoBoleto / notifyBoletoLembrete) — quando o lembrete por e-mail for
 * ligado, ele já cai aqui automaticamente. Fire-and-forget: NUNCA quebra o envio.
 */

export type FinNotifTipo = "novo_boleto" | "vence_hoje" | "atraso_5" | "atraso_15"
export type FinNotifCanal = "whatsapp" | "email" | "push"

/** marco do cron de lembrete → tipo do log. */
export function marcoToTipo(marco: "venc_hoje" | "atraso5" | "atraso15"): FinNotifTipo {
  if (marco === "venc_hoje") return "vence_hoje"
  if (marco === "atraso5") return "atraso_5"
  return "atraso_15"
}

/** "10/07/2026" → "2026-07-10" (null se não casar). */
export function brDateToIso(s: string | null | undefined): string | null {
  if (!s) return null
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim())
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

export interface FinNotifInput {
  orgId: string
  userId?: string | null
  obraId?: string | null
  tipo: FinNotifTipo
  canal: FinNotifCanal
  status?: "sent" | "failed"
  /** Aceita "dd/mm/yyyy" ou ISO; normalizado para date. */
  vencimento?: string | null
  detail?: string | null
}

export async function logFinancialNotification(
  admin: SupabaseClient,
  input: FinNotifInput
): Promise<void> {
  try {
    const raw = input.vencimento ?? null
    const venc = raw
      ? /^\d{4}-\d{2}-\d{2}/.test(raw)
        ? raw.slice(0, 10)
        : brDateToIso(raw)
      : null
    await admin.from("financial_notification_log").insert({
      org_id: input.orgId,
      user_id: input.userId ?? null,
      obra_id: input.obraId ?? null,
      tipo: input.tipo,
      canal: input.canal,
      status: input.status ?? "sent",
      vencimento: venc,
      detail: input.detail ?? null,
    })
  } catch (e) {
    console.error("[financeiro] logFinancialNotification falhou (ignorado)", e)
  }
}
