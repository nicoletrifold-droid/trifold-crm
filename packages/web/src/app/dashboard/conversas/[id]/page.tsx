import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import Link from "next/link"
import { notFound } from "next/navigation"
import { BrokerMessageInput } from "@web/app/broker/leads/[id]/_components/broker-message-input"

const CAN_SEND_ROLES = ["admin", "supervisor", "gerente-comercial"]

const roleConfig: Record<
  string,
  { label: string; align: string; bubble: string }
> = {
  user: {
    label: "Lead",
    align: "justify-start",
    bubble: "bg-gray-100 text-gray-800 dark:bg-stone-800 dark:text-stone-200",
  },
  assistant: {
    label: "IA",
    align: "justify-end",
    bubble: "bg-purple-100 text-purple-900 dark:bg-purple-500/15 dark:text-purple-200",
  },
  broker: {
    label: "Corretor",
    align: "justify-end",
    bubble: "bg-blue-100 text-blue-900 dark:bg-blue-500/15 dark:text-blue-200",
  },
  system: {
    label: "Sistema",
    align: "justify-center",
    bubble: "bg-yellow-100 text-yellow-900 dark:bg-yellow-500/15 dark:text-yellow-200",
  },
}

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getServerUser()
  const supabase = await createClient()

  // Fetch conversation with lead info
  const { data: conversation, error } = await supabase
    .from("conversations")
    .select(
      `
      id, channel, status, is_ai_active, handoff_at, last_message_at, created_at,
      lead:leads!lead_id(id, name, phone)
    `
    )
    .eq("id", id)
    .single()

  if (error || !conversation) {
    notFound()
  }

  const lead = conversation.lead as unknown as {
    id: string
    name: string | null
    phone: string
  } | null

  // Fetch all messages ordered by created_at ascending
  const { data: messages } = await supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true })

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/dashboard/conversas"
        className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-stone-400 dark:hover:text-stone-200"
      >
        &larr; Voltar para conversas
      </Link>

      {/* Header */}
      <div className="rounded-lg bg-white p-6 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">
              {lead?.name || "Sem nome"}
            </h1>
            <p className="text-sm text-gray-500 dark:text-stone-400">{lead?.phone ?? "-"}</p>
          </div>
          <div className="flex items-center gap-2">
            {conversation.status === "handed_off" ? (
              <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
                Handoff
              </span>
            ) : (
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700 dark:bg-green-500/15 dark:text-green-300">
                Ativa
              </span>
            )}
            {conversation.is_ai_active ? (
              <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-700 dark:bg-purple-500/15 dark:text-purple-300">
                IA ativa
              </span>
            ) : (
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-stone-700/50 dark:text-stone-200">
                IA inativa
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="rounded-lg bg-white p-6 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-stone-100">Mensagens</h2>
        {messages && messages.length > 0 ? (
          <div className="space-y-3">
            {messages.map((msg) => {
              const config = roleConfig[msg.role] ?? {
                label: msg.role,
                align: "justify-start",
                bubble: "bg-gray-100 text-gray-800 dark:bg-stone-800 dark:text-stone-200",
              }

              return (
                <div key={msg.id} className={`flex ${config.align}`}>
                  <div
                    className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${config.bubble}`}
                  >
                    <div className="mb-1 text-[10px] font-medium uppercase opacity-60">
                      {config.label}
                    </div>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <div className="mt-1 text-[10px] opacity-50">
                      {new Date(msg.created_at).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-400 dark:text-stone-500">Nenhuma mensagem registrada.</p>
        )}

        {lead?.id && CAN_SEND_ROLES.includes(user.role) && (
          <BrokerMessageInput leadId={lead.id} />
        )}
      </div>
    </div>
  )
}
