import { redirect } from "next/navigation"
import Link from "next/link"
import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"
import { createAdminClient } from "@web/lib/supabase/admin"
import { leadMatchesSearch } from "@web/lib/leads/search"
import { LeadSearch } from "@web/app/broker/_components/lead-search"

/**
 * Story 76-4 — Módulo "Chat" (Relacionamento). Lista as conversas de WhatsApp
 * marcadas como relacionamento (cliente da base de obras encaminhado pela Nicole).
 * Visível só p/ gerente-relacionamento/supervisor/admin (via canAccess "chat").
 * Usa o ADMIN client (permissão já checada) porque a RLS de conversations não
 * libera a gerente-relacionamento.
 */
export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const user = await getServerUser()
  const { q } = await searchParams
  const search = q?.trim().toLowerCase() ?? ""
  if (!(await canAccess(user.id, user.orgId, "chat"))) {
    redirect("/dashboard")
  }

  const admin = createAdminClient()
  const { data: convs } = await admin
    .from("conversations")
    .select(
      `id, last_message_at, broker_last_read_at, lead_id,
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
    broker_last_read_at: string | null
    lead_id: string
    cliente: { nome: string | null } | { nome: string | null }[] | null
    obra: { name: string | null } | { name: string | null }[] | null
    lead: { name: string | null; phone: string | null } | { name: string | null; phone: string | null }[] | null
  }>

  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)

  // Story 75-171 — busca por nome/telefone E no CONTEÚDO das mensagens (FTS, mig 177).
  // RPC via ADMIN client (a RLS não libera a gerente-relacionamento — mesmo motivo do
  // fetch acima); o resultado só é usado para filtrar conversas JÁ listadas aqui
  // (is_relationship=true, permissão canAccess("chat") checada no topo).
  const contentMatches = new Map<string, { snippet: string; count: number }>()
  if (search) {
    const { data: found } = await admin.rpc("search_conversation_messages", {
      p_org: user.orgId,
      p_term: search,
    })
    for (const f of (found ?? []) as Array<{ conversation_id: string; snippet: string | null; match_count: number }>) {
      contentMatches.set(f.conversation_id, { snippet: f.snippet ?? "", count: Number(f.match_count) })
    }
  }

  const conversasFiltradas = search
    ? conversas.filter((c) => {
        const cliente = one(c.cliente)
        const lead = one(c.lead)
        return (
          leadMatchesSearch([cliente?.nome ?? null, lead?.name ?? null, lead?.phone ?? null], search) ||
          contentMatches.has(c.id)
        )
      })
    : conversas

  // Prévia da última mensagem (uma query só).
  const ids = conversas.map((c) => c.id)
  const lastByConv = new Map<string, { content: string; created_at: string }>()
  // Story 75-86 — não-lidas por conversa: msgs do cliente (role='user') após o último read.
  const unreadByConv = new Map<string, number>()
  const readAtByConv = new Map(conversas.map((c) => [c.id, c.broker_last_read_at]))
  if (ids.length > 0) {
    const { data: msgs } = await admin
      .from("messages")
      .select("conversation_id, role, content, created_at")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false })
    for (const m of (msgs ?? []) as Array<{ conversation_id: string; role: string; content: string; created_at: string }>) {
      if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m)
      if (m.role === "user") {
        const readAt = readAtByConv.get(m.conversation_id)
        if (!readAt || new Date(m.created_at) > new Date(readAt)) {
          unreadByConv.set(m.conversation_id, (unreadByConv.get(m.conversation_id) ?? 0) + 1)
        }
      }
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

      {/* Story 75-171 — busca (nome, telefone ou conteúdo da conversa) */}
      <LeadSearch placeholder="Buscar por nome, telefone ou qualquer palavra da conversa…" />

      {conversasFiltradas.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center ring-1 ring-gray-200 dark:bg-stone-900 dark:ring-stone-800">
          <p className="text-stone-500">
            {search
              ? `Nenhuma conversa encontrada para "${q}". Tente outros termos.`
              : "Nenhuma conversa de relacionamento ainda. Quando um cliente da base responder no WhatsApp, a conversa aparece aqui."}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 overflow-hidden rounded-xl bg-white ring-1 ring-gray-200 dark:divide-stone-800 dark:bg-stone-900 dark:ring-stone-800">
          {conversasFiltradas.map((c) => {
            const cliente = one(c.cliente)
            const obra = one(c.obra)
            const lead = one(c.lead)
            const nome = cliente?.nome ?? lead?.name ?? "Cliente"
            const last = lastByConv.get(c.id)
            const unread = unreadByConv.get(c.id) ?? 0
            // Story 75-171: achado por CONTEÚDO → preview vira o trecho que casou.
            const contentHit = search ? contentMatches.get(c.id) : undefined
            const previewText = contentHit
              ? `💬 ${contentHit.snippet.replace(/\s+/g, " ").slice(0, 140)}${contentHit.count > 1 ? `  (+${contentHit.count - 1})` : ""}`
              : (last?.content ?? lead?.phone ?? "")
            return (
              <Link
                key={c.id}
                href={`/dashboard/chat/${c.id}`}
                className={`flex items-center justify-between gap-4 px-4 py-3 hover:bg-gray-50 dark:hover:bg-stone-800/50 ${unread > 0 ? "bg-orange-50/40 dark:bg-stone-800/30" : ""}`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  {unread > 0 && <span className="h-2 w-2 shrink-0 rounded-full bg-orange-500" aria-label="não lida" />}
                  <div className="min-w-0">
                    <p className={`truncate text-gray-900 dark:text-stone-100 ${unread > 0 ? "font-bold" : "font-medium"}`}>
                      {nome}
                      {obra?.name ? (
                        <span className="ml-2 text-xs font-normal text-orange-500">{obra.name}</span>
                      ) : null}
                    </p>
                    <p className={`truncate text-sm ${unread > 0 ? "text-gray-700 dark:text-stone-200" : "text-gray-500 dark:text-stone-400"}`}>
                      {previewText}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {unread > 0 && (
                    <span className="rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>
                  )}
                  {c.last_message_at && (
                    <span className="text-xs text-gray-400 dark:text-stone-500">
                      {new Date(c.last_message_at).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
