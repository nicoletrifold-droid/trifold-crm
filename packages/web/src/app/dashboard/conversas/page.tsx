import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import Link from "next/link"

export default async function ConversasPage() {
  await getServerUser()
  const supabase = await createClient()

  // Get active conversations with lead info and last message preview
  // Story 30.2: last_message_preview/last_message_role are now denormalized
  // columns in `conversations` (kept up to date by trigger trg_messages_update_conv).
  // Eliminates the previous N+1 fetch over `messages`.
  const { data: conversations } = await supabase
    .from("conversations")
    .select(
      `
      id, channel, status, is_ai_active, handoff_at, last_message_at, created_at,
      last_message_preview, last_message_role,
      lead:leads!lead_id(id, name, phone)
    `
    )
    .eq("status", "active")
    .order("last_message_at", { ascending: false })

  const channelLabels: Record<string, { label: string; color: string; bg: string }> = {
    whatsapp: { label: "WhatsApp", color: "text-green-700 dark:text-green-300", bg: "bg-green-100 dark:bg-green-500/15" },
    telegram: { label: "Telegram", color: "text-blue-700 dark:text-blue-300", bg: "bg-blue-100 dark:bg-blue-500/15" },
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Conversas</h1>
        <p className="text-sm text-gray-500 dark:text-stone-400">
          {conversations?.length ?? 0} conversas ativas
        </p>
      </div>

      <div className="rounded-lg bg-white shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-stone-800">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:bg-stone-800/50 dark:text-stone-400">
              <th className="px-6 py-3">Lead</th>
              <th className="px-6 py-3">Canal</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3">Última mensagem</th>
              <th className="px-6 py-3">Horário</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-stone-800">
            {conversations?.map((conv) => {
              const lead = conv.lead as unknown as {
                id: string
                name: string | null
                phone: string
              } | null

              const channel = channelLabels[conv.channel] ?? {
                label: conv.channel,
                color: "text-gray-700 dark:text-stone-300",
                bg: "bg-gray-100 dark:bg-stone-700/50",
              }

              // Story 30.2: preview comes from denormalized column (already
              // truncated to 100 chars by trigger). UI keeps the 80-char cap
              // with ellipsis for visual consistency. NULL = empty conv.
              const rawPreview = (conv as { last_message_preview: string | null })
                .last_message_preview
              const preview = rawPreview
                ? rawPreview.length > 80
                  ? rawPreview.substring(0, 80) + "..."
                  : rawPreview
                : "-"

              const lastTime = conv.last_message_at

              return (
                <tr key={conv.id} className="hover:bg-gray-50 dark:hover:bg-stone-800/30">
                  <td className="px-6 py-4 font-medium text-gray-900 dark:text-stone-100">
                    <Link
                      href={`/dashboard/conversas/${conv.id}`}
                      className="text-orange-600 hover:text-orange-700 dark:text-orange-300 dark:hover:text-orange-200"
                    >
                      {lead?.name || lead?.phone || "Desconhecido"}
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${channel.bg} ${channel.color}`}
                    >
                      {channel.label}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {conv.is_ai_active ? (
                      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-500/15 dark:text-purple-300">
                        IA ativa
                      </span>
                    ) : (
                      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
                        Handoff
                      </span>
                    )}
                  </td>
                  <td className="max-w-xs px-6 py-4 text-sm text-gray-500 truncate dark:text-stone-400">
                    {preview}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
                    {lastTime
                      ? new Date(lastTime).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "-"}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {lead && (
                      <Link
                        href={`/dashboard/leads/${lead.id}`}
                        className="text-sm text-orange-600 hover:text-orange-700 dark:text-orange-300 dark:hover:text-orange-200"
                      >
                        Ver lead
                      </Link>
                    )}
                  </td>
                </tr>
              )
            })}
            {(!conversations || conversations.length === 0) && (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-8 text-center text-sm text-gray-500 dark:text-stone-400"
                >
                  Nenhuma conversa ativa.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
