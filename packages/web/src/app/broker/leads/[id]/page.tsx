import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import Link from "next/link"
import { notFound } from "next/navigation"
import { BrokerMessageInput } from "./_components/broker-message-input"
import { LeadEditForm } from "./_components/lead-edit-form"

const CAN_SEND_ROLES = ["broker", "admin", "supervisor", "gerente-comercial"]

export default async function BrokerLeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
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
        .select("id, role, content, created_at")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: true })
        .limit(50)
    : { data: [] }

  const stage = Array.isArray(lead.kanban_stages)
    ? lead.kanban_stages[0]
    : lead.kanban_stages
  const property = Array.isArray(lead.properties)
    ? lead.properties[0]
    : lead.properties

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
        </div>
      </div>

      {/* Edit Form */}
      <LeadEditForm
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
        }}
        properties={(properties ?? []).map(p => ({ id: p.id as string, name: p.name as string }))}
      />

      {/* Info Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <h2 className="mb-3 text-lg font-semibold dark:text-stone-100">Dados do Lead</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-stone-400">Empreendimento</dt>
              <dd className="font-medium">{property?.name ?? "Não definido"}</dd>
            </div>
            {lead.preferred_bedrooms && (
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-stone-400">Quartos</dt>
                <dd className="font-medium dark:text-stone-100">{lead.preferred_bedrooms}</dd>
              </div>
            )}
            {lead.preferred_floor && (
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-stone-400">Andar</dt>
                <dd className="font-medium dark:text-stone-100">{lead.preferred_floor}</dd>
              </div>
            )}
            {lead.preferred_view && (
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-stone-400">Vista</dt>
                <dd className="font-medium dark:text-stone-100">{lead.preferred_view}</dd>
              </div>
            )}
            {lead.preferred_garage_count != null && (
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-stone-400">Vagas</dt>
                <dd className="font-medium dark:text-stone-100">{lead.preferred_garage_count}</dd>
              </div>
            )}
            {lead.has_down_payment != null && (
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-stone-400">Tem entrada</dt>
                <dd className="font-medium dark:text-stone-100">
                  {lead.has_down_payment ? "Sim" : "Não"}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* AI Summary */}
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <h2 className="mb-3 text-lg font-semibold dark:text-stone-100">Resumo IA</h2>
          {lead.ai_summary ? (
            <p className="text-sm text-gray-600 whitespace-pre-line dark:text-stone-300">
              {lead.ai_summary}
            </p>
          ) : (
            <p className="text-sm text-gray-400 dark:text-stone-500">
              O resumo será gerado automaticamente após a conversa com a Nicole.
            </p>
          )}
        </div>
      </div>

      {/* Conversation */}
      <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <h2 className="mb-4 text-lg font-semibold dark:text-stone-100">Conversa com o Agente</h2>
        {messages && messages.length > 0 ? (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${
                  msg.role === "user" ? "justify-start" : "justify-end"
                }`}
              >
                <div
                  className={`max-w-[75%] rounded-lg px-4 py-2 text-sm ${
                    msg.role === "user"
                      ? "bg-gray-100 text-gray-800 dark:bg-stone-800 dark:text-stone-200"
                      : msg.role === "assistant"
                      ? "bg-purple-100 text-purple-900 dark:bg-purple-500/15 dark:text-purple-200"
                      : "bg-blue-100 text-blue-900 dark:bg-blue-500/15 dark:text-blue-200"
                  }`}
                >
                  <p className="whitespace-pre-line">{msg.content}</p>
                  <p className="mt-1 text-[10px] opacity-60">
                    {new Date(msg.created_at).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 dark:text-stone-500">Nenhuma mensagem ainda.</p>
        )}

        {CAN_SEND_ROLES.includes(user.role) && (
          <BrokerMessageInput leadId={id} />
        )}
      </div>
    </div>
  )
}
