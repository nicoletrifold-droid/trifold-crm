import type { SupabaseClient } from "@supabase/supabase-js"

type ImageMimeType = "image/jpeg" | "image/png" | "image/gif" | "image/webp"

function normalizeImageMimeType(mime: string): ImageMimeType {
  const map: Record<string, ImageMimeType> = {
    "image/jpg": "image/jpeg",
    "image/jpeg": "image/jpeg",
    "image/png": "image/png",
    "image/gif": "image/gif",
    "image/webp": "image/webp",
  }
  return map[mime.toLowerCase()] ?? "image/jpeg"
}
import type Anthropic from "@anthropic-ai/sdk"
import { searchKnowledge } from "../rag/search"
import { buildContextFromRAG } from "../rag/context-builder"
import {
  identifyProperty,
  identifyPropertyUnique,
  calculateQualificationScore,
  getNextQualificationStep,
  extractCollectedData,
  extractVisitConfirmation,
  checkYardenGate,
  shouldHandoff,
  generateHandoffSummary,
  atualizarResumoComLastro,
  guardStageForAssignedLead,
  stripManualInterestLevel,
  interestLevelFromScore,
} from "../flows"
import { extractFactsFromMessage } from "../flows/memory-extraction"
import { deveReengajarNoShow } from "../flows/no-show-reengage"
import { podeGravarNomeDoLead } from "../flows/qualification"
import { ehPedidoDePrecoDoLead } from "../flows/handoff"
import { evaluateSlot, dayPartsToIso, isoToDayParts, checkSlotAvailability, resolveVisitSlotParts, detectCancelIntent, detectRescheduleIntent, dayPartsFromUtc, parsePeriodParts, freeSlotsInPeriod, slotToUtc, detectAffirmedSlot, VISIT_DURATION_MIN } from "../flows/visit-slot"
import type { DayParts, DayPeriod } from "../flows/visit-slot"
import { readAgendaState, writeAgendaState, stripLegacyAgendaKeys, buildAgendaState, isPendencia } from "../flows/agenda-state"
import type { AgendaState } from "../flows/agenda-state"
// Story 87-20 — a trava de loop bot-a-bot. As três funções são PURAS; quem carrega as
// mensagens é `carregarMensagensRecentesDaNicole`, logo abaixo.
import {
  LOOP_BOT_HANDOFF_REASON,
  LOOP_COUNT_WINDOW_MIN,
  LOOP_REPEAT_WINDOW_MIN,
  contarEnviosNaJanela,
  detectarLoopDeConteudo,
  detectarLoopDeEncerramento,
  detectarLoopPorContagem,
} from "../flows/loop-breaker"
import type { MensagemRecente } from "../flows/loop-breaker"
import { supportsSampling, textoDaResposta, ANTHROPIC_MODELS } from "../client/anthropic"
import { loadMemoryContext } from "../memory/loader"
import { processConversationTurn } from "../memory/writer"
import { buildSystemPrompt as buildPromptFromCode, OFF_HOURS_PROMPT } from "../prompts"
import type { DbPromptOverrides } from "../prompts"
import { isBusinessHours } from "../utils/business-hours"
import {
  loadConversationHistory,
  toAnthropicHistory,
  temFalaDeCorretor,
} from "./conversation-history"
import type { ConversationMessage } from "./conversation-history"
import { PERDIDO_STAGE_IDS, advanceToVisitaAgendada } from "@trifold/shared"

/**
 * Validates that a visit_availability string contains a day reference,
 * not just a time. Uses word boundaries to avoid false positives
 * like "segunda opção" or "próximo passo".
 */
export function hasConfirmedDay(availability: unknown): boolean {
  if (!availability || typeof availability !== "string") return false
  const lower = availability.toLowerCase()
  const patterns = [
    /\bs[aá]bado\b/, /\bdomingo\b/,
    /\bsegunda[-\s]?feira/, /\bter[cç]a[-\s]?feira/, /\bquarta[-\s]?feira/,
    /\bquinta[-\s]?feira/, /\bsexta[-\s]?feira/,
    /\bamanh[aã]/, /\bhoje\b/, /\bdepois de amanh/,
    /\bsemana que vem\b/,
    /\bpr[oó]xim[oa]\s+(?:semana|s[aá]bado|domingo|segunda|ter[cç]a|quarta|quinta|sexta)/,
    /\b\d{1,2}\/\d{1,2}\b/,
    /\bquero\s+(?:visitar|conhecer|ir)\b/,
    /\bposso\s+(?:ir|visitar|passar)\b/,
    /\bvou\s+(?:passar|a[ií])/,
  ]
  return patterns.some((p) => p.test(lower))
}

/**
 * Story 75-268 — a última fala da Nicole tratou de visita? Substitui a aposta
 * frágil de `VISIT_INVITE_PATTERNS` (6 regex tentando adivinhar, pela redação, a
 * intenção que ela própria acabou de ter). No incidente da Sueli ela escreveu
 * *"Qual o melhor dia e período pra você vir?"* e nenhuma das 6 casou — a regex
 * `qual.*dia.*melhor pra voc` exige "dia" ANTES de "melhor".
 */
const NICOLE_TALKED_VISIT_RE =
  /\bvisita\b|\bvisitar\b|\bvisitinha\b|\bdecorado\b|\bagendar\b|\bagendamos\b|\bque dia\b|\bqual dia\b|\bmelhor dia\b|\bqual (?:o )?hor[áa]rio\b|\bque hor[áa]rio\b|\bque horas\b|\bvir conhecer\b|\bconhecer pessoalmente\b|\bhor[áa]rios? (?:livres?|dispon[íi]ve[li]s?)\b/i

/**
 * Story 75-268 — o turno entra no MODO AGENDAMENTO (bloco determinístico de
 * visita: parser + agenda interna + bloco `[SISTEMA]`)?
 *
 * Antes dependia só de `visit_proposed || visit_availability`, e os dois falharam
 * no mesmo diálogo: `visit_proposed` porque a fala da Nicole não casou nenhuma das
 * 6 regex, e `visit_availability` porque a lista de keywords exige "sexta-feira"
 * com hífen — "Sexta a tarde" não casa. Sem o bloco, a Nicole improvisou o
 * expediente ("sexta à tarde seria após as 18h") e a visita nunca foi gravada.
 *
 * Ligar o modo é BARATO e seguro: se nada de dia/hora/período for entendido na
 * mensagem, nenhum bloco `[SISTEMA]` é injetado e o turno segue igual.
 */
export function isVisitSchedulingMode(input: {
  visitProposed?: boolean | null
  hasVisitAvailability?: boolean
  /** Já existe dia/hora pendente de um turno anterior (nós perguntamos algo). */
  hasPendingSlot?: boolean
  lastAssistantMessage?: string | null
}): boolean {
  if (input.visitProposed) return true
  if (input.hasVisitAvailability) return true
  if (input.hasPendingSlot) return true
  return NICOLE_TALKED_VISIT_RE.test(input.lastAssistantMessage ?? "")
}

/**
 * Story 75-245 — a Nicole afirmou um dia+horário diferente do que o sistema
 * autorizou neste turno? Devolve o horário que ela afirmou (para logar), ou null.
 *
 * Puro e conservador: só olha AFIRMAÇÃO de dia+hora único. Quando o texto é
 * ambíguo (ela oferecendo "8h ou 11h", ou citando o expediente) devolve null —
 * a guarda existe para pegar invenção, não para brigar com oferta de opções.
 */
export function detectSlotMismatch(input: {
  assistantMessage: string
  authorizedSlotUtc: Date | null
  now: Date
}): Date | null {
  const { assistantMessage, authorizedSlotUtc, now } = input
  if (!authorizedSlotUtc) return null
  const saidUtc = detectAffirmedSlot({ assistantMessage, now })
  if (!saidUtc) return null
  const differs = Math.abs(saidUtc.getTime() - authorizedSlotUtc.getTime()) > 30 * 60_000
  return differs ? saidUtc : null
}

/**
 * Story 87-3 — `detectAffirmedSlot` mudou de casa para `flows/visit-slot.ts` (onde
 * já moram as três dependências dela) e continua re-exportada daqui: o módulo de
 * reconciliação (`flows/agenda-reconcile.ts`) precisa dela, e importá-la de
 * `chat/pipeline` criaria o ciclo `pipeline → flows/index → agenda-reconcile →
 * pipeline`. O corpo da função não mudou uma linha.
 */
export { detectAffirmedSlot } from "../flows/visit-slot"

/**
 * Story 75-279 — remove blocos `[SISTEMA: …]` da fala antes de qualquer uso.
 *
 * O bloco é protocolo INTERNO: o pipeline o injeta na mensagem do usuário para
 * dizer à Nicole o que o sistema autorizou. Ela nunca deveria reproduzi-lo — mas
 * em 06/08 ela inventou um (`[SISTEMA: horário 11h do sábado 08/08 — LIVRE]`) e,
 * como não havia higienização em lugar nenhum, o texto foi enviado à cliente no
 * WhatsApp e gravado na conversa.
 *
 * Roda UMA vez, logo depois de extrair a resposta, porque `assistantMessage`
 * alimenta seis caminhos (guarda de horário, detecção de convite, extração de
 * dados, histórico, gravação e retorno). Higienizar só na saída deixaria o
 * vazamento gravado e poluiria a extração.
 */
/**
 * Story 75-279 — fala de reserva quando a higienização esvazia a resposta.
 * Neutra de propósito: não afirma dia, horário nem disponibilidade.
 */
export const SANITIZED_EMPTY_FALLBACK =
  "Desculpa, tive um probleminha aqui. Pode repetir, por favor?"

/**
 * Story 87-5 — o rótulo do corretor é a SEGUNDA marcação interna que o modelo
 * pode reproduzir, e o gatilho de rollback desta story é literalmente "o rótulo
 * [CORRETOR HUMANO aparecendo em qualquer mensagem enviada ao lead". A instrução
 * do prompt (`CONTEXTO_FALA_DE_CORRETOR`) é a primeira linha de defesa; esta é a
 * segunda, e é a única que não depende de o modelo obedecer. Mesma mecânica do
 * `[SISTEMA` — subtração de texto interno na saída, nenhum caminho novo.
 */
const MARCACOES_INTERNAS = /\[(SISTEMA|CORRETOR HUMANO)/i

export function stripSystemBlocks(text: string): { text: string; stripped: boolean } {
  if (!MARCACOES_INTERNAS.test(text)) return { text, stripped: false }
  const cleaned = text
    // Bloco fechado, inclusive quebrando linha ("[^\]]" casa \n).
    // Sem `\b` depois de SISTEMA de propósito: a variante que o modelo inventa
    // não é previsível ("[SISTEMAS: …]"), e `[SISTEMA` nunca é texto legítimo
    // para o cliente — deixar passar por um caractere é o pior dos dois erros.
    .replace(/\[SISTEMA[^\]]*\]/gi, "")
    // Bloco que o modelo não fechou: até o fim da linha.
    .replace(/\[SISTEMA[^\n]*/gi, "")
    // O rótulo do corretor: fechado e não-fechado, mesma regra.
    .replace(/\[CORRETOR HUMANO[^\]]*\]:?/gi, "")
    .replace(/\[CORRETOR HUMANO[^\n]*/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  // `stripped` sai da comparação, não da suspeita: o evento de vazamento só é
  // emitido quando algo saiu de fato.
  return { text: cleaned, stripped: cleaned !== text }
}

/**
 * ADR-001 guard — pipeline may only set the lead owner when the lead has no owner yet.
 *
 * @param brokerId      broker the pipeline intends to assign
 * @param currentOwnerId  the lead's current owner (leads.assigned_broker_id) before the update
 * @returns true when the pipeline is allowed to set the lead owner
 */
export function shouldAssignPipelineBroker(
  propertyBrokerId: string | null | undefined,
  currentOwnerId: string | null | undefined
): boolean {
  return Boolean(propertyBrokerId) && !currentOwnerId
}

/**
 * Story 51-7 (AC5) — resolve the notification recipient for APPOINTMENT_CREATED.
 *
 * The notification is decoupled from lead ownership: when the lead already has
 * an owner (the guard kept it), the OWNER is notified — not the property
 * specialist. When the lead had no owner, the property broker (who just became
 * the owner) is the recipient. Returns null when neither exists (no notification).
 */
export function resolveNotificationBrokerUserId(
  propertyBrokerId: string | null | undefined,
  currentOwnerId: string | null | undefined
): string | null {
  return currentOwnerId ?? propertyBrokerId ?? null
}

/**
 * Story 59-1 (AC1, AC4, AC5) — build the no-reintro context block.
 * When the conversation already has at least one assistant message, Nicole must
 * not introduce herself again. Returned string goes into `dynamicSuffix` only —
 * never into the static cached block.
 *
 * Story 87-8 (AC4) — `jaFalouForaDaJanela` é o segundo sinal, e ele existe por
 * causa da cauda: numa conversa longa cuja cauda-20 é toda do lead,
 * `history.some(role==='assistant')` dá `false` e a Nicole **voltaria a se
 * apresentar** — regressão direta desta mesma story 59-1. Hoje são 0 conversas
 * nessa condição (medido sobre todo o histórico), mas é estrutural.
 *
 * A direção é sempre RESTRITIVA: o sinal só SOMA ao `some()`, então só pode
 * suprimir uma apresentação, nunca provocar uma. Suprimir apresentação indevida
 * não causa dano; produzir uma causa constrangimento.
 *
 * Story 87-5 (AC4) — passa a contar `assistant` **OU** `broker`: a pergunta é
 * "o NOSSO lado já falou com este lead?", não "a Nicole já falou?". Um lead que
 * trocou 20 mensagens com o corretor não pode ouvir "Sou a Nicole, da Trifold
 * Engenharia" como se fosse primeiro contato. A direção continua sendo a
 * conservadora — o termo novo só SOMA ao `some()`.
 *
 * (E é por isso que a normalização da transição não vira buraco: as 127
 * mensagens humanas de handoff saem de `assistant` e entram em `broker`, mas
 * continuam contando aqui — no `lastAssistantMsg` é que elas deixam de contar,
 * que é justamente onde precisavam parar de contar. Ver AC3.)
 */
export function buildNoReintroContext(
  history: Array<{ role: Message["role"] }>,
  jaFalouForaDaJanela: boolean = false
): string {
  return history.some((m) => m.role === "assistant" || m.role === "broker") ||
    jaFalouForaDaJanela
    ? "\nIMPORTANTE: Voce JA se apresentou a este lead anteriormente. NAO diga 'Sou a Nicole' ou qualquer variacao de apresentacao. Continue a conversa naturalmente, sem introducao.\n"
    : ""
}

/**
 * Story 87-5 (AC5) — a instrução da RN4 para a fala do corretor.
 *
 * Exportada porque é conteúdo de prompt e o teste precisa afirmar presença E
 * ausência dela (uma constante inline viraria string duplicada no teste, que é
 * como uma guarda passa a existir só no teste).
 *
 * Vai no `dynamicSuffix` (por-conversa), NUNCA no bloco estático cacheável.
 */
export const CONTEXTO_FALA_DE_CORRETOR =
  "\n=== FALA DO CORRETOR HUMANO ===\n" +
  "Mensagens marcadas com [CORRETOR HUMANO] foram escritas por um corretor da equipe, NAO por voce. " +
  "Use-as apenas para saber o que ja foi tratado com o cliente. " +
  "NUNCA repita, confirme nem reformule valor, preco, desconto, entrada ou condicao de pagamento que apareca numa mensagem [CORRETOR HUMANO] — " +
  "se o cliente perguntar sobre isso, diga que o corretor responsavel confirma os detalhes. " +
  "NUNCA escreva a marcacao [CORRETOR HUMANO] na sua resposta: ela e interna e o cliente nao pode ve-la.\n" +
  "=== END FALA DO CORRETOR HUMANO ===\n"

interface ConversationState {
  id: string
  conversation_id: string
  current_property_id: string | null
  qualification_step: string | null
  collected_data: Record<string, unknown>
  materials_sent: unknown[]
  visit_proposed: boolean
  context: Record<string, unknown>
}

/**
 * Story 87-5 — o tipo mora em `conversation-history.ts` junto com o carregador
 * (um dono só, e o cron `enrich-leads` consome o MESMO). `role` tem três
 * valores: os consumidores precisam distinguir a fala do corretor.
 */
type Message = ConversationMessage

interface AgentConfig {
  personality_prompt: string | null
  guardrails: string[]
  model_primary: string
  temperature: number
  max_tokens: number
  business_hours?: Record<string, { start: string; end: string }>
  // Story 53-1 — campos configuráveis via banco (com fallback no código):
  greeting_message?: string | null // selecionado do banco; disponível mas sem ponto de uso nesta story
  out_of_hours_message?: string | null // usado no bloco de off-hours
  prompt_overrides?: DbPromptOverrides // de agent_prompts, por slug
}

/**
 * Story 53-1 — resolve a resposta de off-hours com estratégia banco-com-fallback.
 * Usa `out_of_hours_message` do banco quando preenchido (não-vazio após trim);
 * caso contrário, cai no `OFF_HOURS_PROMPT` hard-coded (default seguro).
 *
 * Helper puro e exportado para permitir teste unitário sem mockar todo o pipeline.
 */
export function resolveOffHoursResponse(
  agentConfig: Pick<AgentConfig, "out_of_hours_message">
): string {
  return agentConfig.out_of_hours_message?.trim() || OFF_HOURS_PROMPT
}

interface Property {
  id: string
  name: string
  slug: string
  status?: string
  address?: string
  neighborhood?: string
  city?: string
  state?: string
  concept?: string
  description?: string
  amenities?: string[]
  differentials?: string[]
  delivery_date?: string
  total_units?: number
  total_floors?: number
  units_per_floor?: number
  commercial_rules?: Record<string, unknown>
  faq?: Array<{ question: string; answer: string }>
  typologies?: Array<{
    name: string
    private_area_m2: number
    bedrooms: number
    suites: number
    has_balcony: boolean
    balcony_bbq: boolean
  }>
  available_units?: number
  reserved_units?: number
  sold_units?: number
}

export interface MediaBlock {
  type: "image" | "document"
  base64: string
  mimeType: string
}

export interface PipelineEvent {
  level: "error" | "warn" | "info"
  category: string
  event_type: string
  message: string
  metadata?: Record<string, unknown>
}

/** Cria um evento no Google Calendar e devolve o event id (ou null). Injetado pela
 *  camada web (mantém packages/ai desacoplado de packages/web). Story 73-1. */
export interface CalendarEventInput {
  title: string
  description?: string
  startAt: Date
  endAt: Date
  /**
   * Story 75-275 — `attendeeEmail` FOI REMOVIDO daqui de propósito. O calendário é conta
   * Gmail comum (sem Workspace), logo sem Domain-Wide Delegation, e service account sem
   * DWD não consegue convidar: o Google devolve 403 e derruba a criação do evento
   * INTEIRO. Como a função é fail-open, o efeito era um `null` silencioso — visita sem
   * espelho e ninguém sabendo. Não recolocar.
   */
  team?: "house" | "imob" | null
}
export type CreateCalendarEvent = (input: CalendarEventInput) => Promise<string | null>

export interface ProcessMessageParams {
  supabase: SupabaseClient
  anthropic: Anthropic
  conversationId: string
  message: string
  orgId: string
  mediaBlock?: MediaBlock
  onEvent?: (event: PipelineEvent) => void
  /** Opcional: empurra a visita criada pela Nicole para o Google Calendar. */
  createCalendarEvent?: CreateCalendarEvent
  /** Story 75-163 — remove um evento do Google Calendar (injetado pela web) — usado ao remarcar/cancelar. */
  deleteCalendarEvent?: (googleEventId: string) => Promise<void>
  /**
   * Story 75-157 — disponibilidade REAL de mídia neste turno, computada ANTES da
   * fala pelo caller (webhook) via `resolveSendableMedia`. Torna a fala honesta:
   * a Nicole só afirma que enviou quando `willSend` for true.
   */
  mediaContext?: MediaAvailability
}

/** Story 75-157 — sinal de disponibilidade de mídia passado ao prompt. */
export interface MediaAvailability {
  /** O lead pediu material neste turno. */
  requested: boolean
  /** Há material que SERÁ enviado agora (após dedup). */
  willSend: boolean
  /** Nome do empreendimento resolvido, se houver. */
  empreendimento?: string | null
  /**
   * Story 75-270 — títulos EXATOS do que sai neste turno. Sem isso a Nicole
   * embelezava: em 03/08 saiu 1 asset (Localização) e ela escreveu "já te mandei
   * aqui algumas fotos e a planta". Dizer o que é vale mais que proibir o resto.
   */
  materiais?: string[] | null
  /**
   * Motivo de não enviar, quando `willSend` é false.
   *
   * Story 75-270 — `property_pivot` existe só DEPOIS da fala (a reconciliação de
   * empreendimento roda com a resposta na mão), então `mediaContextLine` nunca o
   * recebe; está no union para os tipos das duas pontas não divergirem. Se algum
   * dia chegar aqui, cai no fallback genérico ("não diga que enviou").
   */
  reason?: "no_request" | "no_property" | "no_assets" | "none_selected" | "property_pivot" | null
}

/**
 * Story 75-157 — Monta a linha honesta de MATERIAL VISUAL para o CONVERSATION
 * CONTEXT (vem DEPOIS das guardrails, então prevalece por turno). Pura/testável.
 * Retorna `null` quando não há pedido de material (nada a instruir).
 */
export function mediaContextLine(mc: MediaAvailability | undefined): string | null {
  if (!mc || !mc.requested) return null
  const emp = mc.empreendimento ? ` do ${mc.empreendimento}` : ""
  if (mc.willSend) {
    // Story 75-270 — quando se sabe O QUE sai, dizer os títulos: a fala genérica
    // convidava o modelo a inflar ("algumas fotos e a planta" para 1 asset só).
    const lista = (mc.materiais ?? []).filter(Boolean)
    if (lista.length) {
      return `MATERIAL VISUAL: neste turno esta sendo enviado, junto com a sua resposta, EXATAMENTE isto${emp}: ${lista.join(", ")} (${lista.length} ${lista.length === 1 ? "arquivo" : "arquivos"}). Comente de forma curta e natural SO o que esta nessa lista — nao cite nenhum outro material, nao pluralize o que e unico e nao diga "fotos" se for um arquivo so.`
    }
    return `MATERIAL VISUAL: neste turno as imagens${emp} ESTAO SENDO ENVIADAS junto com a sua resposta. Comente de forma curta e natural que esta enviando (ex: "Te mandei aqui a planta e umas fotos, da uma olhada!").`
  }
  if (mc.reason === "none_selected") {
    return "MATERIAL VISUAL: o lead pediu material, mas as imagens que voce tem ja foram enviadas antes nesta conversa. NAO diga que esta enviando de novo; pergunte o que ele quer ver de diferente OU ofereca a visita ao decorado."
  }
  if (!mc.empreendimento || mc.reason === "no_property") {
    return "MATERIAL VISUAL: o lead pediu material, mas o empreendimento de interesse ainda NAO esta definido. NAO diga que enviou nem que esta enviando imagens. Pergunte de forma leve de qual empreendimento ele quer ver (nao repergunte se ja estiver claro na conversa)."
  }
  return `MATERIAL VISUAL: o lead pediu material${emp}, mas NAO ha esse material disponivel agora. NAO diga que enviou nem que esta enviando. Ofereca conhecer o decorado pessoalmente OU diga que a equipe vai enviar, com naturalidade.`
}

/**
 * Story 75-158 — Decide se e como persistir `leads.property_interest_id`, de
 * forma segura (política confirmada pelo Marcos 2026-07-16):
 *  - VAZIO hoje → preenche com a melhor identificação ÚNICA disponível: msg do
 *    lead, senão contexto recente da conversa, senão collectedData.
 *  - JÁ SETADO → só TROCA quando o PRÓPRIO lead nomeia, explicita e unicamente,
 *    outro empreendimento (troca real de interesse). Nunca faz clobber por
 *    contexto — alinha com os demais writers (guard "só se null").
 * Pura/testável. Retorna `null` quando não deve escrever.
 */
export function resolvePropertyInterestWrite(input: {
  currentPropertyId: string | null
  explicitFromLead: string | null // match ÚNICO na msg atual do lead
  contextPropertyId: string | null // match ÚNICO no contexto recente
  collectedPropertyId: string | null // fallback do collectedData
}): {
  propertyId: string
  origin: "lead_message" | "conversation_context" | "collected_data" | "lead_switch"
} | null {
  const { currentPropertyId, explicitFromLead, contextPropertyId, collectedPropertyId } = input
  if (!currentPropertyId) {
    if (explicitFromLead) return { propertyId: explicitFromLead, origin: "lead_message" }
    if (contextPropertyId) return { propertyId: contextPropertyId, origin: "conversation_context" }
    if (collectedPropertyId) return { propertyId: collectedPropertyId, origin: "collected_data" }
    return null
  }
  if (explicitFromLead && explicitFromLead !== currentPropertyId) {
    return { propertyId: explicitFromLead, origin: "lead_switch" }
  }
  return null
}

/** Story 87-20 — qual dos três sinais conteve o turno. */
export type TipoDeLoop = "conteudo_repetido" | "contagem_excessiva" | "encerramento"

export interface ProcessMessageResult {
  response: string
  handoff?: {
    trigger: boolean
    reason?: string
    summary?: string
  }
  /**
   * Story 87-20 — o turno foi contido por loop bot-a-bot: a fala NÃO foi enviada e
   * nenhum efeito colateral sobreviveu.
   *
   * Campo PRÓPRIO, e não reuso do `handoff` acima, de propósito. O `handoff` é
   * populado de verdade (`:1919-1929`, a partir de `handoffResult.trigger`) para um
   * propósito diferente — qualificação de lead pronta para o corretor. Hoje nenhum
   * caller o lê; no dia em que alguém ligar essa leitura, um turno contido por loop
   * seria interpretado como "lead qualificado". Um campo novo custa uma linha de tipo.
   *
   * `response: ""` sozinho seria uma sentinela in-band, indistinguível de uma geração
   * que veio vazia — é este campo que o webhook lê para gravar `NICOLE_LOOP_DETECTADO`
   * com `await` antes de responder.
   */
  bloqueadoPorLoop?: {
    tipo: TipoDeLoop
    ocorrencias: number
    conversationId: string
    leadId: string | null
  }
  qualificationScore: number
}

/**
 * Story 87-20 — as mensagens que a Nicole já enviou nesta conversa dentro da janela.
 *
 * Consulta DEDICADA e por TEMPO, não o `loadConversationHistory`: aquele é por
 * CONTAGEM (as 20 mais recentes) e está sob mudança ativa na Onda 1 deste epic —
 * a trava precisa de "os últimos 30 minutos", que é outra pergunta.
 *
 * ⚠️ **`metadata` PRECISA estar na projeção.** Sem ela, `metadata?.is_transition === true`
 * é `false` para toda linha, a exclusão da fala do corretor vira no-op silencioso e
 * NENHUM teste da função pura consegue perceber — a chamada existe, o argumento foi
 * neutralizado. É a mesma classe de defeito que já apareceu duas vezes nesta família
 * de stories. O carrasco vive em `pipeline-loop-breaker.test.ts`.
 */
export async function carregarMensagensRecentesDaNicole(
  supabase: SupabaseClient,
  conversationId: string,
  janelaMin: number,
  now: Date
): Promise<MensagemRecente[]> {
  const desde = new Date(now.getTime() - janelaMin * 60_000).toISOString()
  const { data, error } = await supabase
    .from("messages")
    .select("content, created_at, metadata")
    .eq("conversation_id", conversationId)
    .eq("role", "assistant")
    .gte("created_at", desde)
    .order("created_at", { ascending: true })

  // Fail-OPEN só aqui: se a leitura falhar, a trava não arma — mas a conversa segue.
  // Uma lista vazia nunca produz bloqueio (os três sinais precisam de ≥2 anteriores).
  if (error || !data) return []

  return (data as Array<Record<string, unknown>>).map((m) => ({
    content: String(m.content ?? ""),
    created_at: String(m.created_at ?? ""),
    isTransition:
      (m.metadata as Record<string, unknown> | null | undefined)?.is_transition === true,
  }))
}

/**
 * Main chat processing pipeline for Nicole AI.
 *
 * Steps:
 * 1. Load conversation state from DB
 * 2. Load agent config and check business hours
 * 3. Load conversation history (last 20 messages)
 * 4. Search RAG for relevant context
 * 5. Identify property from message
 * 6. Check Yarden gate if property identified
 * 7. Build system prompt (personality + guardrails + qualification + RAG context + flow context)
 * 8. Call Claude API with messages
 * 9. Extract collected data from AI response
 * 10. Calculate qualification score and check handoff
 * 11. Save assistant response to messages table
 * 12. Update conversation state with new collected data
 * 13. Return response with metadata
 */
/** Formata um instante UTC como "quinta-feira, 18 de junho às 15:00" (BRT). */
function formatBrtDateTime(d: Date): string {
  const dia = d.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long",
  })
  const hora = d.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit",
  })
  return `${dia} às ${hora}`
}

export async function processMessage(
  params: ProcessMessageParams
): Promise<string> {
  const result = await processMessageWithMetadata(params)
  return result.response
}

export async function processMessageWithMetadata(
  params: ProcessMessageParams
): Promise<ProcessMessageResult> {
  const { supabase, anthropic, conversationId, message, orgId } = params
  const emit = params.onEvent ?? (() => {})
  const createCalendarEvent = params.createCalendarEvent
  const deleteCalendarEvent = params.deleteCalendarEvent

  // 1. Load conversation state
  const state = await loadConversationState(supabase, conversationId)
  const collectedData: Record<string, unknown> = state?.collected_data ?? {}

  // 2. Load agent config and check business hours
  const agentConfig = await loadAgentConfig(supabase, orgId)

  if (agentConfig.business_hours) {
    const withinHours = isBusinessHours({
      business_hours: agentConfig.business_hours,
    })
    if (!withinHours) {
      // Story 53-1 — banco com fallback: usa out_of_hours_message do banco
      // quando preenchido; caso contrário, OFF_HOURS_PROMPT hard-coded.
      const offHoursResponse = resolveOffHoursResponse(agentConfig)

      await saveMessages(supabase, conversationId, message, offHoursResponse)
      await updateConversationTimestamp(supabase, conversationId)

      return {
        response: offHoursResponse,
        qualificationScore: calculateQualificationScore(collectedData),
      }
    }
  }

  // 3. Load conversation history — Story 87-8: a CAUDA (as 20 MAIS RECENTES),
  //    em ordem cronológica. Era a cabeça, e nunca funcionou.
  const historico = await loadConversationHistory(supabase, conversationId)
  const history = historico.messages

  // 4. Search RAG for relevant context
  let ragContext = ""
  try {
    const ragResults = await searchKnowledge(
      supabase,
      message,
      orgId,
      state?.current_property_id ?? undefined
    )
    ragContext = buildContextFromRAG(ragResults)
    emit({ level: "info", category: "ai", event_type: "RAG_SUCCESS", message: `RAG returned ${ragResults.length} results`, metadata: { results_count: ragResults.length } })
  } catch (ragError) {
    console.error("[RAG_FALLBACK] Search failed, continuing without context:", ragError)
    emit({ level: "warn", category: "ai", event_type: "RAG_FALLBACK", message: `RAG search failed: ${ragError instanceof Error ? ragError.message : String(ragError)}`, metadata: { error: String(ragError) } })
  }

  // 5. Identify property from message
  const properties = await loadProperties(supabase, orgId)
  const identifiedPropertyId = identifyProperty(
    message,
    collectedData,
    properties
  )

  if (identifiedPropertyId) {
    const prop = properties.find((p) => p.id === identifiedPropertyId)
    emit({ level: "info", category: "ai", event_type: "PROPERTY_IDENTIFIED", message: `Property identified: ${prop?.name ?? identifiedPropertyId}`, metadata: { property_id: identifiedPropertyId, property_name: prop?.name } })
  }

  // 6. Check Yarden gate if property identified
  let yardenGateContext = ""
  if (identifiedPropertyId) {
    const property = properties.find((p) => p.id === identifiedPropertyId)
    if (property) {
      const gateResult = checkYardenGate(property.slug, collectedData)
      if (gateResult.blocked) {
        yardenGateContext = `\n\n=== YARDEN GATE ===\n${gateResult.reason}\nSugestao: ${gateResult.suggestion}\n=== END YARDEN GATE ===`
      }
    }
  }

  // 6.3 Get conversation info (needed for lead memory and sync)
  const { data: conversation } = await supabase
    .from("conversations")
    .select("lead_id, org_id")
    .eq("id", conversationId)
    .single()

  // ─── Story 87-20 · TRAVA DE LOOP BOT-A-BOT ────────────────────────────────
  //
  // O ponto é este e não outro. Entre o início desta função (:537) e o `return`
  // antecipado dos Sinais A/C (perto do `detectSlotMismatch`) NÃO existe nenhuma
  // escrita — as duas únicas (`saveMessages`/`updateConversationTimestamp`) estão no
  // ramo de fora-de-horário, que tem `return` próprio antes de chegar aqui. Depois
  // dali começam `createCalendarEvent`, `emit(APPOINTMENT_CREATED)` (que dá push ao
  // corretor), quatro `activities.insert`, o avanço de estágio e o patch de `leads`.
  // Bloquear "antes do saveMessages" (:1829) deixaria visita marcada no Google
  // Calendar e corretor avisado por uma mensagem que o lead nunca recebeu.
  //
  // Por isso a contenção é um `return` ANTECIPADO e não uma flag consultada depois:
  // o `return` cobre as ~15 escritas da janela por construção; "marca a flag e pula"
  // cobriria as que alguém lembrou de listar.
  const loopBreakerLigado = (process.env.NICOLE_LOOP_BREAKER_OFF ?? "") !== "1"
  const agoraDoLoop = new Date()
  const recentesDaNicole = loopBreakerLigado
    ? await carregarMensagensRecentesDaNicole(
        supabase,
        conversationId,
        // A MAIOR das três janelas: uma consulta serve os três sinais.
        Math.max(LOOP_REPEAT_WINDOW_MIN, LOOP_COUNT_WINDOW_MIN),
        agoraDoLoop
      )
    : []

  /**
   * Contenção síncrona e AGUARDADA, no mesmo padrão das outras escritas diretas desta
   * função (`appointments`, `activities`, `lead_facts`) — não fire-and-forget.
   *
   * Os três campos são exatamente os que o handoff manual (`leads/[id]/handoff`) e o
   * handoff por resposta do corretor (`send-message`) já gravam: sem migration.
   *
   * NÃO chama `emit()` de propósito. O canal `emit` → `onEvent` → `logEvent` do
   * webhook é fire-and-forget, e no caminho bloqueado este evento é a ÚLTIMA escrita
   * antes do response — exatamente o caso que o docstring do `logEvent` alerta para
   * não usar (já custou um evento em produção). Quem grava é o webhook, com
   * `await logEventOnce`, lendo `bloqueadoPorLoop`.
   */
  const conterLoop = async (
    tipo: TipoDeLoop,
    ocorrencias: number
  ): Promise<ProcessMessageResult> => {
    await supabase
      .from("conversations")
      .update({
        is_ai_active: false,
        handoff_at: new Date().toISOString(),
        handoff_reason: LOOP_BOT_HANDOFF_REASON,
      })
      .eq("id", conversationId)

    return {
      response: "",
      bloqueadoPorLoop: {
        tipo,
        ocorrencias,
        conversationId,
        leadId: conversation?.lead_id ?? null,
      },
      qualificationScore: 0,
    }
  }

  // Sinal B (contagem) roda ANTES da chamada à Anthropic (AC15): ele não depende do
  // texto candidato, e numa conversa que já vai ser contida a geração é só custo.
  if (loopBreakerLigado && detectarLoopPorContagem({ recentes: recentesDaNicole, now: agoraDoLoop })) {
    return await conterLoop(
      "contagem_excessiva",
      contarEnviosNaJanela({
        recentes: recentesDaNicole,
        now: agoraDoLoop,
        janelaMin: LOOP_COUNT_WINDOW_MIN,
      })
    )
  }

  // Story 87-8 (AC7) — é a `M3` do epic: sem este evento, *"0 ocorrências de
  // cauda errada"* seria uma promessa; com ele vira uma consulta.
  // Sem conteúdo de mensagem e sem PII — só identificadores e timestamps (W0-2).
  if (historico.truncou) {
    emit({
      level: "info",
      category: "ai",
      event_type: "NICOLE_HISTORY_TRUNCATED",
      message: `Historico truncado em ${historico.messages.length} de ${historico.totalNaConversa ?? "?"} mensagens (cauda).`,
      metadata: {
        conversation_id: conversationId,
        lead_id: conversation?.lead_id ?? null,
        limite: historico.limite,
        total_na_conversa: historico.totalNaConversa,
        mais_antiga_carregada: historico.maisAntigaCarregada,
        mais_recente_carregada: historico.maisRecenteCarregada,
        ordem: "cauda",
      },
    })
  }

  // 6.5 Get current lead summary + stage for context
  let currentSummary: string | null = null
  let leadName: string | null = null
  let leadPhone: string | null = null
  let leadSource: string | null = null
  let leadQualStatus: string | null = null
  let leadUtmCampaign: string | null = null
  let leadUtmSource: string | null = null
  // Story 75-347 — a finalidade (moradia × investimento) e o prazo já existem no
  // banco (mig 154 / form do Meta, 75-114) e NUNCA chegavam à Nicole: ela repetia
  // uma pergunta que o lead já tinha respondido no formulário. Medido em 19/08:
  // 311 dos 1.826 leads de 90 dias tinham finalidade preenchida — e ela reperguntava
  // em todos.
  let leadFinalidade: string | null = null
  let leadPrazoCompra: string | null = null
  // Story 75-358 — a decisão de reengajar por no-show sai daqui, dos AGENDAMENTOS,
  // e não mais da etapa do lead. Ver `no-show-reengage.ts` para o porquê.
  let leadFaltouSemVoltar = false
  if (conversation?.lead_id) {
    const { data: leadData } = await supabase
      .from("leads")
      .select("ai_summary, name, phone, source, qualification_status, utm_source, utm_campaign, finalidade, prazo_compra")
      .eq("id", conversation.lead_id)
      .single()
    currentSummary = leadData?.ai_summary ?? null
    leadName = leadData?.name ?? null
    leadPhone = leadData?.phone ?? null
    leadSource = leadData?.source ?? null
    leadQualStatus = leadData?.qualification_status ?? null
    leadUtmCampaign = leadData?.utm_campaign ?? null
    leadUtmSource = leadData?.utm_source ?? null
    leadFinalidade = leadData?.finalidade ?? null
    leadPrazoCompra = leadData?.prazo_compra ?? null

    // Story 75-358 — os agendamentos do lead. Só os 5 mais recentes: a decisão
    // olha o último, e o `.order()` aqui é sobre `scheduled_at` (a data da visita),
    // não `created_at` — remarcação criada antes pode ter data depois.
    const { data: appts } = await supabase
      .from("appointments")
      .select("status, scheduled_at")
      .eq("lead_id", conversation.lead_id)
      // `nullsFirst: false` não é enfeite: em DESC o PostgREST põe NULL PRIMEIRO, e
      // um agendamento sem data ocuparia as vagas do `limit` empurrando os reais
      // para fora (mesma pegadinha de feedback-order-desc-nulls-first).
      .order("scheduled_at", { ascending: false, nullsFirst: false })
      .limit(5)
    leadFaltouSemVoltar = deveReengajarNoShow(appts ?? [])
  }

  // 7. Build system prompt with flow context + datetime + memory
  const qualificationStep = getNextQualificationStep(collectedData)
  const qualificationScore = calculateQualificationScore(collectedData)

  // Current datetime in Maringá timezone
  const now = new Date()
  const maringaDate = now.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", year: "numeric", month: "long", day: "numeric" })
  const maringaTime = now.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })
  const dateTimeContext = `\nDATA E HORA ATUAL: ${maringaDate}, ${maringaTime} (horario de Maringa-PR)\n`

  // Property live data context
  const propertyDataContext = buildPropertyDataContext(properties, identifiedPropertyId)

  // Lead memory context — Progressive Loading (MemPalace-inspired L1/L2/L3)
  let memoryContext = ""
  if (conversation?.lead_id) {
    try {
      const memCtx = await loadMemoryContext(supabase, conversation.lead_id, message, currentSummary)
      const parts = [memCtx.l1Snapshot, memCtx.l2TopicMemories, memCtx.l3DeepSearch].filter(Boolean)
      if (parts.length > 0) {
        memoryContext = `\n${parts.join("\n\n")}\n\nUse essas informacoes para personalizar o atendimento. Chame pelo nome, referencie o que ja conversaram.\n`
      }
    } catch {
      // Fallback to ai_summary if progressive loading fails
      memoryContext = currentSummary
        ? `\nMEMORIA DO LEAD (informacoes de conversas anteriores):\n${currentSummary}\n\nUse essas informacoes para personalizar o atendimento. Chame pelo nome, referencie o que ja conversaram.\n`
        : ""
    }
  }

  // Lead context — inject known fields so Nicole never re-asks them (Story 21.2)
  const leadContext = conversation?.lead_id
    ? buildLeadContext({
        name: leadName,
        source: leadSource,
        qualificationStatus: leadQualStatus,
        utmCampaign: leadUtmCampaign,
        utmSource: leadUtmSource,
        finalidade: leadFinalidade,
        prazoCompra: leadPrazoCompra,
      })
    : ""

  // No-Show context — empathetic re-engagement.
  //
  // 🔥 Story 75-358 — a condição era `leadStageId === STAGE_IDS.no_show`, e esse
  // UUID virou a etapa "Atendimento" em 08/06/2026 (renomeada na tela Pipeline).
  // O bloco passou a entrar para os 129 leads de Atendimento: em 20/08 os 4 de 4
  // que responderam ao cron ouviram "não conseguimos nos encontrar" sem ter uma
  // única linha em `appointments`. A condição agora é o FATO — o agendamento mais
  // recente do lead estar `no_show` — e a etapa saiu da conta de propósito, para
  // que renomear coluna não volte a fazer a Nicole mentir.
  const noShowContext = leadFaltouSemVoltar
    ? "\n=== NO-SHOW CONTEXT ===\nEste lead faltou a uma visita agendada anteriormente. Seja empatica, NAO culpe e NAO mencione \"falta\" ou \"nao compareceu\". Pergunte naturalmente se quer remarcar: algo como \"Vi que nao conseguimos nos encontrar, quer marcar outro dia?\". Se o lead mencionar um dia, agende normalmente.\n=== END NO-SHOW CONTEXT ===\n"
    : ""

  // No-reintro context — Story 59-1 (AC1, AC4, AC5)
  // Story 87-8 (AC4) — o 2º argumento é o que impede a cauda de fazer a Nicole
  // se reapresentar quando as 20 mensagens recentes são todas do lead.
  const noReintroContext = buildNoReintroContext(history, historico.nossoLadoFalouForaDaJanela)

  // Story 87-5 (AC5) — a RN4 aplicada à fala do corretor. Só entra quando HÁ
  // fala de corretor na janela: é contexto por-conversa, nunca bloco estático
  // cacheável. O corretor pode dizer valor fechado, desconto e condição de
  // pagamento; a Nicole NÃO pode. Sem isto, a fala dele chega à API como turno
  // anterior DELA MESMA (`role: "assistant"`, é o único papel que a API aceita)
  // e o modelo repete o número — foi o "entrada de 35 mil" do Odair na conversa
  // da Sandra que originou esta guarda.
  const corretorContext = temFalaDeCorretor(history) ? CONTEXTO_FALA_DE_CORRETOR : ""

  // Build the system prompt as Anthropic block array.
  //
  // - `staticBlocks` = blocos cacheáveis (8 segmentos estáticos com cache_control: ephemeral)
  //                    + bloco RAG opcional sem cache (vindo de buildPromptFromCode).
  // - `dynamicSuffix` = todos os contextos por-conversa (data/hora, property data,
  //   memória do lead, no-show, flow, yarden gate). Concatenados em UM bloco
  //   sem cache_control. Story 21.2 (lead context) deve ser incluída aqui.
  const staticBlocks = buildSystemPrompt(agentConfig, ragContext, state, emit, params.mediaContext)
  const dynamicSuffix =
    dateTimeContext +
    propertyDataContext +
    leadContext +
    memoryContext +
    noShowContext +
    noReintroContext +
    corretorContext +
    buildFlowContext(qualificationStep, qualificationScore, identifiedPropertyId) +
    yardenGateContext

  const systemBlocks: Anthropic.Messages.TextBlockParam[] =
    dynamicSuffix.trim().length > 0
      ? [...staticBlocks, { type: "text", text: dynamicSuffix }]
      : staticBlocks

  // 8. Build messages array and call Claude API
  const userContent: Anthropic.ContentBlockParam[] = []

  if (params.mediaBlock) {
    if (params.mediaBlock.type === "image") {
      userContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: normalizeImageMimeType(params.mediaBlock.mimeType),
          data: params.mediaBlock.base64,
        },
      })
    } else if (params.mediaBlock.type === "document") {
      userContent.push({
        type: "document",
        source: {
          type: "base64",
          media_type: params.mediaBlock.mimeType as "application/pdf",
          data: params.mediaBlock.base64,
        },
      })
    }
  }

  // Inject visit context directly into the message — only if relevant
  let messageWithContext = message
  // Story 73-1: slot pedido pelo cliente que está LIVRE e pode ser agendado neste turno.
  let bookableSlotUtc: Date | null = null
  // Story 75-163 — sinais de remarcação/cancelamento (mutação feita após a resposta).
  let rescheduleSlotUtc: Date | null = null
  let apptToReschedule: { id: string; googleEventId: string | null; fromWhen: string; brokerId: string | null } | null = null
  let apptToCancel: { id: string; googleEventId: string | null; when: string; brokerId: string | null } | null = null
  // Story 75-245 — slot que o SISTEMA autorizou neste turno (agendado, remarcado
  // ou o da visita já existente). Serve de verdade única para a guarda
  // anti-alucinação depois da resposta.
  let authorizedSlotUtc: Date | null = null
  // ─── Story 87-4 — o estado de agenda, com âncora, procedência e TTL ──────────
  // Este é o ÚNICO ponto de leitura do fato de agenda no turno. Três coisas
  // acontecem aqui, nesta ordem, e as três são subtração:
  //
  //  1. LÊ o `agenda_state`. Se estiver vencido (TTL de 48 h), ele NÃO entra no
  //     contexto e é apagado — expirado só-ignorado volta a valer se alguém mexer
  //     na constante.
  //  2. APAGA as quatro chaves do formato antigo. Não há migração: os 56 estados
  //     residuais medidos em produção em 07/08 são exatamente a classe que não
  //     deve ser preservada (34 deles resolvem um dia DIFERENTE conforme a data em
  //     que forem lidos; 6 resolvem dia+hora a partir de um "Oi").
  //  3. EMITE os dois eventos que tornam o decaimento mensurável (AC8) em vez de
  //     presumido.
  const nowAgenda = new Date()
  const agendaRead = readAgendaState(collectedData as Record<string, unknown>, nowAgenda)
  let agendaState: AgendaState | null = agendaRead.state
  if (agendaRead.expired) {
    writeAgendaState(collectedData as Record<string, unknown>, null)
    emit({
      level: "info",
      category: "ai",
      event_type: "NICOLE_AGENDA_STATE_EXPIRADO",
      message: "Estado de agenda vencido (TTL 48h) — descartado antes de entrar no contexto",
      metadata: { lead_id: conversation?.lead_id ?? null, conversation_id: conversationId },
    })
  }
  // Story 87-4 / B2 — o descarte do legado tira os 20 pontos de agenda de quem os
  // tinha por causa de um fato falso, e isso MUDA `qualification_status` e
  // `interest_level`. Medido em produção (08/08) sobre os 56 estados residuais:
  // 27 leads `qualified` estão na faixa 70–89 e caem para `in_progress`; 7 dos 16
  // `hot` caem para `warm`. É a consequência assumida da tese da story — os 20
  // pontos vinham, em 10 de 13 registros inspecionados, da fala da própria Nicole
  // — mas não pode acontecer em silêncio: o evento carrega o score DOS DOIS LADOS
  // para que a queda seja auditável lead a lead, e não descoberta no retrospecto.
  const scoreAntesDoDescarte = calculateQualificationScore(collectedData)
  const chavesLegadas = stripLegacyAgendaKeys(collectedData as Record<string, unknown>)
  if (chavesLegadas.length > 0) {
    emit({
      level: "info",
      category: "ai",
      event_type: "NICOLE_AGENDA_STATE_LEGADO_DESCARTADO",
      message: `Chave(s) de agenda do formato antigo encontradas e apagadas: ${chavesLegadas.join(", ")}`,
      metadata: {
        lead_id: conversation?.lead_id ?? null,
        conversation_id: conversationId,
        chaves: chavesLegadas,
        score_antes: scoreAntesDoDescarte,
        score_depois: calculateQualificationScore(collectedData),
      },
    })
  }

  // Story 75-162/75-268 — modo agendamento. Os dois sinais continuam existindo,
  // mas agora saem do MESMO objeto: "o lead falou de visita" e "ficou dia ou hora
  // pendente". Antes eram duas chaves independentes, e era essa duplicidade que
  // fazia a guarda de período precisar existir em dois lugares — e existir em um.
  const hasVisitAvailability = !!agendaState
  // Story 87-4 (revisão pós-gate) — "pendência" é literalmente o que as três
  // chaves `visit_pending_*` significavam: dia ou hora que ficaram pendentes
  // porque NÓS perguntamos. É `fonte === "pendencia"`, e nada mais. Uma MENÇÃO
  // (texto solto do lead) nunca foi pendência e não pode se comportar como uma —
  // era `visit_availability`, que não entrava neste sinal.
  const hasPendingSlot =
    isPendencia(agendaState) &&
    (agendaState!.data_absoluta !== null || agendaState!.hora !== null)
  // Story 75-268 — última fala da Nicole (o modo agendamento também liga por ela,
  // e a extração de nome da 75-161 usa a mesma string logo abaixo).
  //
  // Story 87-5 (AC3) — 🔴 FICA RESTRITO À NICOLE. `broker` nunca é
  // `lastAssistantMsg`, e a transição normalizada TAMBÉM não (ela era
  // `role='assistant'` no banco e agora vira `broker` na leitura). Isso corrige
  // um defeito que já existia: 127 mensagens humanas de handoff podiam ligar o
  // gate de agendamento e a extração de nome como se a Nicole as tivesse
  // escrito. A direção é RESTRITIVA — menos coisas contam como fala dela do que
  // ontem. Se a fala do corretor LIGAR um gate que hoje está desligado, a story
  // está errada ali.
  //
  // ⚠️ Este consumidor é INVISÍVEL ao `type-check` em qualquer variante:
  // comparar um union largo com um literal é TypeScript válido. A rede aqui é
  // teste, e só teste — `pipeline-corretor-no-historico.test.ts`, AC3.
  const lastAssistantMsg =
    [...history].reverse().find((m) => m.role === "assistant")?.content ?? ""
  // Story 75-245 — regra de verdade colada em TODO bloco [SISTEMA] de visita.
  // No incidente do lead Ailton o bloco dizia "visita JÁ confirmada para segunda
  // 3/08 às 12:00 — apenas confirme" e a Nicole anunciou "sábado às 9h" e depois
  // "às 10h". Nada proibia isso, nem aqui nem no prompt do banco.
  const sistema = (body: string) =>
    `[SISTEMA: ${body} REGRA ABSOLUTA: só afirme dia/horário de visita que esteja NESTE bloco. Nunca invente, arredonde nem complete um horário — se o que o cliente pediu não está aqui, PERGUNTE em vez de confirmar.]\n\n${message}`

  /** Story 75-245 — lista "8h ou 9h ou 11h" a partir dos slots livres. */
  const listSlots = (slots: Date[]) => slots.map(formatBrtDateTime).join(" ou ")

  /** Story 75-245 — dia legível ("sábado, 1 de agosto") para os blocos [SISTEMA]. */
  const formatBrtDay = (d: DayParts) =>
    slotToUtc(d, { hour: 12, minute: 0 }).toLocaleDateString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      weekday: "long",
      day: "numeric",
      month: "long",
    })

  // Story 75-163 — roda SEMPRE que há lead: se existe visita ativa, permite
  // remarcar/cancelar em qualquer etapa/dia (não depende de "modo agendamento").
  if (conversation?.lead_id) {
    const { data: activeAppointment } = await supabase
      .from("appointments")
      .select("id, scheduled_at, status, google_event_id, broker_id")
      .eq("lead_id", conversation.lead_id)
      .in("status", ["scheduled", "confirmed"])
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(1)
      .maybeSingle()

    if (activeAppointment) {
      // Story 75-163 — visita existe: detecta REMARCAR / CANCELAR / (senão) reconfirma.
      const apptId = activeAppointment.id as string
      const apptWhen = new Date(activeAppointment.scheduled_at)
      const formatted = apptWhen.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" })
      const hora = apptWhen.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })
      const existingWhenStr = formatBrtDateTime(apptWhen)
      const cdA = collectedData as Record<string, unknown>
      const nowA = new Date()
      const cancelIntent = detectCancelIntent(message)
      const rescheduleIntent = detectRescheduleIntent(message)
      // Story 75-268 — com visita JÁ marcada, número pelado ("as 10") só vale como
      // hora quando o cliente está claramente negociando O MESMO slot: pediu para
      // remarcar, ou nós deixamos dia/hora pendente. Fora disso, mexer numa visita
      // existente por causa de um "10" solto é caro demais.
      //
      // `cancelIntent` NÃO entra de propósito: em "quero cancelar, fico no trabalho
      // até 18" o número não é pedido de remarcação, e um slot concreto faria o
      // fluxo remarcar em vez de cancelar. Quem quer trocar de horário junto com o
      // cancelamento continua atendido pelo caminho com marcador ("às 10h").
      const negotiatingSlot = rescheduleIntent || hasPendingSlot
      // Story 87-4 — novo slot vem da MENSAGEM + da PENDÊNCIA (nunca de uma
      // menção), e o dia herdado já é absoluto: nada é reancorado aqui.
      //
      // `ignorarMencao` é o `visitAvailability: null` do `HEAD`, agora declarado.
      // Sem ele, o `agenda_state` que o `extractCollectedData` grava a partir de
      // texto solto entrava como se fosse pedido de remarcação e um "Oi" MOVIA a
      // `scheduled_at` de um lead em negociação avançada — com Google Calendar e
      // aviso ao corretor. Achado do gate do @qa.
      const resolved = resolveVisitSlotParts({
        message,
        now: nowA,
        agendaState,
        ignorarMencao: true,
        timeOptions: { bareNumberAllowed: negotiatingSlot },
      })
      /** Dia que ficou pendente de uma pergunta NOSSA (o `pDay` do `HEAD`). */
      const pendenciaDay =
        isPendencia(agendaState) && agendaState!.data_absoluta
          ? isoToDayParts(agendaState!.data_absoluta)
          : null
      let nDay = resolved.day
      const nTime = resolved.time
      // Só hora (sem dia) → assume o MESMO dia da visita atual (troca de horário no dia).
      if (nTime && !nDay) nDay = dayPartsFromUtc(apptWhen)
      // Story 75-245 — período sem número ("de manhã"): antes não resolvia nada e
      // a Nicole inventava o horário. Agora vira oferta de slots livres reais.
      const nPeriod = parsePeriodParts(message)
      const ev = nDay && nTime ? evaluateSlot(nDay, nTime, nowA) : { startUtc: null as Date | null, outsideHours: false }
      const newStartUtc = ev.startUtc
      const differs = newStartUtc ? Math.abs(newStartUtc.getTime() - apptWhen.getTime()) > 30 * 60_000 : false
      // Story 87-4 — uma chave só, um apagamento só.
      const clearPending = () => { writeAgendaState(cdA, null); agendaState = null }
      /** Story 87-4 — persiste o fato de agenda com a citação do lead e a âncora deste turno. */
      const guardarAgenda = (partes: { dataAbsoluta?: string | null; hora?: number | null; minuto?: number | null; periodo?: DayPeriod | null }) => {
        const st = buildAgendaState({
          // Citação: a mensagem deste turno quando foi ela que trouxe o fato;
          // senão preserva a citação original (o dia veio de um turno anterior).
          citacao: resolved.fromMessage.day || resolved.fromMessage.time ? message : (agendaState?.citacao ?? message),
          now: nowA,
          // Escrito por um ramo que ACABOU de perguntar o dia ou a hora.
          fonte: "pendencia",
          ...partes,
        })
        writeAgendaState(cdA, st)
        agendaState = st
      }
      // Story 75-245 — dia diferente do agendado JÁ É pedido de mudança, mesmo sem
      // palavra-chave ("tem como ver no sábado"). Antes caía no "apenas reconfirme"
      // e o pedido real do cliente morria ali.
      const apptDay = dayPartsFromUtc(apptWhen)
      const dayDiffers = !!resolved.day && dayPartsToIso(resolved.day) !== dayPartsToIso(apptDay)

      if (newStartUtc && differs) {
        // REMARCAR — novo dia+hora concreto e diferente do atual.
        clearPending()
        const { free, alternatives, erroNoPedido } = await checkSlotAvailability(supabase, orgId, newStartUtc, apptId, emit)
        const whenStr = formatBrtDateTime(newStartUtc)
        // Story 87-18 — a frase de INCERTEZA vem ANTES da bifurcação livre/ocupado
        // e não troca nenhuma das duas: com `erroNoPedido`, `free === false` é
        // ausência de informação, não "ocupado". Nem `rescheduleSlotUtc` nem
        // `authorizedSlotUtc` são setados aqui — é o que impede o UPDATE do `:1673`
        // e a autorização que o enforcement do epic leria como legítima.
        if (erroNoPedido) {
          messageWithContext = sistema(`Não consegui confirmar agora se ${whenStr} está livre ou ocupado — a consulta da agenda falhou. NÃO diga que está livre nem que está ocupado. Avise com simpatia que não conseguiu checar nesse instante e peça para o cliente tentar de novo em alguns minutos, ou ofereça chamar um corretor humano.`)
        } else if (free) {
          rescheduleSlotUtc = newStartUtc
          authorizedSlotUtc = newStartUtc
          apptToReschedule = { id: apptId, googleEventId: (activeAppointment.google_event_id as string | null) ?? null, fromWhen: existingWhenStr, brokerId: (activeAppointment.broker_id as string | null) ?? null }
          messageWithContext = sistema(`O cliente quer REMARCAR a visita de ${existingWhenStr} para ${whenStr}. O novo horário está LIVRE. Confirme a remarcação reafirmando o NOVO dia e horário (${whenStr}).`)
        } else {
          const alts = listSlots(alternatives)
          messageWithContext = sistema(`O cliente quer remarcar para ${whenStr}, mas esse horário está ocupado. NÃO confirme. Ofereça ${alts ? `estes horários livres: ${alts}` : "outro horário"} e mantenha a visita atual (${existingWhenStr}) até ele escolher.`)
        }
      } else if ((rescheduleIntent || cancelIntent) && nDay && nTime && !newStartUtc) {
        // Novo horário fora do atendimento (evaluateSlot devolveu null).
        messageWithContext = sistema(`O novo horário pedido não serve (já passou ou fora do atendimento: seg–sex 8h–18h, sáb 8h–12h). Peça um horário válido. A visita atual (${existingWhenStr}) segue mantida.`)
      } else if (cancelIntent && !nTime && !nDay && !nPeriod) {
        // CANCELAR — intenção clara, sem nova data.
        clearPending()
        apptToCancel = { id: apptId, googleEventId: (activeAppointment.google_event_id as string | null) ?? null, when: existingWhenStr, brokerId: (activeAppointment.broker_id as string | null) ?? null }
        messageWithContext = sistema(`O cliente quer CANCELAR a visita de ${existingWhenStr}. Confirme com gentileza que a visita foi cancelada e ofereça remarcar quando ele quiser. NÃO insista.`)
      } else if (nPeriod && (nDay || pendenciaDay)) {
        // Story 75-245 — PERÍODO com dia conhecido: oferece horários livres de verdade.
        // Story 87-4 — o `pendenciaDay` continua entrando (é o `pDay` do `HEAD`),
        // e ISSO ESTÁ CERTO: ele é o dia que o lead deu respondendo à nossa
        // pergunta. Bloqueá-lo faria o pedido de remarcação sumir em silêncio
        // (4 ocorrências históricas, medidas pelo @qa) e NÃO protegeria a
        // Valnira — o sábado dela era MENÇÃO (fala da própria Nicole), e menção
        // continua barrada pela guarda de período, agora dentro do resolver.
        const targetDay = (nDay ?? pendenciaDay)!
        guardarAgenda({ dataAbsoluta: dayPartsToIso(targetDay), periodo: nPeriod })
        const { slots, houveIncerteza } = await freeSlotsInPeriod(supabase, orgId, targetDay, nPeriod, nowA, apptId, undefined, emit)
        const periodo = nPeriod === "manha" ? "manhã" : "tarde"
        // 🔴 Story 87-18 (`AC4-ii`) — A ORDEM É NORMATIVA: `slots.length` PRIMEIRO,
        // `houveIncerteza` DEPOIS. Inverter faria UMA incerteza entre onze candidatos
        // jogar no lixo uma oferta boa e inteira — a opção (b) que o §5 da story
        // rejeitou na camada da função, entrando pela camada da mensagem.
        messageWithContext = slots.length
          ? sistema(`O cliente quer a visita de ${periodo} em ${formatBrtDay(targetDay)}. Horários LIVRES nesse período: ${listSlots(slots)}. NÃO confirme nenhum ainda: ofereça exatamente esses e pergunte qual ele prefere. A visita atual (${existingWhenStr}) segue mantida até ele escolher.`)
          : houveIncerteza
            ? sistema(`Não consegui confirmar a agenda desse período agora — a consulta falhou. NÃO diga que não há horário livre. Avise com simpatia que não conseguiu checar nesse instante e ofereça tentar de novo em breve, ou outro período/dia.`)
            : sistema(`O cliente quer a visita de ${periodo} em ${formatBrtDay(targetDay)}, mas não há horário livre nesse período. NÃO confirme. Avise com simpatia e ofereça outro período ou outro dia (seg–sex 8h–18h, sáb 8h–12h). A visita atual (${existingWhenStr}) segue mantida.`)
      } else if (nDay && !nTime && (rescheduleIntent || dayDiffers)) {
        // Story 75-245 — dia novo sem horário (com ou sem palavra-chave de remarcar).
        guardarAgenda({ dataAbsoluta: dayPartsToIso(nDay) })
        messageWithContext = sistema(`O cliente indicou um novo dia (${formatBrtDay(nDay)}) para a visita, mas não o horário. Pergunte qual horário prefere (seg–sex 8h–18h, sáb 8h–12h). NÃO afirme nenhum horário. A visita atual (${existingWhenStr}) segue mantida até ele escolher.`)
      } else {
        // Sem pedido de mudança → reconfirma o existente.
        authorizedSlotUtc = apptWhen
        messageWithContext = sistema(`Visita JÁ confirmada para ${formatted} às ${hora}. Se o cliente NÃO pediu para mudar nem cancelar, apenas confirme com simpatia: "Sua visita tá marcada pra ${formatted} às ${hora}, te espero lá!"`)
      }
    } else if (
      // Story 75-268 — o gate deixa de ser só visit_proposed/visit_availability.
      isVisitSchedulingMode({
        visitProposed: state?.visit_proposed,
        hasVisitAvailability,
        hasPendingSlot,
        lastAssistantMessage: lastAssistantMsg,
      })
    ) {
      // 2) Sem visita ainda → entende o dia/horário pedido (combinando com o que
      //    ficou pendente de turnos anteriores), confere a agenda interna (que inclui
      //    Calendly) e injeta o contexto para a Nicole responder certo na MESMA mensagem.
      const cd = collectedData as Record<string, unknown>
      const now = new Date()
      // Story 75-162 — combina a msg do lead com o que ficou de turnos anteriores,
      // para agendar mesmo quando dia e hora vieram separados.
      // Story 87-4 — a fonte herdada é UMA só (`agenda_state`), e o dia dela já é
      // absoluto: a frase original nunca é reparseada contra o relógio de hoje.
      const { day, time, fromMessage } = resolveVisitSlotParts({
        message,
        now,
        agendaState,
        // Story 75-268 — aqui NÃO há visita marcada e já estamos em modo agendamento:
        // "as 10" / "Umas 14" é hora. Era o que se perdia nos dois incidentes.
        timeOptions: { bareNumberAllowed: true },
      })
      /** Story 87-4 — persiste o fato de agenda com citação e âncora deste turno. */
      const guardarAgenda = (partes: { dataAbsoluta?: string | null; hora?: number | null; minuto?: number | null; periodo?: DayPeriod | null }) => {
        const st = buildAgendaState({
          citacao: fromMessage.day || fromMessage.time ? message : (agendaState?.citacao ?? message),
          now,
          // Escrito por um ramo que ACABOU de perguntar o dia ou a hora.
          fonte: "pendencia",
          ...partes,
        })
        writeAgendaState(cd, st)
        agendaState = st
      }

      // Story 75-245 — período sem número ("de manhã") vira oferta de horários
      // livres; antes o parser devolvia nada e a Nicole inventava o horário.
      const period: DayPeriod | null = parsePeriodParts(message)

      if (day && time) {
        // Dia + hora completos (no turno ou combinando com o pendente) → resolve e limpa pendência.
        writeAgendaState(cd, null)
        agendaState = null
        const { startUtc, outsideHours } = evaluateSlot(day, time, now)
        if (startUtc) {
          const { free, alternatives, erroNoPedido } = await checkSlotAvailability(supabase, orgId, startUtc, undefined, emit)
          const whenStr = formatBrtDateTime(startUtc)
          // Story 87-18 — idem `:1015`: `bookableSlotUtc`/`authorizedSlotUtc` NÃO
          // são setados sob incerteza, o que corta o `.insert()` do `:1563` de um
          // horário que ninguém conseguiu conferir.
          if (erroNoPedido) {
            messageWithContext = sistema(`Não consegui confirmar agora se ${whenStr} está livre ou ocupado — a consulta da agenda falhou. NÃO diga que está livre nem que está ocupado. Avise com simpatia que não conseguiu checar nesse instante e peça para o cliente tentar de novo em alguns minutos, ou ofereça chamar um corretor humano.`)
          } else if (free) {
            bookableSlotUtc = startUtc
            authorizedSlotUtc = startUtc
            messageWithContext = sistema(`O cliente quer a visita em ${whenStr}. Esse horário está LIVRE. Confirme a visita reafirmando o dia e o horário (${whenStr}) e diga que vai deixar o café preparado.`)
          } else {
            const alts = listSlots(alternatives)
            messageWithContext = sistema(`O cliente pediu ${whenStr}, mas JÁ existe uma visita nesse horário. NÃO confirme esse horário. Com simpatia, avise que esse horário já está reservado e ofereça ${alts ? `estes horários livres: ${alts}` : "outro horário"}. Pergunte qual prefere.`)
          }
        } else {
          messageWithContext = sistema(`O horário pedido não serve (já passou ou está fora do atendimento). Informe com gentileza que atendemos de segunda a sexta das 8h às 18h e sábado das 8h às 12h, e peça um horário válido.`)
        }
      } else if (day && period) {
        // Story 75-245 — dia + período: oferece os horários LIVRES daquele período.
        guardarAgenda({ dataAbsoluta: dayPartsToIso(day), periodo: period })
        const { slots, houveIncerteza } = await freeSlotsInPeriod(supabase, orgId, day, period, now, undefined, undefined, emit)
        const periodo = period === "manha" ? "manhã" : "tarde"
        // 🔴 Story 87-18 (`AC4-ii`) — ordem normativa, mesma do `:1044`.
        messageWithContext = slots.length
          ? sistema(`O cliente quer a visita de ${periodo} em ${formatBrtDay(day)}. Horários LIVRES nesse período: ${listSlots(slots)}. Ofereça exatamente esses e pergunte qual ele prefere — NÃO confirme nenhum antes de ele escolher.`)
          : houveIncerteza
            ? sistema(`Não consegui confirmar a agenda desse período agora — a consulta falhou. NÃO diga que não há horário livre. Avise com simpatia que não conseguiu checar nesse instante e ofereça tentar de novo em breve, ou outro período/dia.`)
            : sistema(`O cliente quer a visita de ${periodo} em ${formatBrtDay(day)}, mas não há horário livre nesse período. NÃO confirme nada. Avise com simpatia e ofereça outro período ou outro dia (seg–sex 8h–18h, sáb 8h–12h).`)
      } else if (day && !time) {
        // Só o dia → guarda o dia e pergunta o horário.
        guardarAgenda({ dataAbsoluta: dayPartsToIso(day) })
        messageWithContext = sistema(`O cliente indicou o dia (${formatBrtDay(day)}) mas não o horário. Pergunte qual horário prefere (atendemos seg–sex 8h–18h, sáb 8h–12h). NÃO afirme nenhum horário.`)
      } else if (time && !day) {
        // Só a hora → guarda a hora e pergunta a data (depois confirme "tal dia às tal hora").
        guardarAgenda({ hora: time.hour, minuto: time.minute })
        const horaStr = `${time.hour}h${time.minute ? String(time.minute).padStart(2, "0") : ""}`
        messageWithContext = sistema(`O cliente indicou o horário (${horaStr}) mas não o dia. Guarde esse horário, pergunte qual dia prefere e, quando ele disser, confirme reafirmando o dia e o horário. Atendemos seg–sex 8h–18h, sáb 8h–12h.`)
      } else if (period) {
        // Story 75-245 — só o período, sem dia: pergunta o dia sem inventar hora.
        const periodo = period === "manha" ? "manhã" : "tarde"
        messageWithContext = sistema(`O cliente indicou o período (de ${periodo}) mas não o dia. Pergunte qual dia prefere. NÃO afirme nenhum horário — quando ele disser o dia, você receberá os horários livres.`)
      }
    }
  }

  userContent.push({ type: "text", text: messageWithContext })

  // Story 87-5 (AC1) — A FRONTEIRA. `Anthropic.MessageParam.role` só aceita
  // dois papéis; a fala do corretor vai como `assistant` (o nosso lado da
  // conversa) com o `content` prefixado por `[CORRETOR HUMANO — {nome}]: `.
  // O rótulo é montado AQUI e nunca persistido em `messages`.
  const messages: Anthropic.MessageParam[] = [
    ...toAnthropicHistory(history),
    { role: "user", content: userContent },
  ]

  const claudeStart = Date.now()
  // Story 75-349 — `temperature` só vai para modelo que ainda aceita sampling. A
  // geração atual devolve 400, e como `model_primary` mora no banco, a troca pela
  // tela derrubava a Nicole sem deploy nenhum.
  const mandaTemperature = supportsSampling(agentConfig.model_primary)
  const response = await anthropic.messages.create(
    {
      model: agentConfig.model_primary,
      max_tokens: agentConfig.max_tokens,
      ...(mandaTemperature ? { temperature: agentConfig.temperature } : {}),
      system: systemBlocks,
      messages,
    },
    { timeout: 60000 }
  )
  const claudeDuration = Date.now() - claudeStart

  // Prompt caching telemetry (Story 21.3) — Anthropic Usage exposes:
  //   - cache_creation_input_tokens: tokens written to cache (first call)
  //   - cache_read_input_tokens:     tokens read from cache (subsequent calls in TTL)
  // Both are nullable in older models / unsupported configs → coerce to 0.
  const cacheCreationTokens = response.usage.cache_creation_input_tokens ?? 0
  const cacheReadTokens = response.usage.cache_read_input_tokens ?? 0
  const cacheTotalTokens = cacheCreationTokens + cacheReadTokens
  const cacheHitRatio =
    cacheTotalTokens > 0 ? cacheReadTokens / cacheTotalTokens : 0

  emit({
    level: "info",
    category: "ai",
    event_type: "CLAUDE_RESPONSE",
    message: `Claude responded in ${claudeDuration}ms`,
    metadata: {
      response_time_ms: claudeDuration,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_creation_input_tokens: cacheCreationTokens,
      cache_read_input_tokens: cacheReadTokens,
      model: agentConfig.model_primary,
    },
  })

  // Dedicated cache stats event for cost / hit-ratio dashboards.
  emit({
    level: "info",
    category: "ai",
    event_type: "prompt_cache_stats",
    message:
      cacheReadTokens > 0
        ? "prompt_cache_hit"
        : cacheCreationTokens > 0
          ? "prompt_cache_miss_or_create"
          : "prompt_cache_unused",
    metadata: {
      cache_creation_input_tokens: cacheCreationTokens,
      cache_read_input_tokens: cacheReadTokens,
      total_input_tokens: response.usage.input_tokens,
      cache_hit_ratio: cacheHitRatio,
      output_tokens: response.usage.output_tokens,
      model: agentConfig.model_primary,
    },
  })

  // Story 75-349 — por FILTRO, nunca por posição: com thinking ligado (padrão na
  // geração atual) o bloco 0 é `thinking` e a leitura antiga descartava a fala.
  const rawAssistantMessage = textoDaResposta(response.content)
  if (!rawAssistantMessage.trim()) {
    // Falha que não se anuncia: o `SANITIZED_EMPTY_FALLBACK` logo abaixo manda uma
    // frase neutra e a conversa PARECE funcionar. Medir é parte do conserto — foi o
    // que faltou no token da Meta (75-289), que caiu em silêncio por horas.
    emit({
      level: "error",
      category: "ai",
      event_type: "nicole_resposta_vazia",
      message: "Resposta do modelo sem bloco de texto — fala descartada",
      metadata: {
        model: agentConfig.model_primary,
        tipos_de_bloco: response.content.map((b) => b.type),
        temperature_enviada: mandaTemperature,
      },
    })
  }

  // Story 75-279 — higieniza ANTES de qualquer consumidor (ver stripSystemBlocks).
  const { text: cleanedMessage, stripped: leakedSystemBlock } =
    stripSystemBlocks(rawAssistantMessage)
  // Se a fala inteira era o bloco vazado, a limpeza deixa string vazia — e o
  // webhook envia `text.body` sem guarda de vazio (a Graph API recusa). Silêncio
  // é pior que uma frase neutra: cai numa que não compromete dia nem horário.
  const assistantMessage = cleanedMessage.trim() ? cleanedMessage : SANITIZED_EMPTY_FALLBACK
  if (leakedSystemBlock) {
    emit({
      level: "error",
      category: "ai",
      event_type: "NICOLE_SYSTEM_BLOCK_LEAK",
      // Story 87-5 — o `event_type` NÃO muda (é o que a instrumentação lê); só a
      // frase, porque a higienização passou a cobrir duas marcações internas.
      message:
        "Nicole reproduziu uma marcacao interna ([SISTEMA] ou [CORRETOR HUMANO]) na resposta — removida antes do envio",
      metadata: {
        lead_id: conversation?.lead_id ?? null,
        raw_message: rawAssistantMessage.slice(0, 500),
      },
    })
  }

  // ─── Story 87-20 · Sinais A e C ───────────────────────────────────────────
  //
  // Aqui, e não depois: `assistantMessage` acabou de ser gerada e saneada, e NADA foi
  // escrito ainda. O `return` antecipado é o requisito normativo do AC5 — ele cobre
  // por construção as ~15 escritas que vêm depois (calendário, agenda, `activities`,
  // avanço de estágio, push ao corretor, patch de `leads`, `saveMessages`,
  // `updateConversationState`, `updateConversationTimestamp`).
  //
  // Fail-CLOSED, ao contrário do `detectSlotMismatch` logo abaixo (que só observa):
  // esta trava existe justamente para interromper um envio.
  if (loopBreakerLigado) {
    const repeticao = detectarLoopDeConteudo({
      candidato: assistantMessage,
      recentes: recentesDaNicole,
      now: agoraDoLoop,
    })
    if (repeticao.bloquear) {
      return await conterLoop("conteudo_repetido", repeticao.ocorrenciasAnteriores)
    }

    const encerramento = detectarLoopDeEncerramento({
      candidato: assistantMessage,
      recentes: recentesDaNicole,
      now: agoraDoLoop,
    })
    if (encerramento.bloquear) {
      return await conterLoop("encerramento", encerramento.ocorrenciasAnteriores)
    }
  }

  // Story 75-245 — guarda anti-alucinação de horário. FAIL-OPEN: só observa e
  // loga, nunca bloqueia o envio. No incidente do lead Ailton a Nicole afirmou
  // "sábado às 9h" e "às 10h" com o bloco [SISTEMA] dizendo "segunda 3/08 às
  // 12:00" — e ninguém soube até o Marcos abrir a conversa no dia seguinte.
  // Só roda em AFIRMAÇÃO de dia+hora único: quando ela oferece opções ("8h ou
  // 11h") o texto é ambíguo e a guarda se cala (evita falso positivo).
  if (!apptToCancel) {
    if (authorizedSlotUtc) {
      const saidUtc = detectSlotMismatch({ assistantMessage, authorizedSlotUtc, now: new Date() })
      if (saidUtc) {
        emit({
          level: "error",
          category: "ai",
          event_type: "NICOLE_SLOT_MISMATCH",
          message: `Nicole afirmou ${formatBrtDateTime(saidUtc)} mas o sistema autorizou ${formatBrtDateTime(authorizedSlotUtc)}`,
          metadata: {
            lead_id: conversation?.lead_id ?? null,
            said_at: saidUtc.toISOString(),
            authorized_at: authorizedSlotUtc.toISOString(),
            assistant_message: assistantMessage.slice(0, 500),
          },
        })
      }
    } else {
      // Story 75-279 — o sistema NÃO autorizou horário nenhum neste turno e ela
      // confirmou mesmo assim. É o caso da Maria Oliveira: cliente sai da conversa
      // com visita marcada na cabeça e nada na agenda. Fail-open (loga, não
      // derruba o envio) — bloquear é decisão de produto, fora desta story.
      const affirmedUtc = detectAffirmedSlot({ assistantMessage, now: new Date() })
      if (affirmedUtc) {
        emit({
          level: "error",
          category: "ai",
          event_type: "NICOLE_SLOT_UNAUTHORIZED",
          message: `Nicole afirmou ${formatBrtDateTime(affirmedUtc)} sem o sistema ter autorizado horário algum`,
          metadata: {
            lead_id: conversation?.lead_id ?? null,
            said_at: affirmedUtc.toISOString(),
            assistant_message: assistantMessage.slice(0, 500),
          },
        })
      }
    }
  }

  // Detect if Nicole invited the client to pick a visit date in this response.
  // Used to set visit_proposed = true so the next message can capture the confirmation.
  const VISIT_INVITE_PATTERNS = [
    /qual dia ser[ia]+\s*melhor/i,
    /que dia ser[ia]+\s*bom/i,
    /qual.*dia.*melhor pra voc/i,
    /link da nossa agenda/i,
    /posso te enviar o link/i,
    /calendly\.com/i,
  ]
  const nicoleInvitedVisit =
    !state?.visit_proposed &&
    VISIT_INVITE_PATTERNS.some((p) => p.test(assistantMessage))

  // 9. Extract collected data from user message FIRST (name comes from user, not AI)
  // Story 75-161 — se a Nicole ACABOU de perguntar o nome (última msg dela no
  // histórico) e ainda não temos nome, aceitamos uma resposta curta em minúsculas
  // como nome (ex.: "maicon"). Contexto claro → baixo risco de falso positivo.
  // (Story 75-268 — `lastAssistantMsg` agora é calculado lá acima, porque o modo
  // agendamento também depende dele.)
  const nameExpected =
    !collectedData.name &&
    /\bnome\b|\bcomo (?:posso|devo|gostaria de|prefere) (?:te )?chamar\b|\bcom quem (?:eu )?(?:falo|estou falando)\b/i.test(
      lastAssistantMsg
    )
  // Story 87-4 — `origem: "lead"` é o que autoriza a extração de agenda. A
  // chamada de baixo, sobre a fala da Nicole, NÃO passa origem — e por isso
  // deixa de gravar disponibilidade que ninguém disse.
  const updatedData = extractCollectedData(message, collectedData, {
    nameExpected,
    origem: "lead",
    now: nowAgenda,
  })

  // If Nicole already asked about a visit date, check if the client is now confirming one.
  // extractVisitConfirmation requires a day reference AND a positive signal — not just any mention.
  if (state?.visit_proposed && !updatedData.visit_explicitly_confirmed) {
    const confirmed = extractVisitConfirmation(message)
    if (confirmed) {
      ;(updatedData as Record<string, unknown>).visit_explicitly_confirmed = confirmed
    }
  }

  // Then extract non-name data from AI response (property mentions, etc — but NOT name)
  // Story 87-4 — `origem: "assistant"`: daqui saem nome/imóvel/quartos como sempre,
  // mas NUNCA mais disponibilidade de visita. Esta linha é a que gravava a pergunta
  // da própria Nicole ("qual o melhor dia, durante a semana ou sábado de manhã?")
  // como se fosse a resposta do lead.
  const aiExtracted = extractCollectedData(assistantMessage, updatedData, { origem: "assistant" })
  // Preserve the name from user message only (AI response might say "Nicole" which is the bot name)
  const finalData: Record<string, unknown> = { ...aiExtracted, name: updatedData.name ?? collectedData.name }
  // Preserve visit_explicitly_confirmed from user message (extractCollectedData doesn't know about it)
  if ((updatedData as Record<string, unknown>).visit_explicitly_confirmed) {
    finalData.visit_explicitly_confirmed = (updatedData as Record<string, unknown>).visit_explicitly_confirmed
  }

  // 10. Calculate updated score and check handoff
  const updatedScore = calculateQualificationScore(finalData)
  const updatedStep = getNextQualificationStep(finalData)

  emit({ level: "info", category: "ai", event_type: "QUALIFICATION_UPDATE", message: `Score: ${updatedScore}/100, step: ${updatedStep}`, metadata: { score: updatedScore, step: updatedStep, collected_fields: Object.keys(finalData).filter(k => finalData[k] != null) } })

  // Story 75-361 — quantas vezes este lead já pediu preço, contado no BANCO.
  //
  // Não sai do `history`: ele é limitado a 20 mensagens e o caso que motivou a
  // story (7 repetições da mesma frase) se arrasta por semanas — a janela curta
  // esconderia a insistência. E a régua é a MESMA função que decide o handoff,
  // em vez de um `ilike` por termo replicando a regra em SQL.
  let pedidosDePrecoDoLead = 0
  if (ehPedidoDePrecoDoLead(message)) {
    const { data: falasDoLead } = await supabase
      .from("messages")
      .select("content")
      .eq("conversation_id", conversationId)
      .eq("role", "user")
      .order("created_at", { ascending: false })
      .limit(200)
    // +1 pela mensagem atual: ela pode ou não já estar gravada quando o pipeline
    // roda (o webhook insere antes, o Chat interno não), então conto só as
    // ANTERIORES e somo a de agora — nunca dá para contar duas vezes.
    const anteriores = (falasDoLead ?? []).filter(
      (m) => (m.content as string) !== message && ehPedidoDePrecoDoLead(m.content as string)
    ).length
    pedidosDePrecoDoLead = anteriores + 1
  }

  const handoffResult = shouldHandoff({
    qualificationScore: updatedScore,
    message,
    conversationState: {
      ...finalData,
      visit_proposed: state?.visit_proposed ?? false,
    },
    pedidosDePrecoDoLead,
  })

  let handoffSummary: string | undefined
  if (handoffResult.trigger) {
    const allMessages = [
      ...history,
      { role: "user" as const, content: message },
      { role: "assistant" as const, content: assistantMessage },
    ]
    handoffSummary = generateHandoffSummary(finalData, allMessages)
  }

  if (conversation?.lead_id) {
    const leadId = conversation.lead_id

    // STAGE_IDS imported from @trifold/shared

    // [12.2 AC11] Single batch update — accumulate all changes, apply once
    const leadPatch: Record<string, unknown> = {}

    // Fetch current lead state for conditional logic
    const { data: currentLead } = await supabase
      .from("leads")
      // Story 75-360 — `name` entra aqui porque a decisão de gravar nome precisa
      // saber o que JÁ existe no lead (o `collected_data` da conversa não sabe).
      .select("stage_id, property_interest_id, assigned_broker_id, interest_level_manual, finalidade, name")
      .eq("id", leadId)
      .single()

    // Story 75-158 — property_interest_id: preenche por CONTEXTO quando vazio; só
    // TROCA valor existente com afirmação explícita e única do PRÓPRIO lead
    // (nunca clobber por contexto). Antes o pipeline sobrescrevia incondicionalmente
    // e só olhava a msg atual do lead (caso Maicon ficava NULL).
    const currentPropId = currentLead?.property_interest_id ?? null
    const explicitFromLead = identifyPropertyUnique(message, properties)
    // Contexto recente (msg atual + histórico) só é usado para PREENCHER quando vazio.
    // Story 87-5 (AC9) — a fala do CORRETOR fica de fora desta string, de
    // propósito. Deixar o corretor preencher `property_interest_id` faria o
    // sistema PASSAR A ACREDITAR em algo que hoje não acredita: é caminho de
    // decisão novo, e a regra de corte da Onda 1 o proíbe — mesmo sendo
    // provavelmente a coisa certa a fazer. TODO(onda 3+): reavaliar com o
    // mesmo cuidado que o `detect-appointment.ts:71` recebeu na 87-4.
    const contextPropertyId = currentPropId
      ? null
      : identifyPropertyUnique(
          [
            message,
            ...history.filter((m) => m.role !== "broker").map((m) => m.content),
          ].join("  "),
          properties
        )
    let collectedPropertyId: string | null = null
    if (!currentPropId && typeof finalData.property_interest === "string") {
      const interest = (finalData.property_interest as string).toLowerCase()
      const matchedProperty = properties.find(
        (p) => p.slug.toLowerCase() === interest || p.name.toLowerCase() === interest
      )
      collectedPropertyId = matchedProperty?.id ?? null
    }
    const propWrite = resolvePropertyInterestWrite({
      currentPropertyId: currentPropId,
      explicitFromLead,
      contextPropertyId,
      collectedPropertyId,
    })
    if (propWrite) {
      leadPatch.property_interest_id = propWrite.propertyId
      emit({
        level: "info",
        category: "ai",
        event_type: "nicole_property_interest_set",
        message: `property_interest_id definido (${propWrite.origin})`,
        metadata: {
          lead_id: leadId,
          property_id: propWrite.propertyId,
          previous: currentPropId,
          origin: propWrite.origin,
        },
      })
    }

    // Sync collected_data → lead fields
    //
    // 🔥 Story 75-360 — antes era `if (finalData.name) leadPatch.name = …`, sem
    // olhar o que havia no lead. Em 20/08/2026 isso apagou três nomes reais em
    // minutos ("Melquiades Jesus" → "Já Comprei", "Cleonice Viana" → "Oii",
    // "Amauri" → "Morar") porque a guarda do extrator consulta o `collected_data`
    // da conversa, que vem vazio mesmo com `leads.name` preenchido pelo Meta.
    if (podeGravarNomeDoLead(currentLead?.name, finalData.name, finalData.name_origin)) {
      leadPatch.name = finalData.name
      // Troca de nome DEIXA RASTRO. As três de 20/08 foram silenciosas — nenhuma
      // activity, nada na timeline — e por isso ninguém percebeu até o nome errado
      // aparecer na tela.
      const nomeAnterior = (currentLead?.name ?? "").trim()
      if (nomeAnterior && nomeAnterior.toLowerCase() !== String(finalData.name).toLowerCase()) {
        emit({
          level: "info",
          category: "ai",
          event_type: "LEAD_NAME_REPLACED",
          message: `Nome do lead trocado: "${nomeAnterior}" → "${String(finalData.name)}"`,
          metadata: {
            lead_id: leadId,
            anterior: nomeAnterior,
            novo: String(finalData.name),
            origem: finalData.name_origin ?? null,
          },
        })
      }
    }
    if (finalData.bedrooms) leadPatch.preferred_bedrooms = finalData.bedrooms
    if (finalData.floor) leadPatch.preferred_floor = finalData.floor
    if (finalData.preferred_floor) leadPatch.preferred_floor = finalData.preferred_floor
    if (finalData.view) leadPatch.preferred_view = finalData.view
    if (finalData.preferred_view) leadPatch.preferred_view = finalData.preferred_view
    if (finalData.garages) leadPatch.preferred_garage_count = finalData.garages
    if (finalData.garage_count) leadPatch.preferred_garage_count = finalData.garage_count
    if (finalData.has_down_payment !== undefined) leadPatch.has_down_payment = finalData.has_down_payment
    // Story 75-347 — a finalidade só é ESCRITA quando ainda não existe. O que veio
    // do formulário do Meta (75-114) ou foi digitado por humano manda: mesma regra
    // do `process-lead.ts:270`. A extração é por palavra-chave sobre a fala do
    // lead — boa o bastante para preencher o vazio, não para corrigir um humano.
    if (finalData.finalidade && !currentLead?.finalidade) {
      leadPatch.finalidade = finalData.finalidade
    }
    if (finalData.email) leadPatch.email = finalData.email
    if (finalData.source) leadPatch.source = finalData.source
    leadPatch.qualification_score = updatedScore
    leadPatch.qualification_status = updatedScore >= 70 ? "qualified" : updatedScore > 0 ? "in_progress" : "not_started"
    // Story 75-347 (AC5) — a régua de calor tem UMA fonte. Esta linha reproduzia
    // os cortes 70/40 à mão: a 75-332 extraiu `interestLevelFromScore` para acabar
    // com as réguas divergentes e deixou de fora justamente o caminho principal, o
    // da própria Nicole. Os números são idênticos hoje; o que muda é que a próxima
    // recalibração não vale para o formulário e o cron e deixa o pipeline atrás.
    leadPatch.interest_level = interestLevelFromScore(updatedScore)
    // Story 75-237 — temperatura escolhida por humano manda: a IA não desfaz.
    stripManualInterestLevel(leadPatch, currentLead as Record<string, unknown> | null)

    // Kanban stage — a Nicole (IA) NUNCA move o lead de etapa (Story 75-56,
    // generaliza a 65-1), com UMA exceção (Story 75-196, decisão do Marcos
    // 2026-07-22): ao AGENDAR/REMARCAR visita, o lead avança para "Visita
    // Agendada" via advanceToVisitaAgendada (guard só-avança; perdido é
    // terminal). Fora isso, quem reposiciona no kanban é o corretor humano; a
    // roleta (distributor.ts) coloca em "Aguardando atendimento". A qualificação
    // segue refletida em qualification_score/qualification_status — não na etapa.

    // Visit scheduling — requires explicit confirmation from the client (Story 61-1)
    // Double-check: no existing future appointment for this lead (prevents duplicates)
    const { data: existingAppt } = await supabase
      .from("appointments")
      .select("id")
      .eq("lead_id", leadId)
      .in("status", ["scheduled", "confirmed"])
      .gte("scheduled_at", new Date().toISOString())
      .limit(1)
      .maybeSingle()

    // Story 73-1: agenda no HORÁRIO pedido pelo cliente (bookableSlotUtc só é setado
    // quando o cliente pediu um dia+hora explícito que está LIVRE na agenda interna —
    // que já inclui Calendly). Handoff NÃO bloqueia mais a visita. Horário ocupado →
    // bookableSlotUtc fica null (a Nicole já ofereceu outro horário na resposta).
    // bookableSlotUtc só é setado quando o cliente forneceu (no turno ou combinando turnos)
    // um dia+hora concreto, LIVRE e dentro do horário — em modo de agendamento (visit_proposed).
    // Isso é confirmação suficiente; não exige day-ref no turno atual (cobre conclusão só-hora).
    if (bookableSlotUtc && !existingAppt && conversation.org_id) {
      const scheduledAt = bookableSlotUtc
      const endAt = new Date(scheduledAt.getTime() + VISIT_DURATION_MIN * 60_000)
      const propertyId = identifiedPropertyId ?? state?.current_property_id
      const assignedBrokerId: string | null = currentLead?.assigned_broker_id ?? null
      const whenStr = formatBrtDateTime(scheduledAt)
      const clientEmail = (finalData.email as string | undefined) ?? null

      const { data: createdAppt, error: apptErr } = await supabase
        .from("appointments")
        .insert({
          org_id: conversation.org_id,
          lead_id: leadId,
          broker_id: assignedBrokerId,
          scheduled_at: scheduledAt.toISOString(),
          duration_minutes: VISIT_DURATION_MIN,
          location: "Sede Trifold - Av. Nildo Ribeiro da Rocha, 1337, Vila Marumby",
          status: "scheduled",
          team: "house", // Story 81-1: Nicole é equipe house (default cobre, explícito documenta)
          created_by: "nicole",
          client_name: leadName,
          client_phone: leadPhone,
          client_email: clientEmail,
          notes: `Visita confirmada pelo cliente para ${whenStr}.`,
        })
        .select("id")
        .maybeSingle()

      // Story 75-162 — não falhar em silêncio: se o INSERT não gravou, logar e NÃO
      // emitir APPOINTMENT_CREATED (antes emitia mesmo sem linha → notificava o
      // corretor de uma visita inexistente).
      if (apptErr || !createdAppt?.id) {
        emit({
          level: "error",
          category: "ai",
          event_type: "APPOINTMENT_INSERT_FAILED",
          message: `Falha ao criar appointment da Nicole: ${apptErr?.message ?? "sem retorno"}`,
          metadata: { lead_id: leadId, scheduled_at: scheduledAt.toISOString(), error: apptErr?.message ?? null },
        })
      } else {
      // Empurra para o Google Calendar (fecha a brecha de duplicação com o Calendly).
      // Injetado pela camada web; best-effort — nunca derruba o agendamento.
      if (createdAppt?.id && createCalendarEvent) {
        try {
          const googleEventId = await createCalendarEvent({
            title: `Visita ao decorado${leadName ? ` — ${leadName}` : ""}`,
            description: `Visita agendada pela Nicole.${leadPhone ? ` Telefone: ${leadPhone}.` : ""}`,
            startAt: scheduledAt,
            endAt,
          })
          if (googleEventId) {
            await supabase.from("appointments").update({ google_event_id: googleEventId }).eq("id", createdAppt.id)
          }
        } catch (err) {
          emit({ level: "warn", category: "ai", event_type: "GOOGLE_CALENDAR_PUSH_FAILED", message: "Failed to push Nicole appointment to Google Calendar", metadata: { lead_id: leadId, appointment_id: createdAppt.id, error: String(err) } })
        }
      }

      // Story 75-196 (muda a 73-1) + 75-340: visita agendada → lead avança para
      // "Visita Agendada" (guard no WHERE; só não regride quem já visitou/propôs/
      // negocia/fechou). Desde a 75-340 o lead PERDIDO também avança: se ele
      // voltou a falar com a Nicole e marcou visita, está de volta ao funil.
      // Lead da Nicole é segmento='principal' → aparece no pipeline HOUSE.
      const estavaPerdido = !!currentLead?.stage_id && PERDIDO_STAGE_IDS.includes(currentLead.stage_id)
      const { error: stageErr } = await advanceToVisitaAgendada(supabase, leadId)
      if (!stageErr && estavaPerdido) {
        // Mesma trilha que os agendamentos do CRM deixam (ver
        // web/lib/leads/advance-visita-agendada.ts): sem isso, a timeline mostra
        // um lead perdido mudando de etapa sem explicação.
        await supabase.from("activities").insert({
          org_id: conversation.org_id,
          lead_id: leadId,
          type: "lead_reactivated",
          description: "Lead reativado automaticamente: visita agendada pela Nicole",
          metadata: { motivo: "Visita agendada pela Nicole", automatico: true, previous_stage_id: currentLead?.stage_id ?? null },
        })
      }
      if (stageErr) {
        emit({ level: "warn", category: "ai", event_type: "STAGE_ADVANCE_FAILED", message: `Falha ao mover lead para Visita Agendada: ${stageErr}`, metadata: { lead_id: leadId, appointment_id: createdAppt.id } })
      }
      leadPatch.visit_scheduled_at = scheduledAt.toISOString()

      // ADR-001: pipeline only sets lead owner when lead has no owner yet (roleta not yet run).
      if (shouldAssignPipelineBroker(assignedBrokerId, currentLead?.assigned_broker_id)) {
        leadPatch.assigned_broker_id = assignedBrokerId
      }

      await supabase.from("activities").insert({
        org_id: conversation.org_id,
        lead_id: leadId,
        type: "visit_scheduled",
        description: `Nicole agendou visita para ${whenStr}${assignedBrokerId ? " (corretor designado)" : ""}.`,
      })

      const notificationBrokerUserId = assignedBrokerId
      emit({ level: "info", category: "ai", event_type: "APPOINTMENT_CREATED", message: `Visit scheduled for lead${assignedBrokerId ? " with broker" : " WITHOUT broker"}`, metadata: { lead_id: leadId, broker_assigned: !!assignedBrokerId, broker_user_id: assignedBrokerId, notification_broker_user_id: notificationBrokerUserId, lead_name: leadName, lead_phone: leadPhone, property_id: propertyId ?? null, scheduled_at: scheduledAt.toISOString() } })

      if (!assignedBrokerId) {
        emit({ level: "warn", category: "ai", event_type: "APPOINTMENT_NO_BROKER", message: "Appointment created without broker — lead not yet assigned by roleta", metadata: { lead_id: leadId, property_id: propertyId ?? null } })
      }
      } // Story 75-162 — fim do bloco de sucesso do INSERT
    }

    // Story 75-163 — REMARCAR: move o appointment, ressincroniza Google, loga e notifica.
    if (rescheduleSlotUtc && apptToReschedule && conversation.org_id) {
      const newStart = rescheduleSlotUtc
      const newEnd = new Date(newStart.getTime() + VISIT_DURATION_MIN * 60_000)
      const whenStr = formatBrtDateTime(newStart)
      const { error: updErr } = await supabase
        .from("appointments")
        .update({ scheduled_at: newStart.toISOString(), status: "scheduled", notes: `Remarcada pelo cliente via Nicole (de ${apptToReschedule.fromWhen} para ${whenStr}).` })
        .eq("id", apptToReschedule.id)
      if (updErr) {
        emit({ level: "error", category: "ai", event_type: "APPOINTMENT_RESCHEDULE_FAILED", message: `Falha ao remarcar: ${updErr.message}`, metadata: { lead_id: leadId, appointment_id: apptToReschedule.id } })
      } else {
        // Google: sem update in-place → apaga o antigo e cria o novo (best-effort).
        if (createCalendarEvent) {
          try {
            if (apptToReschedule.googleEventId && deleteCalendarEvent) await deleteCalendarEvent(apptToReschedule.googleEventId)
            const googleEventId = await createCalendarEvent({
              title: `Visita ao decorado${leadName ? ` — ${leadName}` : ""}`,
              description: `Visita remarcada pela Nicole.${leadPhone ? ` Telefone: ${leadPhone}.` : ""}`,
              startAt: newStart,
              endAt: newEnd,
            })
            await supabase.from("appointments").update({ google_event_id: googleEventId ?? null }).eq("id", apptToReschedule.id)
          } catch (err) {
            emit({ level: "warn", category: "ai", event_type: "GOOGLE_CALENDAR_PUSH_FAILED", message: "Falha ao ressincronizar Google (remarcação)", metadata: { lead_id: leadId, appointment_id: apptToReschedule.id, error: String(err) } })
          }
        }
        // Story 75-196: remarcação também garante "Visita Agendada" (ex.: lead
        // em No-show que remarca volta para a etapa; guard nunca regride).
        const { error: reschedStageErr } = await advanceToVisitaAgendada(supabase, leadId)
        if (reschedStageErr) {
          emit({ level: "warn", category: "ai", event_type: "STAGE_ADVANCE_FAILED", message: `Falha ao mover lead para Visita Agendada (remarcação): ${reschedStageErr}`, metadata: { lead_id: leadId, appointment_id: apptToReschedule.id } })
        }
        leadPatch.visit_scheduled_at = newStart.toISOString()
        await supabase.from("activities").insert({ org_id: conversation.org_id, lead_id: leadId, type: "appointment_updated", description: `Nicole remarcou a visita de ${apptToReschedule.fromWhen} para ${whenStr} (a pedido do cliente).` })
        emit({ level: "info", category: "ai", event_type: "APPOINTMENT_RESCHEDULED", message: `Visit rescheduled to ${whenStr}`, metadata: { lead_id: leadId, appointment_id: apptToReschedule.id, broker_user_id: apptToReschedule.brokerId, notification_broker_user_id: apptToReschedule.brokerId, lead_name: leadName, lead_phone: leadPhone, from: apptToReschedule.fromWhen, to: whenStr, scheduled_at: newStart.toISOString() } })
      }
    }

    // Story 75-163 — CANCELAR: soft-cancel, remove do Google, loga e notifica.
    if (apptToCancel && conversation.org_id) {
      const { error: cancErr } = await supabase
        .from("appointments")
        .update({ status: "cancelled", notes: `Cancelada pelo cliente via Nicole (era ${apptToCancel.when}).` })
        .eq("id", apptToCancel.id)
      if (cancErr) {
        emit({ level: "error", category: "ai", event_type: "APPOINTMENT_CANCEL_FAILED", message: `Falha ao cancelar: ${cancErr.message}`, metadata: { lead_id: leadId, appointment_id: apptToCancel.id } })
      } else {
        if (apptToCancel.googleEventId && deleteCalendarEvent) {
          try {
            await deleteCalendarEvent(apptToCancel.googleEventId)
          } catch (err) {
            emit({ level: "warn", category: "ai", event_type: "GOOGLE_CALENDAR_PUSH_FAILED", message: "Falha ao remover do Google (cancelamento)", metadata: { lead_id: leadId, appointment_id: apptToCancel.id, error: String(err) } })
          }
        }
        leadPatch.visit_scheduled_at = null
        await supabase.from("activities").insert({ org_id: conversation.org_id, lead_id: leadId, type: "appointment_cancelled", description: `Nicole cancelou a visita de ${apptToCancel.when} (a pedido do cliente).` })
        emit({ level: "info", category: "ai", event_type: "APPOINTMENT_CANCELLED", message: `Visit cancelled (was ${apptToCancel.when})`, metadata: { lead_id: leadId, appointment_id: apptToCancel.id, broker_user_id: apptToCancel.brokerId, notification_broker_user_id: apptToCancel.brokerId, lead_name: leadName, lead_phone: leadPhone, was: apptToCancel.when } })
      }
    }

    // Handoff — SINAL de compra, não silêncio. Story 75-187: a Nicole NUNCA se
    // cala sozinha por conteúdo — quem entrega o lead ao humano é a roleta (por
    // tempo) ou um humano agindo (broker_reply/manual). Aqui só registramos o
    // sinal (activity + resumo rico) e seguimos atendendo. Story 73-1: NÃO move
    // etapa — o corretor reposiciona o card manualmente.
    if (handoffResult.trigger && conversation.org_id) {
      leadPatch.ai_summary = handoffSummary

      // Story 75-361 — esta consulta vem ANTES do INSERT de propósito: depois
      // dele a própria activity desta rodada apareceria como "já avisado" e o
      // corretor nunca seria chamado.
      let primeiraEscalacaoDePreco = false
      if (handoffResult.motivo === "preco_insistencia") {
        const { data: jaAvisado } = await supabase
          .from("activities")
          .select("id")
          .eq("lead_id", leadId)
          .eq("type", "handoff")
          .eq("metadata->>motivo", "preco_insistencia")
          .limit(1)
          .maybeSingle()
        primeiraEscalacaoDePreco = !jaAvisado
      }

      await supabase.from("activities").insert({
        org_id: conversation.org_id,
        lead_id: leadId,
        type: "handoff",
        description: `Handoff: ${handoffResult.reason}`,
        metadata: {
          reason: handoffResult.reason,
          qualification_score: updatedScore,
          // Story 75-361 — é por esta chave que a escalação de preço sabe que já
          // avisou o corretor uma vez. Sem ela a dedupe não tem em que se apoiar.
          motivo: handoffResult.motivo ?? null,
        },
      })

      emit({ level: "info", category: "ai", event_type: "HANDOFF_TRIGGERED", message: `Handoff: ${handoffResult.reason} (score=${updatedScore})`, metadata: { lead_id: leadId, reason: handoffResult.reason, score: updatedScore, property_id: identifiedPropertyId, motivo: handoffResult.motivo ?? null } })

      // Story 75-361 — insistência em preço é o único gatilho que CHAMA GENTE.
      //
      // Os outros seguem como sempre (registram o sinal e a Nicole continua
      // atendendo — 75-187: ela nunca se cala sozinha). Este avisa o corretor,
      // porque sem isso a story não muda nada do que foi medido: nas 8 conversas
      // piores, 4 nunca tiveram uma fala de corretor, e `notifyBrokerOnReply`
      // (63-12) só dispara para quem JÁ assumiu a conversa — exatamente quem não
      // é o caso aqui.
      //
      // UMA vez por lead: senão o caso da Maria Inês (7 pedidos) viraria 6 pushes.
      // A dedupe é no BANCO (`activities`), não em estado de conversa, para
      // sobreviver a reprocessamento e a troca de conversa do mesmo lead.
      if (primeiraEscalacaoDePreco) {
        emit({
          level: "warn",
          category: "ai",
          event_type: "PRECO_INSISTENCIA_ESCALADA",
          message: `Lead pediu preço ${pedidosDePrecoDoLead}x sem receber número — chamando o corretor`,
          metadata: {
            lead_id: leadId,
            lead_name: leadName,
            broker_user_id: currentLead?.assigned_broker_id ?? null,
            pedidos: pedidosDePrecoDoLead,
          },
        })
      }
    }

    // Regra (Story 75-56, generaliza 65-1): a Nicole NUNCA escreve etapa.
    // Defesa em profundidade — remove incondicionalmente qualquer stage_id que
    // tenha entrado no patch, com ou sem corretor atribuído.
    guardStageForAssignedLead(leadPatch, currentLead?.assigned_broker_id)

    // ONE single update with all accumulated changes
    if (Object.keys(leadPatch).length > 0) {
      await supabase.from("leads").update(leadPatch).eq("id", leadId)
    }
  }

  // 11. Save the user message and assistant response to the messages table
  await saveMessages(supabase, conversationId, message, assistantMessage)

  // 12. Update conversation state with new collected data
  await updateConversationState(supabase, conversationId, {
    collected_data: finalData,
    qualification_step: updatedStep,
    current_property_id: identifiedPropertyId ?? state?.current_property_id ?? null,
    ...(nicoleInvitedVisit ? { visit_proposed: true } : {}),
  })

  // 12.5 Memory system — regex extraction + lead_facts + Haiku batch (MemPalace-inspired)
  // Story 75-187: roda também quando o handoff (sinal) dispara — a Nicole continua
  // atendendo, então a memória continua sendo alimentada.
  if (conversation?.lead_id) {
    const leadId = conversation.lead_id

    // 12.5a Deterministic regex extraction → lead_facts (zero-cost, every message)
    try {
      const extractedFacts = extractFactsFromMessage(message)
      for (const fact of extractedFacts) {
        // Temporal invalidation: expire old fact if predicate changes
        await supabase
          .from("lead_facts")
          .update({ valid_to: new Date().toISOString() })
          .eq("lead_id", leadId)
          .eq("predicate", fact.predicate)
          .is("valid_to", null)
          .neq("object", fact.object)

        // Insert new fact (only if different from current active)
        const { data: existing } = await supabase
          .from("lead_facts")
          .select("id")
          .eq("lead_id", leadId)
          .eq("predicate", fact.predicate)
          .eq("object", fact.object)
          .is("valid_to", null)
          .limit(1)
          .maybeSingle()

        if (!existing) {
          await supabase.from("lead_facts").insert({
            lead_id: leadId,
            predicate: fact.predicate,
            object: fact.object,
            confidence: fact.confidence,
          })
        }
      }
    } catch (err) {
      console.error("Regex extraction failed (non-blocking):", err)
    }

    // 12.5b Haiku memory update — every 5 messages (batch mode)
    // Count recent messages to decide if it's time for a Haiku pass
    const { count: msgCount } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId)

    const shouldRunHaiku = (msgCount ?? 0) % 5 === 0

    if (shouldRunHaiku) {
      // Story 87-7 — a gravação do `ai_summary` passou INTEIRA para
      // `atualizarResumoComLastro`: ela injeta o `FATO DE AGENDA` vindo de
      // `appointments`, rotula a fala da Nicole como contexto (não como fato) e
      // BARRA a escrita quando o resumo afirma visita que o banco não tem.
      //
      // Continua fire-and-forget e fora do caminho da resposta — o guarda
      // decide se GRAVA, nunca o que ela FALA (`W3-3` é outra onda).
      atualizarResumoComLastro({
        supabase,
        anthropic,
        leadId,
        conversationId,
        orgId,
        currentSummary,
        userMessage: message,
        assistantMessage,
        collectedData: finalData,
        onEvent: emit,
      }).catch((err) => console.error("Lead memory update failed:", err))
    }

    // 12.5c Memory fragments → lead_memories (async, non-blocking)
    processConversationTurn(supabase, anthropic, leadId, message, assistantMessage)
      .catch((err) => console.error("Memory writer failed (non-blocking):", err))
  }

  // 13. Return response with metadata
  return {
    response: assistantMessage,
    handoff: handoffResult.trigger
      ? {
          trigger: true,
          reason: handoffResult.reason,
          summary: handoffSummary,
        }
      : undefined,
    qualificationScore: updatedScore,
  }
}

async function loadConversationState(
  supabase: SupabaseClient,
  conversationId: string
): Promise<ConversationState | null> {
  const { data, error } = await supabase
    .from("conversation_state")
    .select("*")
    .eq("conversation_id", conversationId)
    .single()

  if (error || !data) {
    return null
  }

  return data as ConversationState
}

async function loadAgentConfig(
  supabase: SupabaseClient,
  orgId: string
): Promise<AgentConfig> {
  const { data, error } = await supabase
    .from("agent_config")
    .select(
      "personality_prompt, guardrails, model_primary, temperature, max_tokens, business_hours, greeting_message, out_of_hours_message"
    )
    .eq("org_id", orgId)
    .eq("is_active", true)
    .single()

  if (error || !data) {
    return {
      personality_prompt: null,
      guardrails: [],
      model_primary: ANTHROPIC_MODELS.sonnet46,
      temperature: 0.7,
      max_tokens: 1024,
      greeting_message: null,
      out_of_hours_message: null,
      prompt_overrides: {},
    }
  }

  // Story 53-1 — segunda query: overrides de prompt por slug (tabela agent_prompts).
  // Retorna array (0..N linhas) → NÃO usar .single()/.maybeSingle().
  const { data: promptRows } = await supabase
    .from("agent_prompts")
    .select("slug, content")
    .eq("org_id", orgId)
    .eq("is_active", true)

  const prompt_overrides: DbPromptOverrides = {}
  for (const row of (promptRows ?? []) as Array<{ slug: string; content: string | null }>) {
    // Apenas slugs com conteúdo não-vazio entram nos overrides; o resto
    // cai no fallback hard-coded em buildStaticSystemContent.
    if (row.content?.trim()) {
      prompt_overrides[row.slug as keyof DbPromptOverrides] = row.content
    }
  }

  return {
    personality_prompt: data.personality_prompt,
    guardrails: Array.isArray(data.guardrails) ? data.guardrails : [],
    model_primary: data.model_primary ?? ANTHROPIC_MODELS.sonnet46,
    temperature: data.temperature ?? 0.7,
    max_tokens: data.max_tokens ?? 1024,
    business_hours: data.business_hours as
      | Record<string, { start: string; end: string }>
      | undefined,
    greeting_message: data.greeting_message ?? null,
    out_of_hours_message: data.out_of_hours_message ?? null,
    prompt_overrides,
  }
}

/**
 * A lista de empreendimentos que a Nicole pode usar NESTE turno.
 *
 * Story 87-13 — exportada para que `config-surfaces.test.ts` prove, contra o
 * `loadProperties` DE PRODUÇÃO, que `properties.nicole_enabled` chega ao runtime.
 * Uma prova que reimplementasse a query provaria a reimplementação, não o campo.
 *
 * Alimenta TRÊS consumidores no mesmo turno (`:537-556`, `:625`): `identifyProperty`
 * (reconhecimento do nome), `checkYardenGate` e `buildPropertyDataContext` (o texto
 * que vai ao contexto). Filtrar aqui, na origem, é o que mantém os três coerentes:
 * não existe estado em que ela reconheça um empreendimento sobre o qual não pode falar.
 */
export async function loadProperties(
  supabase: SupabaseClient,
  orgId: string
): Promise<Property[]> {
  const { data, error } = await supabase
    .from("properties")
    .select(`
      id, name, slug, status, address, neighborhood, city, state,
      concept, description, amenities, differentials, delivery_date,
      total_units, total_floors, units_per_floor, commercial_rules, faq,
      typologies(name, private_area_m2, bedrooms, suites, has_balcony, balcony_bbq),
      units(status)
    `)
    .eq("org_id", orgId)
    // `is_active` é o SOFT DELETE da tabela (`api-utils.ts:29-49`), não "visível
    // para a Nicole". Ele responde "não foi excluído" — nada mais.
    .eq("is_active", true)
    // Story 87-13 — e ESTE responde "alguém decidiu que ela pode falar dele".
    // Sem esta linha, cadastrar um empreendimento bastava para pô-lo na boca dela
    // no mesmo turno. Default da coluna: `false`. Cadastrar não liga.
    .eq("nicole_enabled", true)

  if (error || !data) {
    // ⚠️ FALHA MUDA: coluna inexistente ⇒ erro do PostgREST ⇒ "nenhum
    // empreendimento", sem log e sem exceção. É por isso que a migration 223 é
    // pré-requisito do deploy, e não por costume (Risco 1 da story).
    return []
  }

  return data.map((p) => {
    const units = (p.units ?? []) as Array<{ status: string }>
    return {
      ...p,
      typologies: (p.typologies ?? []) as Property["typologies"],
      available_units: units.filter((u) => u.status === "available").length,
      reserved_units: units.filter((u) => u.status === "reserved").length,
      sold_units: units.filter((u) => u.status === "sold").length,
      units: undefined,
    } as Property
  })
}

/**
 * Builds the system prompt for Anthropic API as an array of TextBlockParam.
 *
 * Returns:
 *  - Block 1 (cacheable, cache_control: ephemeral): the 8 static segments from
 *    `buildPromptFromCode()` — IDIOMA + SEDE + PERSONALITY + GUARDRAILS +
 *    QUALIFICATION + PROPERTY_PRESENTATION + VISIT_SCHEDULING + LEMBRETE FINAL.
 *  - Block 2 (dynamic, no cache): RAG context block (if ragContext present) +
 *    CONVERSATION CONTEXT (qualification step, collected data, visit_proposed).
 *
 * The caller then appends an extra dynamic block for per-conversation contexts
 * (date/time, property data, memory, no-show, flow, yarden gate).
 */
function buildSystemPrompt(
  config: AgentConfig,
  ragContext: string,
  state: ConversationState | null,
  emit: (event: PipelineEvent) => void,
  mediaContext?: MediaAvailability
): Anthropic.Messages.TextBlockParam[] {
  // Static blocks (cacheable) + optional RAG block (uncached) come from buildPromptFromCode.
  // Story 53-1 — passa os overrides do banco (config.prompt_overrides) como 3º arg;
  // buildPromptFromCode aplica fallback hard-coded onde não há override.
  const promptBlocks = buildPromptFromCode(
    ragContext,
    {
      onWarning: (warning) => {
        emit({
          level: "warn",
          category: "ai",
          event_type: warning.code,
          message: warning.message,
          metadata: warning.metadata,
        })
      },
    },
    config.prompt_overrides
  )

  // Build CONVERSATION CONTEXT (dynamic — varies per turn).
  // Story 75-157: linha honesta de MATERIAL VISUAL (só a Nicole afirma envio real).
  const mediaLine = mediaContextLine(mediaContext)
  const convoLines: string[] = []
  if (state) {
    convoLines.push("=== CONVERSATION CONTEXT ===")
    if (state.qualification_step) {
      convoLines.push(`Current qualification step: ${state.qualification_step}`)
    }
    if (state.collected_data && Object.keys(state.collected_data).length > 0) {
      convoLines.push(
        `Data collected so far: ${JSON.stringify(state.collected_data)}`
      )
    }
    if (state.visit_proposed) {
      const collected = state.collected_data as Record<string, unknown> | undefined
      if (collected?.visit_explicitly_confirmed) {
        convoLines.push(
          "VISITA CONFIRMADA PELO CLIENTE! O lead confirmou dia e horario. NAO pergunte novamente quando ele quer ir. A visita esta marcada. Se ele perguntar algo, responda normalmente."
        )
        convoLines.push(`Data confirmada pelo cliente: ${String(collected.visit_explicitly_confirmed)}`)
      } else {
        convoLines.push(
          "VOCE JA PERGUNTOU AO CLIENTE SOBRE A VISITA. Aguarde a resposta. NAO pergunte novamente sobre interesse em visitar — voce ja perguntou. Se o cliente der um dia especifico com confirmacao positiva, anote e confirme o agendamento."
        )
      }
    }
    if (mediaLine) convoLines.push(mediaLine)
    convoLines.push("=== END CONVERSATION CONTEXT ===")
  } else if (mediaLine) {
    // Sem state ainda (conversa nova), mas o lead já pediu material: emite só a
    // linha de MATERIAL VISUAL para a fala não prometer envio indevido.
    convoLines.push("=== CONVERSATION CONTEXT ===", mediaLine, "=== END CONVERSATION CONTEXT ===")
  }

  // Preserve legacy behavior: original code appended raw ragContext at the end
  // in addition to the formatted CONTEXTO DA BASE DE CONHECIMENTO block already
  // added by buildPromptFromCode. We keep this duplication to avoid functional
  // regression (AC 7), but emit it as a dynamic block (no cache).
  const dynamicLines: string[] = []
  if (convoLines.length > 0) dynamicLines.push(convoLines.join("\n"))
  if (ragContext) dynamicLines.push(ragContext)

  if (dynamicLines.length === 0) return promptBlocks

  const dynamicBlock: Anthropic.Messages.TextBlockParam = {
    type: "text",
    text: dynamicLines.join("\n\n"),
  }

  return [...promptBlocks, dynamicBlock]
}

/** Story 75-347 — rótulos legíveis. Enviar "ate_3m" cru para o modelo é ruído. */
const FINALIDADE_LABEL: Record<string, string> = {
  moradia: "moradia (para morar)",
  investimento: "investimento",
  ambos: "moradia e investimento",
}
const PRAZO_LABEL: Record<string, string> = {
  imediato: "imediato",
  ate_3m: "até 3 meses",
  "3_6m": "3 a 6 meses",
  mais_6m: "mais de 6 meses",
}

function buildLeadContext(params: {
  name: string | null
  source: string | null
  qualificationStatus: string | null
  utmCampaign: string | null
  utmSource: string | null
  finalidade?: string | null
  prazoCompra?: string | null
}): string {
  const lines: string[] = []
  if (params.name) lines.push(`Nome: ${params.name}`)
  if (params.source) lines.push(`Fonte: ${params.source}`)
  if (params.utmCampaign) lines.push(`Campanha: ${params.utmCampaign}`)
  if (params.utmSource) lines.push(`Origem UTM: ${params.utmSource}`)
  if (params.finalidade) {
    lines.push(`Finalidade: ${FINALIDADE_LABEL[params.finalidade] ?? params.finalidade}`)
  }
  if (params.prazoCompra) {
    lines.push(`Prazo de compra: ${PRAZO_LABEL[params.prazoCompra] ?? params.prazoCompra}`)
  }
  if (params.qualificationStatus && params.qualificationStatus !== "not_started") {
    lines.push(`Status de qualificação: ${params.qualificationStatus}`)
  }

  if (lines.length === 0) return ""

  return (
    "\n<lead_context>\n" +
    lines.join("\n") +
    "\n</lead_context>\n\n" +
    "=== PERSONALIZATION RULES ===\n" +
    "1. Se o NOME do lead está preenchido acima, use-o e NÃO pergunte o nome novamente.\n" +
    "2. Se a FONTE indica campanha (meta_ads, google_ads), o lead já demonstrou interesse — pule apresentações genéricas.\n" +
    "3. NÃO repita informações que já constam no lead_context.\n" +
    // Story 75-347 — a regra que impede a repergunta e define o ângulo da conversa.
    "4. Se a FINALIDADE está preenchida acima, NÃO pergunte de novo — e use o ângulo dela: moradia fala de rotina, família e entrega; investimento fala de valorização, locação e momento de compra.\n" +
    "5. Se o PRAZO DE COMPRA está preenchido acima, NÃO pergunte de novo.\n" +
    "=== END PERSONALIZATION RULES ===\n"
  )
}

function buildFlowContext(
  qualificationStep: string,
  qualificationScore: number,
  identifiedPropertyId: string | null
): string {
  const parts: string[] = []

  parts.push("")
  parts.push("=== FLOW CONTEXT ===")
  parts.push(`Qualification score: ${qualificationScore}/100`)
  parts.push(`Next qualification step: ${qualificationStep}`)

  if (identifiedPropertyId) {
    parts.push(`Identified property ID: ${identifiedPropertyId}`)
  }

  if (qualificationScore >= 70) {
    parts.push(
      "NOTA: Lead com alta qualificacao. Priorize agendar visita ou transferir para corretor."
    )
  }

  parts.push("=== END FLOW CONTEXT ===")

  return parts.join("\n")
}

async function saveMessages(
  supabase: SupabaseClient,
  conversationId: string,
  _userMessage: string,
  assistantMessage: string
): Promise<void> {
  // Only save assistant response — user message is already saved by the webhook handler
  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    role: "assistant",
    content: assistantMessage,
  })

  if (error) {
    console.error("Error saving messages:", error)
  }
}

async function updateConversationTimestamp(
  supabase: SupabaseClient,
  conversationId: string
): Promise<void> {
  const { error } = await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId)

  if (error) {
    console.error("Error updating conversation timestamp:", error)
  }
}

async function updateConversationState(
  supabase: SupabaseClient,
  conversationId: string,
  updates: {
    collected_data: Record<string, unknown>
    qualification_step: string
    current_property_id: string | null
    visit_proposed?: boolean
  }
): Promise<void> {
  const upsertPayload: Record<string, unknown> = {
    conversation_id: conversationId,
    collected_data: updates.collected_data,
    qualification_step: updates.qualification_step,
    current_property_id: updates.current_property_id,
    updated_at: new Date().toISOString(),
  }
  if (updates.visit_proposed !== undefined) {
    upsertPayload.visit_proposed = updates.visit_proposed
  }

  const { error } = await supabase
    .from("conversation_state")
    .upsert(upsertPayload, { onConflict: "conversation_id" })

  if (error) {
    console.error("Error updating conversation state:", error)
  }
}

// Abaixo deste % vendido, "ja vendemos X" nao gera escassez (soaria abundancia):
// usar enquadramento de oportunidade de lancamento (Story 75-65). Ajustavel.
const SCARCITY_SOLD_THRESHOLD = 40

export function buildPropertyDataContext(
  properties: Property[],
  identifiedPropertyId: string | null
): string {
  if (properties.length === 0) return ""

  const parts: string[] = ["\nDADOS ATUALIZADOS DOS EMPREENDIMENTOS (use estas informacoes para responder com precisao):"]

  for (const p of properties) {
    // If a property is identified, show full details for it; summary for others
    const isSelected = p.id === identifiedPropertyId
    const statusMap: Record<string, string> = {
      planning: "Em planejamento",
      launching: "Pre-lancamento",
      selling: "Em comercializacao",
      delivered: "Entregue",
      sold_out: "Esgotado",
    }

    parts.push(`\n${p.name} (${statusMap[p.status ?? ""] ?? p.status})`)

    // Story 75-281 — empreendimento em PLANEJAMENTO fica no contexto para a Nicole
    // RECONHECER o nome (identify-property usa esta mesma lista, pipeline.ts:539) e
    // vincular o lead. Mas nao pode ser oferecido: normalmente ainda nao tem endereco,
    // planta, preco nem previsao definidos.
    if (p.status === "planning") {
      parts.push(
        "ATENCAO — EM PLANEJAMENTO: NAO ofereca, NAO sugira e NAO apresente este empreendimento por " +
          "iniciativa propria. Se o lead perguntar por ele: diga que esta em planejamento, que as " +
          "informacoes (plantas, valores, metragens e previsao de entrega) ainda NAO foram liberadas, " +
          "registre o interesse e ofereca avisar assim que o lancamento for anunciado. NUNCA invente " +
          "planta, preco, metragem, numero de unidades ou previsao de entrega deste empreendimento."
      )
    }

    parts.push(`Endereco: ${p.address ?? ""}${p.neighborhood ? ", " + p.neighborhood : ""} - ${p.city ?? ""}/${p.state ?? ""}`)

    if (p.concept) parts.push(`Conceito: ${p.concept}`)
    if (p.delivery_date) {
      const d = new Date(p.delivery_date)
      const semester = d.getMonth() < 6 ? "primeiro" : "segundo"
      parts.push(`Previsao de entrega: ${semester} semestre de ${d.getFullYear()} (NUNCA diga data exata, sempre diga "previsao" ou "estimativa")`)
    }

    // Estoque (SEMPRE mostrar) — enquadrado por estagio de vendas, nunca como abundancia.
    // A copy fica a cargo do prompt (PROPERTY_PRESENTATION_PROMPT, secao ESCASSEZ E EXCLUSIVIDADE).
    // - maduro/bem vendido (>= SCARCITY_SOLD_THRESHOLD): ancora no quanto JA FOI VENDIDO (Story 75-64).
    // - lancamento/poucas vendas (< threshold ou pre-lancamento): enquadra como oportunidade de lancamento,
    //   pois "0% vendido / restam N" soaria abundancia (Story 75-65).
    const totalU = p.total_units ?? 0
    const soldU = p.sold_units ?? 0
    const availU = p.available_units ?? 0
    const isPreLaunch = p.status === "planning" || p.status === "launching"
    const pctSold = totalU > 0 ? Math.round((soldU / totalU) * 100) : 0
    // Story 75-281: pre-lancamento com total_units preenchido mas nenhuma unidade
    // cadastrada caia aqui e a Nicole dizia "ESGOTADO". Planejamento/pre-lancamento
    // sem unidades nao esta esgotado — esta sem estoque cadastrado.
    if (totalU > 0 && availU === 0 && !isPreLaunch) {
      parts.push("Estoque: ESGOTADO (sem unidades disponiveis) — ofereca lista de espera / proximos lancamentos.")
    } else if (totalU > 0 && !isPreLaunch && pctSold >= SCARCITY_SOLD_THRESHOLD) {
      parts.push(`Estoque (use com SUTILEZA para exclusividade/escassez, NUNCA como abundancia nem numero cru): ${soldU} de ${totalU} unidades ja vendidas (${pctSold}% vendido), restam apenas ${availU} disponiveis`)
    } else if (totalU > 0) {
      parts.push("Estoque (LANCAMENTO/fase inicial — NUNCA cite quantas restam nem o % vendido baixo, soa abundancia): enquadre como oportunidade de entrar cedo (melhores plantas/andares/condicoes de lancamento), exclusividade e valorizacao.")
    } else if (availU > 0) {
      parts.push(`Estoque (use com SUTILEZA, NUNCA como abundancia): restam apenas ${availU} unidades disponiveis`)
    }

    if (p.total_floors) parts.push(`Andares: ${p.total_floors} total (${p.units_per_floor ?? 0} por andar)`)

    // Tipologias
    if (p.typologies && p.typologies.length > 0) {
      const tipoTexts = p.typologies.map((t) => {
        let desc = `${t.name}: ${t.private_area_m2}m2, ${t.bedrooms} quartos, ${t.suites} suites`
        if (t.has_balcony) desc += ", sacada"
        if (t.balcony_bbq) desc += " com churrasqueira"
        return desc
      })
      parts.push(`Tipologias: ${tipoTexts.join(" | ")}`)
    }

    // Amenidades
    if (p.amenities && (p.amenities as string[]).length > 0) {
      parts.push(`Lazer: ${(p.amenities as string[]).join(", ")}`)
    }

    // Regras comerciais
    if (p.commercial_rules) {
      const rules = p.commercial_rules as Record<string, unknown>
      if (rules.requires_down_payment) {
        parts.push("IMPORTANTE: Exige entrada para compra")
      }
    }

    // FAQ (se tiver e for o empreendimento selecionado)
    if (isSelected && p.faq && (p.faq as unknown[]).length > 0) {
      parts.push("FAQ aprovado:")
      for (const item of p.faq as Array<{ question: string; answer: string }>) {
        if (item.question && item.answer) {
          parts.push(`  P: ${item.question} R: ${item.answer}`)
        }
      }
    }
  }

  return parts.join("\n")
}
