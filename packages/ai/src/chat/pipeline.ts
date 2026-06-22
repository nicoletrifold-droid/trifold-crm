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
  calculateQualificationScore,
  getNextQualificationStep,
  extractCollectedData,
  extractVisitConfirmation,
  checkYardenGate,
  shouldHandoff,
  generateHandoffSummary,
  updateLeadMemory,
  guardStageForAssignedLead,
} from "../flows"
import { extractFactsFromMessage } from "../flows/memory-extraction"
import { parseDayParts, parseTimeParts, evaluateSlot, dayPartsToIso, isoToDayParts, checkSlotAvailability, VISIT_DURATION_MIN } from "../flows/visit-slot"
import { loadMemoryContext } from "../memory/loader"
import { processConversationTurn } from "../memory/writer"
import { buildSystemPrompt as buildPromptFromCode, OFF_HOURS_PROMPT } from "../prompts"
import type { DbPromptOverrides } from "../prompts"
import { isBusinessHours } from "../utils/business-hours"
import { STAGE_IDS } from "@trifold/shared"

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
 */
export function buildNoReintroContext(
  history: Array<{ role: string }>
): string {
  return history.some((m) => m.role === "assistant")
    ? "\nIMPORTANTE: Voce JA se apresentou a este lead anteriormente. NAO diga 'Sou a Nicole' ou qualquer variacao de apresentacao. Continue a conversa naturalmente, sem introducao.\n"
    : ""
}

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

interface Message {
  role: "user" | "assistant"
  content: string
}

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
  attendeeEmail?: string
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
}

export interface ProcessMessageResult {
  response: string
  handoff?: {
    trigger: boolean
    reason?: string
    summary?: string
  }
  qualificationScore: number
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

  // 3. Load conversation history (last 20 messages)
  const history = await loadConversationHistory(supabase, conversationId)

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

  // 6.5 Get current lead summary + stage for context
  let currentSummary: string | null = null
  let leadStageId: string | null = null
  let leadName: string | null = null
  let leadPhone: string | null = null
  let leadSource: string | null = null
  let leadQualStatus: string | null = null
  let leadUtmCampaign: string | null = null
  let leadUtmSource: string | null = null
  if (conversation?.lead_id) {
    const { data: leadData } = await supabase
      .from("leads")
      .select("ai_summary, stage_id, name, phone, source, qualification_status, utm_source, utm_campaign")
      .eq("id", conversation.lead_id)
      .single()
    currentSummary = leadData?.ai_summary ?? null
    leadStageId = leadData?.stage_id ?? null
    leadName = leadData?.name ?? null
    leadPhone = leadData?.phone ?? null
    leadSource = leadData?.source ?? null
    leadQualStatus = leadData?.qualification_status ?? null
    leadUtmCampaign = leadData?.utm_campaign ?? null
    leadUtmSource = leadData?.utm_source ?? null
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
      })
    : ""

  // No-Show context — empathetic re-engagement
  const noShowContext = leadStageId === STAGE_IDS.no_show
    ? "\n=== NO-SHOW CONTEXT ===\nEste lead faltou a uma visita agendada anteriormente. Seja empatica, NAO culpe e NAO mencione \"falta\" ou \"nao compareceu\". Pergunte naturalmente se quer remarcar: algo como \"Vi que nao conseguimos nos encontrar, quer marcar outro dia?\". Se o lead mencionar um dia, agende normalmente.\n=== END NO-SHOW CONTEXT ===\n"
    : ""

  // No-reintro context — Story 59-1 (AC1, AC4, AC5)
  const noReintroContext = buildNoReintroContext(history)

  // Build the system prompt as Anthropic block array.
  //
  // - `staticBlocks` = blocos cacheáveis (8 segmentos estáticos com cache_control: ephemeral)
  //                    + bloco RAG opcional sem cache (vindo de buildPromptFromCode).
  // - `dynamicSuffix` = todos os contextos por-conversa (data/hora, property data,
  //   memória do lead, no-show, flow, yarden gate). Concatenados em UM bloco
  //   sem cache_control. Story 21.2 (lead context) deve ser incluída aqui.
  const staticBlocks = buildSystemPrompt(agentConfig, ragContext, state, emit)
  const dynamicSuffix =
    dateTimeContext +
    propertyDataContext +
    leadContext +
    memoryContext +
    noShowContext +
    noReintroContext +
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
  if (state?.visit_proposed && conversation?.lead_id) {
    // 1) Já existe visita futura para este lead? → só lembrar (nunca duplicar).
    const { data: activeAppointment } = await supabase
      .from("appointments")
      .select("scheduled_at, status")
      .eq("lead_id", conversation.lead_id)
      .in("status", ["scheduled", "confirmed"])
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(1)
      .maybeSingle()

    if (activeAppointment) {
      const visitDate = new Date(activeAppointment.scheduled_at)
      const formatted = visitDate.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" })
      const hora = visitDate.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })
      messageWithContext = `[SISTEMA: Visita JÁ confirmada para ${formatted} às ${hora}. NÃO pergunte dia nem horário. Se perguntar, confirme: "Sua visita tá marcada pra ${formatted} às ${hora}, te espero lá!"]\n\n${message}`
    } else {
      // 2) Sem visita ainda → entende o dia/horário pedido (combinando com o que
      //    ficou pendente de turnos anteriores), confere a agenda interna (que inclui
      //    Calendly) e injeta o contexto para a Nicole responder certo na MESMA mensagem.
      const cd = collectedData as Record<string, unknown>
      const now = new Date()
      const curDay = parseDayParts(message, now)
      const curTime = parseTimeParts(message)
      const pendingDay = typeof cd.visit_pending_date === "string" ? isoToDayParts(cd.visit_pending_date) : null
      const pendingTime = typeof cd.visit_pending_hour === "number"
        ? { hour: cd.visit_pending_hour as number, minute: (cd.visit_pending_minute as number | undefined) ?? 0 }
        : null
      const day = curDay ?? pendingDay
      const time = curTime ?? pendingTime

      if (day && time) {
        // Dia + hora completos (no turno ou combinando com o pendente) → resolve e limpa pendência.
        delete cd.visit_pending_date
        delete cd.visit_pending_hour
        delete cd.visit_pending_minute
        const { startUtc, outsideHours } = evaluateSlot(day, time, now)
        if (startUtc) {
          const { free, alternatives } = await checkSlotAvailability(supabase, orgId, startUtc)
          const whenStr = formatBrtDateTime(startUtc)
          if (free) {
            bookableSlotUtc = startUtc
            messageWithContext = `[SISTEMA: O cliente quer a visita em ${whenStr}. Esse horário está LIVRE. Confirme a visita reafirmando o dia e o horário (${whenStr}) e diga que vai deixar o café preparado.]\n\n${message}`
          } else {
            const alts = alternatives.map(formatBrtDateTime).join(" ou ")
            messageWithContext = `[SISTEMA: O cliente pediu ${whenStr}, mas JÁ existe uma visita nesse horário. NÃO confirme esse horário. Com simpatia, avise que esse horário já está reservado e ofereça ${alts ? `estes horários livres: ${alts}` : "outro horário"}. Pergunte qual prefere.]\n\n${message}`
          }
        } else {
          messageWithContext = `[SISTEMA: O horário pedido não serve (já passou ou está fora do atendimento). Informe com gentileza que atendemos de segunda a sexta das 8h às 18h e sábado das 8h às 12h, e peça um horário válido.]\n\n${message}`
        }
      } else if (day && !time) {
        // Só o dia → guarda o dia e pergunta o horário.
        cd.visit_pending_date = dayPartsToIso(day)
        messageWithContext = `[SISTEMA: O cliente indicou o dia mas não o horário. Pergunte qual horário prefere (atendemos seg–sex 8h–18h, sáb 8h–12h).]\n\n${message}`
      } else if (time && !day) {
        // Só a hora → guarda a hora e pergunta a data (depois confirme "tal dia às tal hora").
        cd.visit_pending_hour = time.hour
        cd.visit_pending_minute = time.minute
        const horaStr = `${time.hour}h${time.minute ? String(time.minute).padStart(2, "0") : ""}`
        messageWithContext = `[SISTEMA: O cliente indicou o horário (${horaStr}) mas não o dia. Guarde esse horário, pergunte qual dia prefere e, quando ele disser, confirme reafirmando o dia e o horário. Atendemos seg–sex 8h–18h, sáb 8h–12h.]\n\n${message}`
      }
    }
  }

  userContent.push({ type: "text", text: messageWithContext })

  const messages: Anthropic.MessageParam[] = [
    ...history.map(
      (msg): Anthropic.MessageParam => ({
        role: msg.role,
        content: msg.content,
      })
    ),
    { role: "user", content: userContent },
  ]

  const claudeStart = Date.now()
  const response = await anthropic.messages.create(
    {
      model: agentConfig.model_primary,
      max_tokens: agentConfig.max_tokens,
      temperature: agentConfig.temperature,
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

  const firstBlock = response.content[0]
  const assistantMessage =
    firstBlock && firstBlock.type === "text" ? firstBlock.text : ""

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
  const updatedData = extractCollectedData(message, collectedData)

  // If Nicole already asked about a visit date, check if the client is now confirming one.
  // extractVisitConfirmation requires a day reference AND a positive signal — not just any mention.
  if (state?.visit_proposed && !updatedData.visit_explicitly_confirmed) {
    const confirmed = extractVisitConfirmation(message)
    if (confirmed) {
      ;(updatedData as Record<string, unknown>).visit_explicitly_confirmed = confirmed
    }
  }

  // Then extract non-name data from AI response (property mentions, etc — but NOT name)
  const aiExtracted = extractCollectedData(assistantMessage, updatedData)
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

  const handoffResult = shouldHandoff({
    qualificationScore: updatedScore,
    message,
    conversationState: {
      ...finalData,
      visit_proposed: state?.visit_proposed ?? false,
    },
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
      .select("stage_id, property_interest_id, assigned_broker_id")
      .eq("id", leadId)
      .single()

    // Sync property_interest_id — identifyProperty has priority, fallback only if no existing value
    if (identifiedPropertyId) {
      leadPatch.property_interest_id = identifiedPropertyId
    } else if (finalData.property_interest && !currentLead?.property_interest_id) {
      const interest = (finalData.property_interest as string).toLowerCase()
      const matchedProperty = properties.find((p) =>
        p.slug === interest || p.name.toLowerCase() === interest
      )
      if (matchedProperty) {
        leadPatch.property_interest_id = matchedProperty.id
      }
    }

    // Sync collected_data → lead fields
    if (finalData.name && (finalData.name as string).toLowerCase() !== "nicole") {
      leadPatch.name = finalData.name
    }
    if (finalData.bedrooms) leadPatch.preferred_bedrooms = finalData.bedrooms
    if (finalData.floor) leadPatch.preferred_floor = finalData.floor
    if (finalData.preferred_floor) leadPatch.preferred_floor = finalData.preferred_floor
    if (finalData.view) leadPatch.preferred_view = finalData.view
    if (finalData.preferred_view) leadPatch.preferred_view = finalData.preferred_view
    if (finalData.garages) leadPatch.preferred_garage_count = finalData.garages
    if (finalData.garage_count) leadPatch.preferred_garage_count = finalData.garage_count
    if (finalData.has_down_payment !== undefined) leadPatch.has_down_payment = finalData.has_down_payment
    if (finalData.email) leadPatch.email = finalData.email
    if (finalData.source) leadPatch.source = finalData.source
    leadPatch.qualification_score = updatedScore
    leadPatch.qualification_status = updatedScore >= 70 ? "qualified" : updatedScore > 0 ? "in_progress" : "not_started"
    leadPatch.interest_level = updatedScore >= 70 ? "hot" : updatedScore >= 40 ? "warm" : "cold"

    // Kanban stage — qualification level (lowest priority)

    if (currentLead?.stage_id === STAGE_IDS.novo && updatedScore > 0) {
      leadPatch.stage_id = STAGE_IDS.em_qualificacao
      emit({ level: "info", category: "ai", event_type: "STAGE_CHANGE", message: `Lead moved: novo → em_qualificacao (score=${updatedScore})`, metadata: { lead_id: leadId, from: "novo", to: "em_qualificacao", score: updatedScore } })
    } else if (currentLead?.stage_id === STAGE_IDS.em_qualificacao && updatedScore >= 70) {
      leadPatch.stage_id = STAGE_IDS.qualificado
      emit({ level: "info", category: "ai", event_type: "STAGE_CHANGE", message: `Lead moved: em_qualificacao → qualificado (score=${updatedScore})`, metadata: { lead_id: leadId, from: "em_qualificacao", to: "qualificado", score: updatedScore } })
    }

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

      const { data: createdAppt } = await supabase
        .from("appointments")
        .insert({
          org_id: conversation.org_id,
          lead_id: leadId,
          broker_id: assignedBrokerId,
          scheduled_at: scheduledAt.toISOString(),
          duration_minutes: VISIT_DURATION_MIN,
          location: "Sede Trifold - Av. Nildo Ribeiro da Rocha, 1337, Vila Marumby",
          status: "scheduled",
          created_by: "nicole",
          client_name: leadName,
          client_phone: leadPhone,
          client_email: clientEmail,
          notes: `Visita confirmada pelo cliente para ${whenStr}.`,
        })
        .select("id")
        .maybeSingle()

      // Empurra para o Google Calendar (fecha a brecha de duplicação com o Calendly).
      // Injetado pela camada web; best-effort — nunca derruba o agendamento.
      if (createdAppt?.id && createCalendarEvent) {
        try {
          const googleEventId = await createCalendarEvent({
            title: `Visita ao decorado${leadName ? ` — ${leadName}` : ""}`,
            description: `Visita agendada pela Nicole.${leadPhone ? ` Telefone: ${leadPhone}.` : ""}`,
            startAt: scheduledAt,
            endAt,
            attendeeEmail: clientEmail ?? undefined,
          })
          if (googleEventId) {
            await supabase.from("appointments").update({ google_event_id: googleEventId }).eq("id", createdAppt.id)
          }
        } catch (err) {
          emit({ level: "warn", category: "ai", event_type: "GOOGLE_CALENDAR_PUSH_FAILED", message: "Failed to push Nicole appointment to Google Calendar", metadata: { lead_id: leadId, appointment_id: createdAppt.id, error: String(err) } })
        }
      }

      // Story 73-1: NÃO move o lead para "Visita Agendada" — o corretor move manualmente.
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
    }

    // Handoff — entrega ao corretor. Story 73-1: NÃO move para "Visita Agendada"
    // (mesmo com visita confirmada) — o corretor reposiciona o card manualmente.
    if (handoffResult.trigger && conversation.org_id) {
      leadPatch.stage_id = STAGE_IDS.qualificado
      leadPatch.ai_summary = handoffSummary


      await supabase.from("activities").insert({
        org_id: conversation.org_id,
        lead_id: leadId,
        type: "handoff",
        description: `Handoff: ${handoffResult.reason}`,
        metadata: {
          reason: handoffResult.reason,
          qualification_score: updatedScore,
        },
      })

      emit({ level: "info", category: "ai", event_type: "HANDOFF_TRIGGERED", message: `Handoff: ${handoffResult.reason} (score=${updatedScore})`, metadata: { lead_id: leadId, reason: handoffResult.reason, score: updatedScore, property_id: identifiedPropertyId } })

      await supabase
        .from("conversations")
        .update({ is_ai_active: false, handoff_at: new Date().toISOString(), handoff_reason: handoffResult.reason })
        .eq("id", conversationId)
    }

    // Regra interna (Story 65-1): lead já distribuído a um corretor permanece
    // em "Aguardando atendimento". A Nicole não reposiciona no kanban um lead
    // que já tem dono — remove qualquer mudança de stage do patch.
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
  if (conversation?.lead_id && !handoffResult.trigger) {
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
      updateLeadMemory({
        anthropic,
        currentSummary,
        userMessage: message,
        assistantMessage,
        collectedData: finalData,
      }).then(async (newSummary) => {
        if (newSummary) {
          await supabase
            .from("leads")
            .update({ ai_summary: newSummary })
            .eq("id", leadId)
        }
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

async function loadConversationHistory(
  supabase: SupabaseClient,
  conversationId: string,
  limit: number = 20
): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: true })
    .limit(limit)

  if (error || !data) {
    return []
  }

  return data as Message[]
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
      model_primary: "claude-sonnet-4-6",
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
    model_primary: data.model_primary ?? "claude-sonnet-4-6",
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

async function loadProperties(
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
    .eq("is_active", true)

  if (error || !data) {
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
  emit: (event: PipelineEvent) => void
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
    convoLines.push("=== END CONVERSATION CONTEXT ===")
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

function buildLeadContext(params: {
  name: string | null
  source: string | null
  qualificationStatus: string | null
  utmCampaign: string | null
  utmSource: string | null
}): string {
  const lines: string[] = []
  if (params.name) lines.push(`Nome: ${params.name}`)
  if (params.source) lines.push(`Fonte: ${params.source}`)
  if (params.utmCampaign) lines.push(`Campanha: ${params.utmCampaign}`)
  if (params.utmSource) lines.push(`Origem UTM: ${params.utmSource}`)
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

function buildPropertyDataContext(
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
    parts.push(`Endereco: ${p.address ?? ""}${p.neighborhood ? ", " + p.neighborhood : ""} - ${p.city ?? ""}/${p.state ?? ""}`)

    if (p.concept) parts.push(`Conceito: ${p.concept}`)
    if (p.delivery_date) {
      const d = new Date(p.delivery_date)
      const semester = d.getMonth() < 6 ? "primeiro" : "segundo"
      parts.push(`Previsao de entrega: ${semester} semestre de ${d.getFullYear()} (NUNCA diga data exata, sempre diga "previsao" ou "estimativa")`)
    }

    // Unidades disponíveis (SEMPRE mostrar)
    parts.push(`Unidades: ${p.available_units ?? 0} disponiveis, ${p.reserved_units ?? 0} reservadas, ${p.sold_units ?? 0} vendidas (total: ${p.total_units ?? 0})`)

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
