import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { isUuid } from "@web/lib/uuid"
import { LeadDetailsPanel } from "./_components/lead-details-panel"
import { ConversationThread } from "./_components/conversation-thread"
import { markLeadConversationsRead } from "./_actions/mark-read"

const CAN_SEND_ROLES = ["broker", "admin", "supervisor", "gerente-comercial"]

export default async function BrokerLeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  // Story 75-67: link malformado (ex.: botão de template WhatsApp com "{{1}}" literal) → lista, não 404.
  if (!isUuid(id)) redirect("/broker/leads")
  const user = await getServerUser()
  const supabase = await createClient()

  const { data: lead } = await supabase
    .from("leads")
    .select(
      `*,
       kanban_stages:stage_id(name, color),
       properties:property_interest_id(name, slug)`
    )
    .eq("id", id)
    .eq("assigned_broker_id", user.id)
    .single()

  if (!lead) notFound()

  // Story 63-19 — abrir o thread marca as conversas do lead como lidas (zera o
  // badge verde no próximo request do layout). Best-effort: nunca derruba a página.
  try {
    await markLeadConversationsRead(id)
  } catch {
    // silencioso
  }

  const { data: properties } = await supabase
    .from("properties")
    .select("id, name")
    .eq("is_active", true)
    .order("name")

  // Get conversations and messages
  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, channel, status, is_ai_active, last_message_at")
    .eq("lead_id", id)
    .order("created_at", { ascending: false })

  const conversationIds = conversations?.map((c) => c.id) ?? []

  const { data: messages } = conversationIds.length
    ? await supabase
        .from("messages")
        .select("id, role, content, created_at, metadata")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: true })
        .limit(50)
    : { data: [] }

  // Story 75-165 — nomes de quem enviou (metadata.sent_by) p/ rotular as bolhas
  // do corretor com o remetente real (não "Você" para todos no atendimento compartilhado).
  const senderIds = [
    ...new Set(
      (messages ?? [])
        .filter((m) => m.role === "broker" && typeof (m.metadata as Record<string, unknown> | null)?.sent_by === "string")
        .map((m) => (m.metadata as Record<string, unknown>).sent_by as string)
    ),
  ]
  let senderNames: Record<string, string> = {}
  if (senderIds.length > 0) {
    const { data: senders } = await supabase.from("users").select("id, name").in("id", senderIds)
    senderNames = Object.fromEntries((senders ?? []).map((u) => [u.id as string, (u.name as string) ?? ""]))
  }

  const stage = Array.isArray(lead.kanban_stages)
    ? lead.kanban_stages[0]
    : lead.kanban_stages
  const property = Array.isArray(lead.properties)
    ? lead.properties[0]
    : lead.properties

  // Story 63-4 — estado da janela de 24h derivado de conversations.last_message_at
  // (sem query adicional). Telegram (phone "tg:") não tem restrição de janela.
  // Story 63-5 — `windowClosed` agora é computado internamente pelo
  // `ConversationThread` a partir de `lastMessageAt`/`isWhatsApp`.
  const activeConversation = conversations?.[0]
  const lastMessageAt = activeConversation?.last_message_at
    ? new Date(activeConversation.last_message_at as string)
    : null
  const isWhatsApp = !String(lead.phone).startsWith("tg:")

  return (
    <div className="space-y-6">
      <Link
        href="/broker/leads"
        className="text-sm text-gray-500 hover:text-gray-700 dark:text-stone-400 dark:hover:text-stone-200"
      >
        &larr; Meus Leads
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">
            {lead.name || lead.phone}
          </h1>
          <div className="mt-1 flex items-center gap-3 text-sm text-gray-500 dark:text-stone-400">
            <span>{lead.phone}</span>
            {lead.email && <span>{lead.email}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {stage && (
            <span
              className="rounded-full px-3 py-1 text-sm font-medium"
              style={{
                backgroundColor: `${stage.color}20`,
                color: stage.color,
              }}
            >
              {stage.name}
            </span>
          )}
          {lead.qualification_score != null && (
            <span
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                lead.qualification_score >= 70
                  ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300"
                  : lead.qualification_score >= 40
                  ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300"
                  : "bg-gray-100 text-gray-500 dark:bg-stone-700/50 dark:text-stone-400"
              }`}
            >
              Score: {lead.qualification_score}
            </span>
          )}
          {/*
            Story 63-7 — detalhes/edição do lead movidos para slide-over,
            acionado pelo botão ⋯ no header, fora do caminho de resposta do chat.
          */}
          <LeadDetailsPanel
            lead={{
              id: lead.id as string,
              name: lead.name as string | null,
              phone: lead.phone as string,
              email: lead.email as string | null,
              interest_level: lead.interest_level as string | null,
              property_interest_id: lead.property_interest_id as string | null,
              preferred_bedrooms: lead.preferred_bedrooms as number | null,
              preferred_floor: lead.preferred_floor as string | null,
              preferred_view: lead.preferred_view as string | null,
              preferred_garage_count: lead.preferred_garage_count as number | null,
              has_down_payment: lead.has_down_payment as boolean | null,
              observacao: lead.observacao as string | null,
              finalidade: lead.finalidade as string | null,
              orcamento: lead.orcamento as string | null,
              prazo_compra: lead.prazo_compra as string | null,
              forma_pagamento: lead.forma_pagamento as string | null,
              // Story 75-181 — perfil p/ marketing
              profissao: lead.profissao as string | null,
              renda_familiar: lead.renda_familiar as string | null,
              filhos: lead.filhos as string | null,
              estado_civil: lead.estado_civil as string | null,
              faixa_etaria: lead.faixa_etaria as string | null,
              situacao_moradia: lead.situacao_moradia as string | null,
              cidade_bairro: lead.cidade_bairro as string | null,
              tem_pet: lead.tem_pet as string | null,
            }}
            properties={(properties ?? []).map((p) => ({
              id: p.id as string,
              name: p.name as string,
            }))}
            propertyName={(property?.name as string | undefined) ?? null}
            aiSummary={lead.ai_summary as string | null}
          />
        </div>
      </div>

      {/*
        Conversation — Story 63-5: a área de chat (header + histórico + bolhas +
        composer + badge de janela) foi extraída para o componente reutilizável
        `ConversationThread`. Layout full-height no mobile / limitado no desktop
        é mantido pela Story 63-6 (encapsulado no componente).
      */}
      <ConversationThread
        messages={messages ?? []}
        lead={{
          id: lead.id as string,
          phone: lead.phone as string,
          name: lead.name as string | null,
        }}
        lastMessageAt={lastMessageAt}
        isAiActive={Boolean(activeConversation?.is_ai_active)}
        isWhatsApp={isWhatsApp}
        canSend={CAN_SEND_ROLES.includes(user.role)}
        // Story 63-11 — ids das conversas para a subscription Realtime (um canal
        // por conversa). Array já construído acima (L45).
        conversationIds={conversationIds}
        // Story 63-10 — `leads.metadata` já vem no select `*`; estado inicial
        // do botão "me avisar quando o lead responder".
        notifyOnReply={Boolean(
          (lead.metadata as { notify_broker_on_reply?: boolean } | null)
            ?.notify_broker_on_reply
        )}
        currentUserId={user.id}
        senderNames={senderNames}
      />
    </div>
  )
}
