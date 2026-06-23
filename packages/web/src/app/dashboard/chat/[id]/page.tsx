import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"
import { createAdminClient } from "@web/lib/supabase/admin"
import { BrokerMessageInput } from "@web/app/broker/leads/[id]/_components/broker-message-input"

/**
 * Story 76-4 — Detalhe do Chat (Relacionamento). Thread da conversa + composer
 * (texto/áudio/arquivo) p/ a Samara responder via WhatsApp. ADMIN client (canAccess
 * "chat" já validado); confirma que a conversa é de relacionamento.
 */
const roleConfig: Record<string, { label: string; align: string; bubble: string }> = {
  user: { label: "Cliente", align: "justify-start", bubble: "bg-gray-100 text-gray-800 dark:bg-stone-800 dark:text-stone-200" },
  assistant: { label: "Nicole", align: "justify-end", bubble: "bg-purple-100 text-purple-900 dark:bg-purple-500/15 dark:text-purple-200" },
  broker: { label: "Você", align: "justify-end", bubble: "bg-blue-100 text-blue-900 dark:bg-blue-500/15 dark:text-blue-200" },
  system: { label: "Sistema", align: "justify-center", bubble: "bg-yellow-100 text-yellow-900 dark:bg-yellow-500/15 dark:text-yellow-200" },
}

export default async function ChatDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getServerUser()
  if (!(await canAccess(user.id, user.orgId, "chat"))) {
    redirect("/dashboard")
  }

  const admin = createAdminClient()
  const { data: conversation } = await admin
    .from("conversations")
    .select(
      `id, lead_id, is_relationship,
       cliente:clientes!relationship_cliente_id(nome, telefone),
       obra:obras!relationship_obra_id(name),
       lead:leads!lead_id(name, phone)`
    )
    .eq("id", id)
    .eq("org_id", user.orgId)
    .maybeSingle()

  if (!conversation || !conversation.is_relationship) {
    notFound()
  }

  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)
  const cliente = one(conversation.cliente as { nome: string | null; telefone: string | null } | { nome: string | null; telefone: string | null }[] | null)
  const obra = one(conversation.obra as { name: string | null } | { name: string | null }[] | null)
  const lead = one(conversation.lead as { name: string | null; phone: string | null } | { name: string | null; phone: string | null }[] | null)
  const nome = cliente?.nome ?? lead?.name ?? "Cliente"
  const phone = cliente?.telefone ?? lead?.phone ?? "-"

  const { data: rawMessages } = await admin
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true })

  const messages = (rawMessages ?? []) as Array<{
    id: string
    role: string
    content: string
    created_at: string
  }>

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/chat"
        className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-stone-400 dark:hover:text-stone-200"
      >
        &larr; Voltar para o Chat
      </Link>

      <div className="rounded-lg bg-white p-6 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">{nome}</h1>
            <p className="text-sm text-gray-500 dark:text-stone-400">{phone}</p>
          </div>
          {obra?.name && (
            <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
              {obra.name}
            </span>
          )}
        </div>
      </div>

      <div className="rounded-lg bg-white p-6 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-stone-100">Mensagens</h2>
        {messages.length > 0 ? (
          <div className="space-y-3">
            {messages.map((msg) => {
              const config = roleConfig[msg.role] ?? {
                label: msg.role,
                align: "justify-start",
                bubble: "bg-gray-100 text-gray-800 dark:bg-stone-800 dark:text-stone-200",
              }
              return (
                <div key={msg.id} className={`flex ${config.align}`}>
                  <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${config.bubble}`}>
                    <div className="mb-1 text-[10px] font-medium uppercase opacity-60">{config.label}</div>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <div className="mt-1 text-[10px] opacity-50">
                      {new Date(msg.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-400 dark:text-stone-500">Nenhuma mensagem registrada.</p>
        )}

        {conversation.lead_id && <BrokerMessageInput leadId={conversation.lead_id} />}
      </div>
    </div>
  )
}
