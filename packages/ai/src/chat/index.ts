export {
  processMessage,
  processMessageWithMetadata,
  hasConfirmedDay,
  type ProcessMessageParams,
  type ProcessMessageResult,
  type MediaBlock,
  type PipelineEvent,
} from "./pipeline"

/**
 * Story 87-5 (AC7) — UM CARREGADOR, NÃO DOIS. O cron `enrich-leads` vive em
 * `packages/web` e reimplementava o mesmo `.in("role", …)`; a partir daqui ele
 * consome a MESMA função, com a MESMA normalização. Se um dia voltar a existir
 * uma segunda lista de papéis de histórico, a regra está aplicada pela metade —
 * que é exatamente a lição da 75-268.
 */
export {
  loadConversationHistory,
  toAnthropicHistory,
  prefixarFalaDeCorretor,
  rotuloDeCorretor,
  temFalaDeCorretor,
  primeiroNome,
  ROLES_DE_HISTORICO,
  ROTULO_CORRETOR_PREFIXO,
  type ConversationRole,
  type ConversationMessage,
  type HistoricoCarregado,
} from "./conversation-history"
