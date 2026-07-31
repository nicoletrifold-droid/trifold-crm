import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"
import { createAdminClient } from "@web/lib/supabase/admin"
import { BrokerMessageInput } from "@web/app/broker/leads/[id]/_components/broker-message-input"
import { MessageMedia } from "@web/components/conversas/message-media"
import { MessageText } from "@web/components/ui/message-text"

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

  // Story 75-86 — abrir a conversa marca como lida (reusa broker_last_read_at; a
  // caixa de relacionamento é compartilhada → lido por qualquer um = lido).
  await admin
    .from("conversations")
    .update({ broker_last_read_at: new Date().toISOString() })
    .eq("id", id)

  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)
  const cliente = one(conversation.cliente as { nome: string | null; telefone: string | null } | { nome: string | null; telefone: string | null }[] | null)
  const obra = one(conversation.obra as { name: string | null } | { name: string | null }[] | null)
  const lead = one(conversation.lead as { name: string | null; phone: string | null } | { name: string | null; phone: string | null }[] | null)
  const nome = cliente?.nome ?? lead?.name ?? "Cliente"
  const phone = cliente?.telefone ?? lead?.phone ?? "-"

  const { data: rawMessages } = await admin
    .from("messages")
    .select("id, role, content, media_url, media_type, created_at, metadata")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true })

  const messages = (rawMessages ?? []) as Array<{
    id: string
    role: string
    content: string
    media_url: string | null
    media_type: string | null
    created_at: string
    metadata: Record<string, unknown> | null
  }>

  // A caixa de relacionamento é compartilhada: mensagens role="broker" carregam
  // metadata.sent_by (quem realmente enviou). Resolve p/ mostrar o nome do atendente
  // (ex.: "Samara") em vez do "Você" genérico. Mesmo padrão das telas de lead e
  // conversas (Story 75-119): só o primeiro nome, fallback "Equipe".
  const brokerUserIds = [
    ...new Set(
      messages
        .filter((m) => m.role === "broker" && m.metadata?.sent_by)
        .map((m) => m.metadata!.sent_by as string)
    ),
  ]
  const brokerNames: Record<string, string> = {}
  if (brokerUserIds.length > 0) {
    const { data: brokerUsers } = await admin
      .from("users")
      .select("id, name")
      .in("id", brokerUserIds)
    brokerUsers?.forEach((u) => {
      if (u.id) brokerNames[u.id as string] = ((u.name as string) ?? "").split(" ")[0] || (u.name as string)
    })
  }

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
              // Mensagem de humano (caixa compartilhada): mostra quem enviou, não "Você".
              const label =
                msg.role === "broker"
                  ? brokerNames[msg.metadata?.sent_by as string] ?? "Equipe"
                  : config.label
              return (
                <div key={msg.id} className={`flex ${config.align}`}>
                  <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${config.bubble}`}>
                    <div className="mb-1 text-[10px] font-medium uppercase opacity-60">{label}</div>
                    <MessageText content={msg.content} className="whitespace-pre-wrap" />
                    {/* Story 75-222: renderiza mídia (imagem/áudio/documento). Colunas
                        top-level primeiro; fallback ao metadata cobre o histórico gravado
                        antes do fix (inbound antigo só tinha metadata.media_*). */}
                    <MessageMedia
                      mediaType={msg.media_type ?? (msg.metadata?.media_type as string | undefined)}
                      mediaUrl={msg.media_url ?? (msg.metadata?.media_url as string | undefined)}
                    />
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
