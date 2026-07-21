import type { SupabaseClient } from "@supabase/supabase-js"
import type { BehaviorChronologyEvent } from "@trifold/ai"

/**
 * Story 82-1 (Epic 82) — Cronologia única do lead para a Análise de
 * Comportamento IA. Junta as 7 fontes em uma lista ordenada por timestamp:
 * mensagens, notas/activities, follow-ups, tarefas, agendamentos e feedbacks
 * de visita. O bloco de perfil (observação, preferências, dados coletados)
 * é estático e vai separado.
 */

// Teto de eventos enviados ao modelo. Acima disso, corta os mais antigos
// preservando MARCOS (etapa/visita/feedback) — e loga o corte (condição @po).
const MAX_EVENTS = 400
const MILESTONE_SOURCES = new Set([
  "Mudança de etapa",
  "Agendamento",
  "Feedback de visita",
])

export interface ChronologySources {
  messages: Array<{ role: string; content: string; created_at: string }>
  activities: Array<{
    type: string
    description: string | null
    metadata: Record<string, unknown> | null
    created_at: string
    userName?: string | null
  }>
  followUps: Array<{
    type: string
    status: string
    scheduled_at: string | null
    sent_at: string | null
    message: string | null
    created_at: string
  }>
  tasks: Array<{
    title: string
    action_type: string
    due_at: string | null
    completed_at: string | null
    created_at: string
  }>
  appointments: Array<{
    scheduled_at: string
    status: string
    location: string | null
    notes: string | null
    created_at: string
  }>
  visitFeedback: Array<{
    visited_at: string
    feedback: string | null
    interest_after: string | null
    next_steps: string | null
    created_at: string
  }>
}

const MESSAGE_ROLE_LABEL: Record<string, string> = {
  user: "Mensagem (Lead)",
  assistant: "Mensagem (Nicole)",
  broker: "Mensagem (Corretor)",
  system: "Mensagem (Sistema)",
}

const APPOINTMENT_STATUS_LABEL: Record<string, string> = {
  scheduled: "agendada",
  confirmed: "confirmada",
  completed: "realizada",
  cancelled: "cancelada",
  no_show: "não compareceu (no-show)",
}

function activityEvent(a: ChronologySources["activities"][number]): BehaviorChronologyEvent {
  const who = a.userName ? ` (${a.userName})` : ""
  switch (a.type) {
    case "broker_note":
    case "note_added": {
      const acao = (a.metadata as { acao?: string } | null)?.acao
      return {
        at: a.created_at,
        source: "Nota do corretor",
        description: `${who ? who.trim().replace(/[()]/g, "") + " — " : ""}${acao ? `[${acao}] ` : ""}${a.description ?? ""}`.trim(),
      }
    }
    case "stage_change":
      return { at: a.created_at, source: "Mudança de etapa", description: a.description ?? "" }
    case "supremo_contact":
      return { at: a.created_at, source: "Contato registrado (histórico importado)", description: a.description ?? "" }
    case "lead_lost":
      return { at: a.created_at, source: "Lead marcado como perdido", description: a.description ?? "" }
    case "ai_resumed":
      return { at: a.created_at, source: "Nicole reativada", description: a.description ?? "" }
    default:
      return { at: a.created_at, source: `Atividade (${a.type})`, description: a.description ?? "" }
  }
}

/**
 * Parte PURA: monta e ordena os eventos a partir das fontes já buscadas.
 * Exportada para teste unitário (AC2).
 */
export function buildChronologyEvents(sources: ChronologySources): BehaviorChronologyEvent[] {
  const events: BehaviorChronologyEvent[] = []

  for (const m of sources.messages) {
    events.push({
      at: m.created_at,
      source: MESSAGE_ROLE_LABEL[m.role] ?? `Mensagem (${m.role})`,
      description: m.content,
    })
  }

  for (const a of sources.activities) events.push(activityEvent(a))

  for (const f of sources.followUps) {
    events.push({
      at: f.sent_at ?? f.scheduled_at ?? f.created_at,
      source: "Follow-up",
      description: `${f.type} [${f.status}]${f.message ? `: ${f.message}` : ""}`,
    })
  }

  for (const t of sources.tasks) {
    const due = t.due_at ? ` (prazo ${new Date(t.due_at).toLocaleDateString("pt-BR")})` : ""
    events.push({
      at: t.completed_at ?? t.created_at,
      source: t.completed_at ? "Tarefa concluída" : "Tarefa criada",
      description: `[${t.action_type}] ${t.title}${due}`,
    })
  }

  for (const ap of sources.appointments) {
    const when = new Date(ap.scheduled_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    events.push({
      at: ap.created_at,
      source: "Agendamento",
      description: `Visita ${APPOINTMENT_STATUS_LABEL[ap.status] ?? ap.status} para ${when}${ap.location ? ` em ${ap.location}` : ""}${ap.notes ? ` — ${ap.notes}` : ""}`,
    })
  }

  for (const vf of sources.visitFeedback) {
    const parts = [
      vf.feedback,
      vf.interest_after ? `interesse pós-visita: ${vf.interest_after}` : null,
      vf.next_steps ? `próximos passos: ${vf.next_steps}` : null,
    ].filter(Boolean)
    events.push({
      at: vf.visited_at ?? vf.created_at,
      source: "Feedback de visita",
      description: parts.join(" | ") || "Visita realizada (sem detalhes registrados)",
    })
  }

  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  return truncateChronology(events)
}

/**
 * Corte com critério: mantém todos os MARCOS + os eventos mais recentes até
 * MAX_EVENTS. Nunca corta em silêncio (condição @po da 82-1).
 */
export function truncateChronology(
  events: BehaviorChronologyEvent[],
  maxEvents: number = MAX_EVENTS
): BehaviorChronologyEvent[] {
  if (events.length <= maxEvents) return events

  const milestones = events.filter((e) => MILESTONE_SOURCES.has(e.source))
  const rest = events.filter((e) => !MILESTONE_SOURCES.has(e.source))
  const keepRest = rest.slice(-(Math.max(0, maxEvents - milestones.length)))
  const kept = [...milestones, ...keepRest].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
  )

  console.warn(
    `[behavior-chronology] cronologia truncada: ${events.length} → ${kept.length} eventos (marcos preservados: ${milestones.length})`
  )
  return kept
}

export interface LeadChronology {
  events: BehaviorChronologyEvent[]
  leadProfile: Record<string, unknown>
  currentStage: string | null
  /** timestamp do evento mais recente (staleness na UI) */
  lastEventAt: string | null
}

/**
 * Busca as fontes e monta a cronologia. O client recebido já carrega o
 * contexto de acesso (RLS por org) — a rota é responsável pelo gate de role.
 */
export async function fetchLeadChronology(
  supabase: SupabaseClient,
  leadId: string,
  orgId: string
): Promise<LeadChronology | null> {
  const { data: lead } = await supabase
    .from("leads")
    .select(
      `*, stage:kanban_stages(name), property_interest:properties!property_interest_id(name)`
    )
    .eq("id", leadId)
    .eq("org_id", orgId)
    .eq("is_active", true)
    .single()

  if (!lead) return null

  const [convs, convStates, activities, followUps, tasks, appointments, visitFeedback] =
    await Promise.all([
      supabase
        .from("conversations")
        .select(`id, channel, messages:messages(role, content, created_at)`)
        .eq("lead_id", leadId),
      supabase.from("conversation_state").select("collected_data").eq("lead_id", leadId),
      supabase
        .from("activities")
        .select("type, description, metadata, created_at, users:user_id(name)")
        .eq("lead_id", leadId)
        .eq("org_id", orgId)
        .order("created_at", { ascending: true }),
      supabase
        .from("follow_up_log")
        .select("type, status, scheduled_at, sent_at, message, created_at")
        .eq("lead_id", leadId)
        .eq("org_id", orgId),
      supabase
        .from("lead_tasks")
        .select("title, action_type, due_at, completed_at, created_at")
        .eq("lead_id", leadId)
        .eq("org_id", orgId),
      supabase
        .from("appointments")
        .select("scheduled_at, status, location, notes, created_at")
        .eq("lead_id", leadId)
        .eq("org_id", orgId),
      supabase
        .from("visit_feedback")
        .select("visited_at, feedback, interest_after, next_steps, created_at")
        .eq("lead_id", leadId),
    ])

  const messages: ChronologySources["messages"] = []
  for (const conv of convs.data ?? []) {
    const msgs = conv.messages as ChronologySources["messages"] | null
    if (msgs) messages.push(...msgs)
  }

  const events = buildChronologyEvents({
    messages,
    activities: (activities.data ?? []).map((a) => ({
      type: a.type as string,
      description: a.description as string | null,
      metadata: a.metadata as Record<string, unknown> | null,
      created_at: a.created_at as string,
      userName: (a.users as unknown as { name?: string } | null)?.name ?? null,
    })),
    followUps: (followUps.data ?? []) as ChronologySources["followUps"],
    tasks: (tasks.data ?? []) as ChronologySources["tasks"],
    appointments: (appointments.data ?? []) as ChronologySources["appointments"],
    visitFeedback: (visitFeedback.data ?? []) as ChronologySources["visitFeedback"],
  })

  const stageArr = lead.stage as unknown as Array<{ name: string }> | { name: string } | null
  const currentStage = Array.isArray(stageArr) ? (stageArr[0]?.name ?? null) : (stageArr?.name ?? null)
  const propertyArr = lead.property_interest as unknown as Array<{ name: string }> | { name: string } | null
  const propertyName = Array.isArray(propertyArr) ? (propertyArr[0]?.name ?? null) : (propertyArr?.name ?? null)

  const leadProfile: Record<string, unknown> = {
    nome: lead.name ?? null,
    telefone: lead.phone ?? null,
    email: lead.email ?? null,
    canal: lead.channel ?? null,
    origem: lead.source ?? null,
    empreendimento_interesse: propertyName,
    observacao: lead.observacao ?? null,
    finalidade: lead.finalidade ?? null,
    orcamento: lead.orcamento ?? null,
    prazo_compra: lead.prazo_compra ?? null,
    forma_pagamento: lead.forma_pagamento ?? null,
    quartos_preferidos: lead.preferred_bedrooms ?? null,
    andar_preferido: lead.preferred_floor ?? null,
    vista_preferida: lead.preferred_view ?? null,
    vagas: lead.preferred_garage_count ?? null,
    tem_entrada: lead.has_down_payment ?? null,
    score_qualificacao: lead.qualification_score ?? null,
    nivel_interesse: lead.interest_level ?? null,
    perfil: {
      profissao: lead.profissao ?? null,
      renda_familiar: lead.renda_familiar ?? null,
      filhos: lead.filhos ?? null,
      estado_civil: lead.estado_civil ?? null,
      faixa_etaria: lead.faixa_etaria ?? null,
      situacao_moradia: lead.situacao_moradia ?? null,
      cidade_bairro: lead.cidade_bairro ?? null,
      tem_pet: lead.tem_pet ?? null,
    },
    dados_coletados_nicole: (convStates.data ?? []).map((s) => s.collected_data).filter(Boolean),
    lead_criado_em: lead.created_at ?? null,
  }

  return {
    events,
    leadProfile,
    currentStage,
    lastEventAt: events.length > 0 ? events[events.length - 1]!.at : null,
  }
}
