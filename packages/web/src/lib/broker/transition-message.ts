/**
 * Story 51-2 (Epic 51) — Mensagem de transição ao lead (apresentação do corretor).
 *
 * Quando o corretor assume a conversa (1ª mensagem `role='broker'` daquela
 * conversa), o lead recebe ANTES uma mensagem automática apresentando o
 * corretor pelo nome. A detecção de "1ª mensagem" e o despacho/gravação
 * acontecem no route (`send-message/route.ts`); este módulo concentra apenas
 * a lógica PURA de montagem do texto, para testabilidade isolada.
 *
 * [AUTO-DECISION 51-2] A transição é gravada com `role='assistant'` +
 * `metadata: { is_transition: true, broker_id }` — não `role='broker'` nem um
 * novo role. Assim ela aparece naturalmente no chat como mensagem da Nicole/IA
 * e NÃO conta como interação humana no `brokerSentRecently` do cron followup.
 *
 * Padrões reusados:
 *  - Função pura sem imports `@web/*`/Supabase: mesmo motivo de
 *    `dispatch-broker-message.ts` (alias `@web/*` não resolve no vitest).
 */

/** Fallback gracioso quando `users.name` do corretor está ausente/vazio. */
export const BROKER_NAME_FALLBACK = "um corretor da equipe Trifold"

/**
 * Monta o texto da mensagem de transição.
 *
 * - Com `leadName`: `"Olá {leadName}! Sou {brokerName}, da equipe Trifold..."`
 * - Sem `leadName` (null/vazio): omite a saudação com nome.
 * - `brokerName` ausente/vazio → fallback gracioso ("um corretor da equipe Trifold").
 */
export function buildTransitionText(
  leadName: string | null | undefined,
  brokerName: string | null | undefined
): string {
  const broker = normalizeName(brokerName) ?? BROKER_NAME_FALLBACK
  const lead = normalizeName(leadName)

  return lead
    ? `Olá ${lead}! Sou ${broker}, da equipe Trifold. Estou aqui para continuar te ajudando. 😊`
    : `Olá! Sou ${broker}, da equipe Trifold. Estou aqui para continuar te ajudando. 😊`
}

/**
 * Decide se a mensagem de transição deve ser enviada (AC1/AC3).
 *
 * É a 1ª mensagem do corretor — e portanto a transição deve ser enviada —
 * quando NÃO existe nenhuma mensagem `role='broker'` na conversa antes do
 * insert atual. O route passa o resultado da consulta `messages WHERE
 * conversation_id=X AND role='broker' LIMIT 1`: se nenhuma linha existe
 * (`null`/`undefined`), é a primeira; caso contrário, pula a transição.
 *
 * A transição em si é gravada com `role='assistant'` (não `'broker'`), logo
 * NÃO interfere nesta verificação em mensagens subsequentes — garantindo
 * idempotência (a transição nunca se repete na mesma conversa).
 */
export function shouldSendTransition(
  existingBrokerMessage: { id: string } | null | undefined
): boolean {
  return !existingBrokerMessage
}

/** Retorna o nome com trim, ou `null` se nulo/vazio após trim. */
function normalizeName(name: string | null | undefined): string | null {
  if (typeof name !== "string") return null
  const trimmed = name.trim()
  return trimmed.length > 0 ? trimmed : null
}
