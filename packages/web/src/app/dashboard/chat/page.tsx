import { redirect } from "next/navigation"
import Link from "next/link"
import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"
import { createAdminClient } from "@web/lib/supabase/admin"

/**
 * Story 76-4 — Módulo "Chat" (Relacionamento). Lista as conversas de WhatsApp
 * marcadas como relacionamento (cliente da base de obras encaminhado pela Nicole).
 * Visível só p/ gerente-relacionamento/supervisor/admin (via canAccess "chat").
 * Usa o ADMIN client (permissão já checada) porque a RLS de conversations não
 * libera a gerente-relacionamento.
 */
export default async function ChatPage() {
  const user = await getServerUser()
  if (!(await canAccess(user.id, user.orgId, "chat"))) {
    redirect("/dashboard")
  }

  const admin = createAdminClient()
  const { data: convs } = await admin
    .from("conversations")
    .select(
      `id, last_message_at, lead_id,
       cliente:clientes!relationship_cliente_id(nome),
       obra:obras!relationship_obra_id(name),
       lead:leads!lead_id(name, phone)`
    )
    .eq("org_id", user.orgId)
    .eq("is_relationship", true)
    .order("last_message_at", { ascending: false })

  const conversas = (convs ?? []) as Array<{
    id: string
    last_message_at: string | null
    lead_id: string
    cliente: { nome: string | null } | { nome: string | null }[] | null
    obra: { name: string | null } | { name: string | null }[] | null
    lead: { name: string | null; phone: string | null } | { name: string | null; phone: string | null }[] | null
  }>

  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)

  // Prévia da última mensagem (uma query só).
  const ids = conversas.map((c) => c.id)
  const lastByConv = new Map<string, { content: string; created_at: string }>()
  if (ids.length > 0) {
    const { data: msgs } = await admin
      .from("messages")
      .select("conversation_id, content, created_at")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false })
    for (const m of (msgs ?? []) as Array<{ conversation_id: string; content: string; created_at: string }>) {
      if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Chat</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-stone-400">
          Relacionamento — clientes que responderam no WhatsApp
        </p>
      </div>

      {conversas.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center ring-1 ring-gray-200 dark:bg-stone-900 dark:ring-stone-800">
          <p className="text-stone-500">
            Nenhuma conversa de relacionamento ainda. Quando um cliente da base responder no
            WhatsApp, a conversa aparece aqui.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 overflow-hidden rounded-xl bg-white ring-1 ring-gray-200 dark:divide-stone-800 dark:bg-stone-900 dark:ring-stone-800">
          {conversas.map((c) => {
            const cliente = one(c.cliente)
            const obra = one(c.obra)
            const lead = one(c.lead)
            const nome = cliente?.nome ?? lead?.name ?? "Cliente"
            const last = lastByConv.get(c.id)
            return (
              <Link
                key={c.id}
                href={`/dashboard/chat/${c.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-gray-50 dark:hover:bg-stone-800/50"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900 dark:text-stone-100">
                    {nome}
                    {obra?.name ? (
                      <span className="ml-2 text-xs font-normal text-orange-500">{obra.name}</span>
                    ) : null}
                  </p>
                  <p className="truncate text-sm text-gray-500 dark:text-stone-400">
                    {last?.content ?? lead?.phone ?? ""}
                  </p>
                </div>
                {c.last_message_at && (
                  <span className="shrink-0 text-xs text-gray-400 dark:text-stone-500">
                    {new Date(c.last_message_at).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
