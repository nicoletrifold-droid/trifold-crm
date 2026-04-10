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
  checkYardenGate,
  shouldHandoff,
  generateHandoffSummary,
  updateLeadMemory,
} from "../flows"
import { extractFactsFromMessage } from "../flows/memory-extraction"
import { loadMemoryContext } from "../memory/loader"
import { buildSystemPrompt as buildPromptFromCode } from "../prompts"
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

export interface ProcessMessageParams {
  supabase: SupabaseClient
  anthropic: Anthropic
  conversationId: string
  message: string
  orgId: string
  mediaBlock?: MediaBlock
  onEvent?: (event: PipelineEvent) => void
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
      const offHoursResponse =
        "Oi! Obrigada pelo contato. No momento estou fora do horario de atendimento. " +
        "Vou guardar sua mensagem e retorno assim que possivel. Ate breve!"

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
  if (conversation?.lead_id) {
    const { data: leadData } = await supabase
      .from("leads")
      .select("ai_summary, stage_id")
      .eq("id", conversation.lead_id)
      .single()
    currentSummary = leadData?.ai_summary ?? null
    leadStageId = leadData?.stage_id ?? null
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

  // No-Show context — empathetic re-engagement
  const noShowContext = leadStageId === STAGE_IDS.no_show
    ? "\n=== NO-SHOW CONTEXT ===\nEste lead faltou a uma visita agendada anteriormente. Seja empatica, NAO culpe e NAO mencione \"falta\" ou \"nao compareceu\". Pergunte naturalmente se quer remarcar: algo como \"Vi que nao conseguimos nos encontrar, quer marcar outro dia?\". Se o lead mencionar um dia, agende normalmente.\n=== END NO-SHOW CONTEXT ===\n"
    : ""

  const systemPrompt =
    buildSystemPrompt(agentConfig, ragContext, state) +
    dateTimeContext +
    propertyDataContext +
    memoryContext +
    noShowContext +
    buildFlowContext(qualificationStep, qualificationScore, identifiedPropertyId) +
    yardenGateContext

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
  if (state?.visit_proposed && conversation?.lead_id) {
    // Check if there's an active future appointment
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
      // Visita futura agendada — lembrar o modelo
      const visitDate = new Date(activeAppointment.scheduled_at)
      const formatted = visitDate.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" })
      const hora = visitDate.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })
      messageWithContext = `[SISTEMA: Visita JÁ confirmada para ${formatted} às ${hora}. NÃO pergunte dia nem horário. Se perguntar, confirme: "Sua visita tá marcada pra ${formatted} às ${hora}, te espero lá!"]\n\n${message}`
    } else {
      // Visita passou ou foi cancelada — resetar visit_proposed E limpar visit_availability
      // para evitar que o pipeline crie um novo agendamento com dados antigos
      const cleanedData = { ...collectedData }
      delete cleanedData.visit_availability
      await supabase
        .from("conversation_state")
        .update({ visit_proposed: false, collected_data: cleanedData })
        .eq("conversation_id", conversationId)
      // Sync local state
      delete collectedData.visit_availability
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
      system: systemPrompt,
      messages,
    },
    { timeout: 60000 }
  )
  const claudeDuration = Date.now() - claudeStart

  emit({ level: "info", category: "ai", event_type: "CLAUDE_RESPONSE", message: `Claude responded in ${claudeDuration}ms`, metadata: { response_time_ms: claudeDuration, input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens, model: agentConfig.model_primary } })

  const assistantMessage =
    response.content[0].type === "text" ? response.content[0].text : ""

  // 9. Extract collected data from user message FIRST (name comes from user, not AI)
  const updatedData = extractCollectedData(message, collectedData)

  // Then extract non-name data from AI response (property mentions, etc — but NOT name)
  const aiExtracted = extractCollectedData(assistantMessage, updatedData)
  // Preserve the name from user message only (AI response might say "Nicole" which is the bot name)
  const finalData: Record<string, unknown> = { ...aiExtracted, name: updatedData.name ?? collectedData.name }

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
      .select("stage_id, property_interest_id")
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

    // Visit scheduling — overrides qualification stage
    // Double-check: no existing future appointment for this lead (prevents duplicates)
    const { data: existingAppt } = await supabase
      .from("appointments")
      .select("id")
      .eq("lead_id", leadId)
      .in("status", ["scheduled", "confirmed"])
      .gte("scheduled_at", new Date().toISOString())
      .limit(1)
      .maybeSingle()

    if (finalData.visit_availability && hasConfirmedDay(finalData.visit_availability) && !state?.visit_proposed && !existingAppt && conversation.org_id) {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      if (tomorrow.getDay() === 0) tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setUTCHours(13, 0, 0, 0) // 10h Maringá = 13h UTC

      const propertyId = identifiedPropertyId ?? state?.current_property_id
      let assignedBrokerId: string | null = null

      if (propertyId) {
        const { data: assignment } = await supabase
          .from("broker_assignments")
          .select("broker_id, brokers(user_id)")
          .eq("property_id", propertyId)
          .eq("is_primary", true)
          .limit(1)
          .maybeSingle()

        if (assignment) {
          const brokers = assignment.brokers as unknown as { user_id: string } | { user_id: string }[]
          assignedBrokerId = Array.isArray(brokers) ? brokers[0]?.user_id : brokers?.user_id
        }
      }

      await supabase.from("appointments").insert({
        org_id: conversation.org_id,
        lead_id: leadId,
        broker_id: assignedBrokerId,
        scheduled_at: tomorrow.toISOString(),
        location: "Sede Trifold - Av. Nildo Ribeiro da Rocha, 1337, Vila Marumby",
        status: "scheduled",
        created_by: "nicole",
        notes: `Visita sugerida pela Nicole. Disponibilidade informada: ${String(finalData.visit_availability)}`,
      })

      leadPatch.visit_scheduled_at = tomorrow.toISOString()
      leadPatch.stage_id = STAGE_IDS.visita_agendada
      if (assignedBrokerId) leadPatch.assigned_broker_id = assignedBrokerId

      await supabase.from("activities").insert({
        org_id: conversation.org_id,
        lead_id: leadId,
        type: "visit_scheduled",
        description: `Nicole agendou visita. Disponibilidade: ${String(finalData.visit_availability)}${assignedBrokerId ? ". Corretor designado automaticamente." : ""}`,
      })

      emit({ level: "info", category: "ai", event_type: "APPOINTMENT_CREATED", message: `Visit scheduled for lead${assignedBrokerId ? " with broker" : " WITHOUT broker"}`, metadata: { lead_id: leadId, broker_assigned: !!assignedBrokerId, property_id: propertyId ?? null, scheduled_at: tomorrow.toISOString() } })

      if (!assignedBrokerId) {
        emit({ level: "warn", category: "ai", event_type: "APPOINTMENT_NO_BROKER", message: "Appointment created without broker assignment — no primary broker found for property", metadata: { lead_id: leadId, property_id: propertyId ?? null } })
      }
    }

    // Handoff — highest priority, overrides visit and qualification stage
    if (handoffResult.trigger && conversation.org_id) {
      leadPatch.stage_id = finalData.visit_availability
        ? STAGE_IDS.visita_agendada
        : STAGE_IDS.qualificado
      leadPatch.ai_summary = handoffSummary

      if (identifiedPropertyId) {
        const { data: assignment } = await supabase
          .from("broker_assignments")
          .select("broker_id, brokers(user_id)")
          .eq("property_id", identifiedPropertyId)
          .eq("is_primary", true)
          .maybeSingle()

        if (assignment) {
          const brokers = assignment.brokers as unknown as { user_id: string } | { user_id: string }[]
          const brokerId = Array.isArray(brokers) ? brokers[0]?.user_id : brokers?.user_id
          if (brokerId) leadPatch.assigned_broker_id = brokerId
        }
      }

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
      "personality_prompt, guardrails, model_primary, temperature, max_tokens, business_hours"
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

function buildSystemPrompt(
  config: AgentConfig,
  ragContext: string,
  state: ConversationState | null
): string {
  const parts: string[] = []

  // Personality + guardrails + qualification + property presentation + visit scheduling
  // ALWAYS from code (not database) to ensure latest rules are applied
  parts.push(buildPromptFromCode(ragContext))

  // Qualification context
  if (state) {
    parts.push("")
    parts.push("=== CONVERSATION CONTEXT ===")
    if (state.qualification_step) {
      parts.push(`Current qualification step: ${state.qualification_step}`)
    }
    if (
      state.collected_data &&
      Object.keys(state.collected_data).length > 0
    ) {
      parts.push(
        `Data collected so far: ${JSON.stringify(state.collected_data)}`
      )
    }
    if (state.visit_proposed) {
      parts.push("VISITA JA AGENDADA! O lead JA confirmou dia e horario. NAO pergunte novamente quando ele quer ir. NAO pergunte dia, NAO pergunte horario. A visita esta marcada. Se ele perguntar algo, responda normalmente sem mencionar agendamento.")
      if (state.collected_data && (state.collected_data as Record<string, unknown>).visit_availability) {
        parts.push(`Visita confirmada: ${(state.collected_data as Record<string, unknown>).visit_availability}`)
      }
    }
    parts.push("=== END CONVERSATION CONTEXT ===")
  }

  // RAG context
  if (ragContext) {
    parts.push("")
    parts.push(ragContext)
  }

  return parts.join("\n")
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
  }
): Promise<void> {
  const { error } = await supabase
    .from("conversation_state")
    .upsert(
      {
        conversation_id: conversationId,
        collected_data: updates.collected_data,
        qualification_step: updates.qualification_step,
        current_property_id: updates.current_property_id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "conversation_id" }
    )

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
