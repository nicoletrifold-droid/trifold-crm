import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { logEvent } from "@web/lib/logger"

/**
 * Story 75-352 — a linha de `follow_up_log` passa a nascer ANTES do envio.
 *
 * A ordem antiga era: checa cooldown → renderiza → CHAMA O WHATSAPP → grava o log.
 * Entre a checagem e a gravação cabia uma run inteira, e cabia de fato: duas
 * execuções concorrentes do cron liam o cooldown antes de qualquer uma escrever, e
 * as duas passavam. Medido em 7 dias de produção: 1.560 tentativas para 46 leads
 * na etapa "Atendimento" (≈34 por lead) e 58 linhas duplicadas na tabela.
 *
 * Invertendo a ordem, quem perde a corrida não envia nada — o cooldown do
 * vencedor já está de pé. A atomicidade vem do `pg_advisory_xact_lock` por lead
 * dentro do RPC `claim_follow_up` (migration 234), não de otimismo.
 *
 * Efeito colateral bem-vindo no pós-visita: o claim acontece ANTES da chamada ao
 * modelo que redige a mensagem. Metade das 22 a 24 chamadas Anthropic por run
 * era desperdício puro.
 */

export type TipoDeFollowUp = "nicole_sent" | "post_visit" | "alert_broker"

export interface ClaimFollowUpParams {
  supabase: SupabaseClient
  orgId: string
  leadId: string
  type: TipoDeFollowUp
  ruleId?: string | null
  metadata?: Record<string, unknown>
  /** Janela de cooldown por lead. O código todo usa 48h. */
  cooldownHours?: number
  /**
   * Tipos que bloqueiam o claim. `null`/omitido = QUALQUER tipo bloqueia.
   *
   * Não é preferência: preserva a semântica que já estava no código.
   *  · laço principal (nicole_sent) → sem filtro de tipo (route.ts:120)
   *  · pós-visita                   → só `post_visit` (route.ts:404, visit-feedback-core.ts:122)
   */
  blockingTypes?: TipoDeFollowUp[] | null
  /**
   * Status com que a linha nasce. Default `claimed` — o chamador grava o desfecho
   * depois, com `fecharClaim`.
   *
   * `alert_broker` é a exceção e passa `pending`: ele não tem desfecho de envio, e
   * `pending` é o que as telas de Alertas leem (`api/followup/pending` filtra
   * `status in ('pending','sent')`). Nascer 'claimed' sumiria com o alerta da tela.
   */
  status?: "claimed" | "pending"
}

/**
 * Reivindica o follow-up de um lead. Devolve o id da linha criada, ou `null`
 * quando o cooldown já está de pé (ou quando outra run acabou de reivindicar).
 *
 * **Fail-closed de propósito.** Se o RPC falhar, devolve `null` e o chamador NÃO
 * envia. Perder um follow-up é recuperável na run seguinte; mandar a mesma
 * mensagem duas vezes para o mesmo lead, não. O erro grita como `error` — nunca
 * silencioso, que foi exatamente o pecado da 75-351.
 *
 * ⚠️ Ordem de deploy: a migration 234 precisa estar aplicada ANTES do código
 * subir. Sem o RPC, o fail-closed para o follow-up inteiro (com log de erro em
 * cada lead).
 */
export async function claimFollowUp(params: ClaimFollowUpParams): Promise<string | null> {
  const {
    supabase,
    orgId,
    leadId,
    type,
    ruleId = null,
    metadata = {},
    cooldownHours = 48,
    blockingTypes = null,
    status = "claimed",
  } = params

  const { data, error } = await supabase.rpc("claim_follow_up", {
    p_org_id: orgId,
    p_lead_id: leadId,
    p_type: type,
    p_rule_id: ruleId,
    p_metadata: metadata,
    p_cooldown_hours: cooldownHours,
    p_blocking_types: blockingTypes,
    p_status: status,
  })

  if (error) {
    logEvent({
      level: "error",
      category: "cron",
      event_type: "FOLLOWUP_CLAIM_FALHOU",
      message: `claim_follow_up falhou para o lead ${leadId} (${type}) — NADA foi enviado: ${error.message}`,
      metadata: { lead_id: leadId, type, erro: error.message },
      org_id: orgId,
      source: "lib/followup/claim",
    })
    return null
  }

  return (data as string | null) ?? null
}

export interface DesfechoDoClaim {
  /** `sent` só quando o lead recebeu de fato; `skipped` quando não saiu nada. */
  status: "sent" | "skipped"
  /** Preenchido apenas quando houve entrega. */
  sentAt?: string | null
  /** Texto que foi (ou seria) enviado — no pós-visita só existe depois do modelo. */
  message?: string | null
  metadata?: Record<string, unknown>
}

/**
 * Fecha a linha reivindicada com o desfecho do envio.
 *
 * A linha já existe e já segura o cooldown, então falhar aqui não libera envio
 * duplicado — perde-se o desfecho, não a proteção. Mesmo assim grita: uma linha
 * parada em `claimed` significa que a run morreu no meio.
 */
export async function fecharClaim(
  supabase: SupabaseClient,
  claimId: string,
  desfecho: DesfechoDoClaim
): Promise<void> {
  const { error } = await supabase
    .from("follow_up_log")
    .update({
      status: desfecho.status,
      sent_at: desfecho.sentAt ?? null,
      message: desfecho.message ?? null,
      metadata: desfecho.metadata ?? {},
    })
    .eq("id", claimId)

  if (error) {
    logEvent({
      level: "error",
      category: "cron",
      event_type: "FOLLOWUP_CLAIM_SEM_DESFECHO",
      message: `follow_up_log ${claimId} ficou em 'claimed' — desfecho não gravou: ${error.message}`,
      metadata: { claim_id: claimId, status_pretendido: desfecho.status, erro: error.message },
      source: "lib/followup/claim",
    })
  }
}
