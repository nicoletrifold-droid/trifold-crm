import { createClient } from "@web/lib/supabase/server"
import { leadMatchesSearch } from "@web/lib/leads/search"
import { getServerUser } from "@web/lib/auth"
import Link from "next/link"
import { MessageSquare, SearchX, User } from "lucide-react"
import { LeadSearch } from "@web/app/broker/_components/lead-search"
import { LeadFilters } from "@web/components/lead-filters"
import { countUnreadForLead } from "@web/lib/broker/unread-count"
import { formatRelativeTime } from "@web/lib/broker/format-relative-time"
import { getChannelLabel } from "@web/lib/broker/channel-labels"
import { staleCutoffMs } from "@web/lib/broker/stale-cutoff"

interface LeadEmbed {
  id: string
  name: string | null
  phone: string
  stage_id: string | null
  property_interest_id: string | null
  assigned_broker_id: string | null
  kanban_stages: { name: string; color: string | null } | { name: string; color: string | null }[] | null
  properties: { name: string } | { name: string }[] | null
  assigned_broker: { id: string; name: string | null } | { id: string; name: string | null }[] | null
}

interface ConversationRow {
  id: string
  channel: string
  status: string
  is_ai_active: boolean
  last_message_at: string | null
  last_message_preview: string | null
  last_message_role: string | null
  broker_last_read_at: string | null
  lead: LeadEmbed | LeadEmbed[] | null
}

function one<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export default async function ConversasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stage?: string; property?: string; broker_id?: string; days?: string; ia?: string }>
}) {
  const user = await getServerUser()
  const supabase = await createClient()
  const { q, stage, property, broker_id, days, ia } = await searchParams
  const search = q?.trim().toLowerCase() ?? ""

  // RLS `conversations_select` amplia para admin/supervisor/gerente-comercial
  // (is_admin_or_supervisor) → retorna TODAS as conversas da org. Reusa as colunas
  // denormalizadas last_message_* (sem N+1) e embute o corretor responsável.
  const [{ data: conversations }, { data: properties }, { data: stages }, { data: brokerRows }] =
    await Promise.all([
      supabase
        .from("conversations")
        .select(
          `id, channel, status, is_ai_active,
           last_message_at, last_message_preview, last_message_role, broker_last_read_at,
           lead:leads!lead_id(
             id, name, phone, stage_id, property_interest_id, assigned_broker_id,
             kanban_stages:stage_id(name, color),
             properties:property_interest_id(name),
             assigned_broker:users!assigned_broker_id(id, name)
           )`
        )
        .eq("status", "active")
        .order("last_message_at", { ascending: false, nullsFirst: false }),

      supabase.from("properties").select("id, name").eq("is_active", true).order("name"),
      supabase.from("kanban_stages").select("id, name, color").eq("org_id", user.orgId).order("position"),
      supabase.from("brokers").select("user:users!user_id(id, name)").eq("org_id", user.orgId),
    ])

  const rows = (conversations ?? []) as unknown as ConversationRow[]

  // Story 75-170 — busca no CONTEÚDO das mensagens (estilo WhatsApp): FTS português
  // + unaccent via RPC (mig 177, security invoker — RLS de messages vale). O termo
  // também segue casando nome/telefone do lead (leadMatchesSearch abaixo) — a conversa
  // entra se casar QUALQUER um dos dois.
  const contentMatches = new Map<string, { snippet: string; count: number }>()
  if (search) {
    const { data: found } = await supabase.rpc("search_conversation_messages", {
      p_org: user.orgId,
      p_term: search,
    })
    for (const f of (found ?? []) as Array<{ conversation_id: string; snippet: string | null; match_count: number }>) {
      contentMatches.set(f.conversation_id, { snippet: f.snippet ?? "", count: Number(f.match_count) })
    }
  }

  // Lista de corretores p/ o dropdown (id = users.id, que é o assigned_broker_id do lead).
  const brokers = ((brokerRows ?? []) as unknown as { user: { id: string; name: string | null } | { id: string; name: string | null }[] | null }[])
    .map((b) => one(b.user))
    .filter((u): u is { id: string; name: string | null } => !!u && !!u.name)
    .map((u) => ({ id: u.id, name: u.name as string }))
    .sort((a, b) => a.name.localeCompare(b.name))

  // Mensagens de TODAS as conversas ativas em um fetch (sem N+1). Usado para:
  // (1) contar não-lidas; (2) detectar se a Nicole participou (msg role='assistant')
  // — necessário para distinguir "Humano + IA" de "Humano" no filtro de atendimento.
  const allIds = rows.map((c) => c.id)
  const { data: messages } = allIds.length
    ? await supabase
        .from("messages")
        .select("conversation_id, role, created_at")
        .in("conversation_id", allIds)
    : { data: [] }

  const msgsByConv = new Map<string, { conversation_id: string; role: string; created_at: string }[]>()
  for (const m of (messages ?? []) as { conversation_id: string; role: string; created_at: string }[]) {
    const list = msgsByConv.get(m.conversation_id)
    if (list) list.push(m)
    else msgsByConv.set(m.conversation_id, [m])
  }

  // A Nicole participou da conversa? (existe mensagem dela, role='assistant')
  const nicoleParticipou = (convId: string) =>
    (msgsByConv.get(convId) ?? []).some((m) => m.role === "assistant")

  // Classificação de atendimento (3 estados):
  //  - "ia"        → Apenas IA: ainda com a Nicole, nunca repassado (is_ai_active=true)
  //  - "humano_ia" → Humano + IA: houve handoff E a Nicole participou
  //  - "humano"    → Humano: houve handoff E a Nicole NUNCA participou (lead manual)
  function atendimentoDe(conv: ConversationRow): "ia" | "humano_ia" | "humano" {
    if (conv.is_ai_active) return "ia"
    return nicoleParticipou(conv.id) ? "humano_ia" : "humano"
  }

  // Corte do filtro "Sem contato" (parado N dias). 0 = sem filtro.
  const staleCutoff = staleCutoffMs(days ? parseInt(days, 10) : 0)

  // Filtros AND aplicados em JS (PostgREST não filtra de forma confiável em
  // relações embedded). Conjunto da org é pequeno.
  const filtered = rows.filter((conv) => {
    const lead = one(conv.lead)
    if (!lead) return false
    if (stage && lead.stage_id !== stage) return false
    if (property && lead.property_interest_id !== property) return false
    if (broker_id === "none") {
      if (lead.assigned_broker_id) return false
    } else if (broker_id && lead.assigned_broker_id !== broker_id) {
      return false
    }
    if (ia && atendimentoDe(conv) !== ia) return false
    if (staleCutoff) {
      // Mantém só conversas paradas: last_message_at mais antigo que o corte
      // (sem mensagem = sem contato → mantém).
      const last = conv.last_message_at ? new Date(conv.last_message_at).getTime() : 0
      if (last > staleCutoff) return false
    }
    // Story 75-168 — busca sem acento + fuzzy nos dados do lead; Story 75-170 —
    // OU no conteúdo das mensagens (FTS). Basta casar um dos dois.
    if (search && !leadMatchesSearch([lead.name, lead.phone], search) && !contentMatches.has(conv.id)) {
      return false
    }
    return true
  })

  const hasFilter = Boolean(search || stage || property || broker_id || days || ia)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Conversas</h1>
        <p className="text-sm text-gray-500 dark:text-stone-400">
          {filtered.length} {filtered.length === 1 ? "conversa" : "conversas"}
        </p>
      </div>

      <LeadSearch placeholder="Buscar por nome, telefone ou qualquer palavra da conversa…" />
      <LeadFilters
        stages={(stages ?? []).map((s) => ({ id: s.id, name: s.name, color: s.color }))}
        properties={(properties ?? []).map((p) => ({ id: p.id, name: p.name }))}
        brokers={brokers}
        includeUnassigned
        showAtendimento
        stageParam="stage"
        propertyParam="property"
      />

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-white p-12 text-center ring-1 ring-gray-200 dark:bg-stone-900 dark:ring-stone-800">
          {hasFilter ? (
            <>
              <SearchX className="h-10 w-10 text-stone-400" aria-hidden="true" />
              <p className="text-sm text-stone-500">
                {search
                  ? `Nenhuma conversa encontrada para "${q}". Tente outros termos.`
                  : "Nenhuma conversa encontrada para esses filtros."}
              </p>
            </>
          ) : (
            <>
              <MessageSquare className="h-10 w-10 text-stone-400" aria-hidden="true" />
              <p className="text-sm text-stone-500">Nenhuma conversa ativa.</p>
            </>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((conv) => {
            const lead = one(conv.lead)!
            const stageData = one(lead.kanban_stages)
            const propertyData = one(lead.properties)
            const brokerData = one(lead.assigned_broker)
            const atend = atendimentoDe(conv)
            const displayName = lead.name || lead.phone
            const initial = (lead.name ?? lead.phone ?? "?").trim().charAt(0).toUpperCase() || "?"

            const unread = countUnreadForLead(
              [{ id: conv.id, broker_last_read_at: conv.broker_last_read_at }],
              msgsByConv.get(conv.id) ?? []
            )

            // Story 75-170: se a conversa entrou pela busca de CONTEÚDO, o preview vira
            // o trecho da mensagem que casou (estilo WhatsApp), com contagem de matches.
            const contentHit = search ? contentMatches.get(conv.id) : undefined
            const rawPreview = conv.last_message_preview ?? ""
            const preview = contentHit
              ? `💬 ${contentHit.snippet.replace(/\s+/g, " ").slice(0, 140)}${contentHit.count > 1 ? `  (+${contentHit.count - 1})` : ""}`
              : conv.last_message_role === "broker"
                ? `Corretor: ${rawPreview}`
                : conv.last_message_role === "assistant"
                ? `🤖 ${rawPreview}`
                : rawPreview

            const channel = getChannelLabel(conv.channel)
            const relTime = conv.last_message_at
              ? formatRelativeTime(new Date(conv.last_message_at))
              : ""

            return (
              <li key={conv.id}>
                <Link
                  href={`/dashboard/conversas/${conv.id}`}
                  className="flex min-h-[72px] items-center gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-gray-200 transition-colors active:bg-gray-50 hover:bg-gray-50 dark:bg-stone-900 dark:ring-stone-800 dark:active:bg-stone-800 dark:hover:bg-stone-800/60"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-orange-100 text-lg font-semibold text-orange-700 dark:bg-orange-500/20 dark:text-orange-300">
                    {initial}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p
                        className={`truncate text-sm text-gray-900 dark:text-stone-100 ${
                          unread > 0 ? "font-bold" : "font-medium"
                        }`}
                      >
                        {displayName}
                      </p>
                      {relTime && (
                        <span
                          className={`shrink-0 text-[11px] ${
                            unread > 0
                              ? "font-semibold text-green-700 dark:text-green-400"
                              : "text-stone-400 dark:text-stone-500"
                          }`}
                        >
                          {relTime}
                        </span>
                      )}
                    </div>

                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <p
                        className={`truncate text-xs ${
                          unread > 0
                            ? "font-medium text-stone-700 dark:text-stone-200"
                            : "text-stone-500 dark:text-stone-400"
                        }`}
                      >
                        {preview || "—"}
                      </p>
                      {unread > 0 && (
                        <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-green-700 px-1.5 text-[10px] font-bold text-white ring-2 ring-white dark:ring-stone-900">
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${channel.bg} ${channel.color}`}
                      >
                        {channel.label}
                      </span>
                      {atend === "ia" ? (
                        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-500/15 dark:text-purple-300">
                          🤖 Apenas IA
                        </span>
                      ) : atend === "humano_ia" ? (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                          🤖 Humano + IA
                        </span>
                      ) : (
                        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
                          Atendimento humano
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                        <User className="h-3 w-3" aria-hidden="true" />
                        {brokerData?.name ?? "Sem corretor"}
                      </span>
                      {(propertyData?.name || stageData?.name) && (
                        <span className="truncate text-xs text-stone-500 dark:text-stone-500">
                          {propertyData?.name && <span>{propertyData.name}</span>}
                          {propertyData?.name && stageData?.name && <span> · </span>}
                          {stageData?.name && (
                            <span style={stageData.color ? { color: stageData.color } : undefined}>
                              {stageData.name}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
