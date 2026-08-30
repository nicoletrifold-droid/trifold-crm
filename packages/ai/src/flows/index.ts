export { identifyProperty, identifyPropertyUnique } from "./identify-property"
export {
  calculateQualificationScore,
  getNextQualificationStep,
  extractCollectedData,
  extractVisitConfirmation,
} from "./qualification"
// Story 87-4 — o estado de agenda com âncora temporal, procedência e TTL. Público
// em `@trifold/ai` porque o cron `enrich-leads` (packages/web) precisa da lista de
// chaves legadas para filtrar o merge do Haiku — ver AC8-b.
export {
  AGENDA_STATE_KEY,
  LEGACY_AGENDA_KEYS,
  TTL_AGENDA_STATE_HORAS,
  buildAgendaState,
  isAgendaStateExpired,
  readAgendaState,
  writeAgendaState,
  stripLegacyAgendaKeys,
  isPendencia,
  omitAgendaKeys,
  omitLegacyAgendaKeys,
  hasAgendaFact,
} from "./agenda-state"
export type { AgendaState, FonteAgenda } from "./agenda-state"
export { checkYardenGate } from "./yarden-gate"
export { shouldHandoff, generateHandoffSummary, isNonLeadContact } from "./handoff"
export { classifyContactIntent, parseContactClassification } from "./classify-contact"
export type { ContactClassification, ContactCategory } from "./classify-contact"
export { guardStageForAssignedLead } from "./stage-rules"
export { detectAppointmentIntent } from "./detect-appointment"
// Story 87-3 — a reconciliação fala × banco consome a `detectAffirmedSlot`; ela
// saiu de `chat/pipeline.ts` para cá (AC7) e passa a ser pública em `@trifold/ai`.
export { detectAffirmedSlot } from "./visit-slot"
// Story 87-6 — `diaBrt` passa a ser público: o `dedupe_key` do
// `NICOLE_LASTRO_DIARIO` é "um por dia BRT", e a convenção de dia tem de ser
// EXATAMENTE a do relatório. Reimplementá-la no `packages/web` criaria duas
// definições de "dia" que divergem no fuso — e o dedupe evaporaria por 3 horas.
export { classificarFala, reconciliarAgenda, diaBrt, JANELA_MESMO_TURNO_MIN, JANELA_CLASSIFICACAO_MIN, JANELA_RELATORIO_MIN, PADROES_LIGACAO } from "./agenda-reconcile"
export type { Balde, Descarte, ClassificacaoFala, LinhaRelatorio, RelatorioLastro, AppointmentDoLead } from "./agenda-reconcile"
export { updateLeadMemory, atualizarResumoComLastro, EVENTO_RESUMO_SEM_LASTRO } from "./lead-memory"
export type { EventoDeResumo, OrigemEscritaResumo, ResultadoEscritaResumo } from "./lead-memory"
// Story 87-7 — o guarda de escrita do `ai_summary`. Público em `@trifold/ai`
// porque o cron `enrich-leads` (packages/web) é o SEGUNDO escritor do mesmo
// campo — 92,5 % da população — e tem de usar EXATAMENTE a mesma regra (AC6).
export {
  analisarAfirmacaoDeVisita,
  classificarResumo,
  renderFatoDeAgenda,
  carregarAppointmentsDoLead,
  citacaoCurta,
  REGRAS_FATO_DE_AGENDA,
  JANELA_APPOINTMENTS_DIAS,
  LIMITE_APPOINTMENTS,
  CITACAO_MAX,
} from "./summary-grounding"
export type {
  AnaliseAfirmacaoVisita,
  ClassificacaoResumo,
  VeredictoResumo,
  AppointmentDoResumo,
} from "./summary-grounding"
export { generatePostVisitMessage } from "./post-visit-followup"
export { enrichLeadFromConversation, parseEnrichmentResponse, mapExtractedDataToLeadFields, PERFIL_LEAD_FIELDS, stripAlreadyFilledPerfil, stripManualInterestLevel } from "./haiku-enrichment"
export { analyzeLeadBehavior, parseBehaviorAnalysis } from "./behavior-analysis"
export type { BehaviorAnalysisResult, BehaviorAnalysisInput, BehaviorChronologyEvent } from "./behavior-analysis"
export { reviewOutgoingMessage, parseMessageReview, isReviewEligible } from "./message-review"
export type { MessageReviewResult } from "./message-review"
export { generateMarketingSuggestions, parseMarketingSuggestions } from "./marketing-suggestions"
export { generateMarketingPostFromRequest, parseMarketingPostRequest } from "./marketing-post-request"
export { improveMarketingRequest } from "./marketing-request-improve"
export type { ImproveMarketingRequestInput } from "./marketing-request-improve"
export type { MarketingPostRequestInput, MarketingPostRequestResult, MarketingPostFormato } from "./marketing-post-request"
export type {
  MarketingSuggestionsInput,
  MarketingPostSuggestion,
  CreativePerformanceRow,
  CampaignSummary,
  PropertyOption,
  BrandKnowledge,
} from "./marketing-suggestions"
export { interestLevelFromScore, type InterestLevel } from "./interest-level"
export { lerRespostasDoFormulario, validarLeitura, type RespostaAberta, type LeituraDoFormulario } from "./form-reading"
export {
  isCoachEligible,
  detectObjection,
  draftCoachReply,
  parseObjectionDetection,
  parseCoachDraft,
} from "./live-coach"
export type { ObjecaoTipo, Confianca, ObjectionDetection, CoachDraft } from "./live-coach"
// Story 87-20 — a trava de loop bot-a-bot. Pública em `@trifold/ai` porque o webhook
// do WhatsApp (packages/web) precisa de `LOOP_BOT_HANDOFF_REASON` para NÃO reativar
// a Nicole sozinha em 24h numa conversa contida por loop (AC14). Reimplementar a
// string lá criaria duas definições do mesmo motivo, que divergem no primeiro typo.
export {
  LOOP_BOT_HANDOFF_REASON,
  LOOP_CLOSING_MAX_SENDS,
  LOOP_CLOSING_WINDOW_MIN,
  LOOP_COUNT_MAX,
  LOOP_COUNT_WINDOW_MIN,
  LOOP_REPEAT_MAX_SENDS,
  LOOP_REPEAT_WINDOW_MIN,
  PADROES_DE_ENCERRAMENTO,
  contarEnviosNaJanela,
  detectarLoopDeConteudo,
  detectarLoopDeEncerramento,
  detectarLoopPorContagem,
  ehMensagemDeEncerramento,
} from "./loop-breaker"
export type { MensagemRecente } from "./loop-breaker"
