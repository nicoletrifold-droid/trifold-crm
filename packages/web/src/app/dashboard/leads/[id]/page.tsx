import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import Link from "next/link"
import { notFound } from "next/navigation"
import { GenerateSummaryButton } from "@web/components/leads/generate-summary-button"
import { EditLeadToggle } from "./_components/edit-lead-toggle"

import { INTEREST_LEVEL_LABELS as interestLevelLabels, INTEREST_LEVEL_COLORS as interestLevelColors, SOURCE_LABELS as sourceLabels } from "@web/lib/constants"

const TABS = [
  { key: "info", label: "Info" },
  { key: "conversa", label: "Conversa" },
  { key: "timeline", label: "Timeline" },
  { key: "resumo", label: "Resumo IA" },
] as const

type TabKey = (typeof TABS)[number]["key"]

export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const { tab: rawTab } = await searchParams
  const activeTab: TabKey = (
    ["info", "conversa", "timeline", "resumo"] as TabKey[]
  ).includes(rawTab as TabKey)
    ? (rawTab as TabKey)
    : "info"

  const user = await getServerUser()
  const supabase = await createClient()
  const canEdit = ["admin", "supervisor", "gerente-comercial"].includes(user.role)

  // Fetch lead with relations
  const { data: lead, error } = await supabase
    .from("leads")
    .select(
      `
      *,
      stage:kanban_stages(id, name, slug, type, color),
      property_interest:properties!property_interest_id(id, name, slug),
      broker:users!assigned_broker_id(id, name, email, avatar_url)
    `
    )
    .eq("id", id)
    .eq("is_active", true)
    .single()

  if (error || !lead) {
    notFound()
  }

  const { data: properties } = canEdit
    ? await supabase.from("properties").select("id, name").eq("is_active", true).order("name")
    : { data: [] as { id: string; name: string }[] }

  const stageArr = lead.stage as unknown as Array<{
    id: string
    name: string
    slug: string
    type: string
    color: string | null
  }> | null
  const stage = stageArr?.[0] ?? null

  const propertyArr = lead.property_interest as unknown as Array<{
    id: string
    name: string
    slug: string
  }> | null
  const property = propertyArr?.[0] ?? null

  const brokerArr = lead.broker as unknown as Array<{
    id: string
    name: string
    email: string
    avatar_url: string | null
  }> | null
  const broker = brokerArr?.[0] ?? null

  // Fetch conversations and messages
  // Note: order + limit on embedded `messages` use referencedTable to limit
  // the nested resource to the 20 most-recent rows per conversation (server-side).
  // The consumer below re-sorts ASC client-side for chronological display.
  const { data: conversations } = await supabase
    .from("conversations")
    .select(
      `
      id, channel, status, last_message_at,
      messages:messages(id, role, content, created_at)
    `
    )
    .eq("lead_id", id)
    .order("last_message_at", { ascending: false })
    .order("created_at", { referencedTable: "messages", ascending: false })
    .limit(5)
    .limit(20, { referencedTable: "messages" })

  // Fetch conversation state (collected_data)
  const { data: convState } = await supabase
    .from("conversation_state")
    .select("collected_data, qualification_step, current_property_id, visit_proposed")
    .eq("conversation_id", conversations?.[0]?.id ?? "")
    .single()

  const collectedData = (convState?.collected_data ?? {}) as Record<string, unknown>

  // Fetch activities
  const { data: activities } = await supabase
    .from("activities")
    .select("id, type, description, created_at, user:users(name)")
    .eq("lead_id", id)
    .order("created_at", { ascending: false })
    .limit(20)

  // Fetch follow-up logs for timeline tab
  const { data: followUpLogs } = await supabase
    .from("follow_up_log")
    .select("id, type, status, message, created_at, sent_at")
    .eq("lead_id", id)
    .order("created_at", { ascending: false })
    .limit(20)

  // Helper to get collected data value as string
  const cd = (key: string): string | null => {
    const v = collectedData[key]
    return v !== null && v !== undefined && v !== "" ? String(v) : null
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/dashboard/leads"
        className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-stone-400 dark:hover:text-stone-200"
      >
        &larr; Voltar para leads
      </Link>

      {/* Header */}
      <div className="rounded-lg bg-white p-6 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">
                {lead.name || "Sem nome"}
              </h1>
              {canEdit && (
                <EditLeadToggle
                  lead={lead as Record<string, unknown>}
                  properties={(properties ?? []).map(p => ({ id: p.id as string, name: p.name as string }))}
                />
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-stone-400">
              <span>{lead.phone}</span>
              {lead.email && <span>{lead.email}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {stage && (
              <span
                className="rounded-full px-3 py-1 text-xs font-medium"
                style={{
                  backgroundColor: stage.color
                    ? `${stage.color}20`
                    : "#f3f4f6",
                  color: stage.color || "#374151",
                }}
              >
                {stage.name}
              </span>
            )}
            {lead.qualification_score != null && (
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  lead.qualification_score >= 70
                    ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300"
                    : lead.qualification_score >= 40
                      ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300"
                      : "bg-gray-100 text-gray-700 dark:bg-stone-700/50 dark:text-stone-200"
                }`}
              >
                Score: {lead.qualification_score}
              </span>
            )}
            {lead.interest_level && (
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  interestLevelColors[lead.interest_level] ??
                  "bg-gray-100 text-gray-700 dark:bg-stone-700/50 dark:text-stone-200"
                }`}
              >
                {interestLevelLabels[lead.interest_level] ??
                  lead.interest_level}
              </span>
            )}
          </div>
        </div>
        {broker && (
          <div className="mt-3 text-sm text-gray-500 dark:text-stone-400">
            Corretor: <span className="font-medium">{broker.name}</span>{" "}
            ({broker.email})
          </div>
        )}
      </div>

      {/* Tab Bar */}
      <div className="flex border-b border-gray-200 dark:border-stone-800">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/dashboard/leads/${id}?tab=${t.key}`}
            className={`px-5 py-3 text-sm font-medium transition-colors ${
              activeTab === t.key
                ? "border-b-2 border-orange-600 text-orange-600 dark:text-orange-300"
                : "text-gray-500 hover:text-gray-700 dark:text-stone-400 dark:hover:text-stone-200"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "info" && (
        <div className="rounded-lg bg-white p-6 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-stone-100">
            Informações
          </h2>
          <dl className="space-y-3">
            <InfoRow label="Empreendimento" value={
              property ? (
                <Link href={`/dashboard/properties/${property.id}`} className="text-orange-600 hover:text-orange-700 dark:text-orange-300 dark:hover:text-orange-200">
                  {property.name}
                </Link>
              ) : (collectedData.property_interest as string) ?? "-"
            } />
            <InfoRow label="Quartos" value={lead.preferred_bedrooms ?? cd("bedrooms")} />
            <InfoRow label="Andar" value={lead.preferred_floor ?? cd("floor")} />
            <InfoRow label="Vista" value={lead.preferred_view ?? cd("view") ?? cd("preferred_view")} />
            <InfoRow label="Vagas" value={lead.preferred_garage_count ?? cd("garages") ?? cd("garage_count")} />
            <InfoRow label="Tem entrada" value={
              lead.has_down_payment === true ? "Sim" :
              lead.has_down_payment === false ? "Não" :
              collectedData.has_down_payment === true ? "Sim" :
              collectedData.has_down_payment === false ? "Não" : null
            } />
            <InfoRow label="Origem" value={lead.source ? (lead.source === "website" && lead.utm_content ? lead.utm_content : (sourceLabels[lead.source] ?? lead.source)) : null} />
            <InfoRow label="Canal" value={lead.channel} />
            <InfoRow label="Etapa qualificação" value={convState?.qualification_step} />
            <InfoRow label="Visita proposta" value={convState?.visit_proposed ? "Sim" : "Não"} />
            <InfoRow label="Como conheceu" value={cd("how_found")} />
            <InfoRow label="Disponibilidade visita" value={cd("visit_availability")} />
            <InfoRow label="Família" value={cd("family_size")} />
            <InfoRow label="Faixa investimento" value={cd("budget_range")} />
            <InfoRow label="Prazo decisão" value={cd("timeline")} />
          </dl>

          {broker && (
            <div className="mt-6 border-t border-gray-100 pt-4 dark:border-stone-800">
              <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-stone-100">Corretor</h3>
              <div className="flex items-center gap-3 text-sm text-gray-700 dark:text-stone-300">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-600 dark:bg-orange-500/15 dark:text-orange-300">
                  {broker.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-medium">{broker.name}</div>
                  <div className="text-gray-400 dark:text-stone-500">{broker.email}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "conversa" && (
        <div className="rounded-lg bg-white p-6 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-stone-100">
            Conversas
          </h2>
          {conversations && conversations.length > 0 ? (
            <div className="space-y-6">
              {conversations.map((conv) => {
                const messages = (conv.messages ?? []) as Array<{
                  id: string
                  role: string
                  content: string
                  created_at: string
                }>
                const sortedMessages = [...messages].sort(
                  (a, b) =>
                    new Date(a.created_at).getTime() -
                    new Date(b.created_at).getTime()
                )

                const channelBadge =
                  conv.channel === "whatsapp"
                    ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300"
                    : conv.channel === "telegram"
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
                      : "bg-gray-100 text-gray-700 dark:bg-stone-700/50 dark:text-stone-200"

                return (
                  <div key={conv.id} className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium uppercase text-gray-400 dark:text-stone-500">
                      <span
                        className={`rounded-full px-2 py-0.5 ${channelBadge}`}
                      >
                        {conv.channel}
                      </span>
                      <span>— {conv.status}</span>
                    </div>
                    <div className="max-h-[500px] space-y-2 overflow-y-auto">
                      {sortedMessages.map((msg) => {
                        const isUser = msg.role === "user"
                        return (
                          <div
                            key={msg.id}
                            className={`flex ${isUser ? "justify-start" : "justify-end"}`}
                          >
                            <div
                              className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                                isUser
                                  ? "bg-gray-100 text-gray-800 dark:bg-stone-800 dark:text-stone-200"
                                  : msg.role === "broker"
                                    ? "bg-blue-100 text-blue-900 dark:bg-blue-500/15 dark:text-blue-200"
                                    : "bg-orange-100 text-orange-900 dark:bg-orange-500/15 dark:text-orange-200"
                              }`}
                            >
                              <div className="mb-1 text-[10px] font-medium uppercase opacity-60">
                                {msg.role === "user"
                                  ? "Lead"
                                  : msg.role === "assistant"
                                    ? "IA"
                                    : msg.role === "broker"
                                      ? "Corretor"
                                      : msg.role}
                              </div>
                              <p className="whitespace-pre-wrap">{msg.content}</p>
                              <div className="mt-1 text-[10px] opacity-50">
                                {new Date(msg.created_at).toLocaleString(
                                  "pt-BR",
                                  {
                                    day: "2-digit",
                                    month: "short",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  }
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-stone-500">Nenhuma conversa registrada.</p>
          )}
        </div>
      )}

      {activeTab === "timeline" && (
        <div className="space-y-4">
          {/* Link to full timeline page */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-stone-100">Atividades</h2>
            <Link
              href={`/dashboard/leads/${id}/timeline`}
              className="rounded-md bg-orange-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-orange-700"
            >
              Ver timeline completa
            </Link>
          </div>

          {/* Activities list */}
          <div className="rounded-lg bg-white p-6 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
            {activities && activities.length > 0 ? (
              <div className="space-y-4">
                {activities.map((activity) => {
                  const activityUserArr = activity.user as unknown as Array<{
                    name: string
                  }> | null
                  const activityUser = activityUserArr?.[0] ?? null

                  return (
                    <div
                      key={activity.id}
                      className="flex items-start gap-3 border-l-2 border-gray-200 pl-4 dark:border-stone-800"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium uppercase text-gray-500 dark:bg-stone-700/50 dark:text-stone-300">
                            {activity.type}
                          </span>
                          {activityUser && (
                            <span className="text-xs text-gray-400 dark:text-stone-500">
                              por {activityUser.name}
                            </span>
                          )}
                        </div>
                        {activity.description && (
                          <p className="mt-1 text-sm text-gray-700 dark:text-stone-300">
                            {activity.description}
                          </p>
                        )}
                        <div className="mt-1 text-xs text-gray-400 dark:text-stone-500">
                          {new Date(activity.created_at).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
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
              <p className="text-sm text-gray-400 dark:text-stone-500">Nenhuma atividade registrada.</p>
            )}
          </div>

          {/* Follow-up logs */}
          {followUpLogs && followUpLogs.length > 0 && (
            <div className="rounded-lg bg-white p-6 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
              <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-stone-100">
                Follow-up logs
              </h3>
              <div className="space-y-3">
                {followUpLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 border-l-2 border-orange-200 pl-4 dark:border-orange-500/30"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
                          {log.type}
                        </span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-stone-700/50 dark:text-stone-300">
                          {log.status}
                        </span>
                      </div>
                      {log.message && (
                        <p className="mt-1 text-sm text-gray-700 dark:text-stone-300">{log.message}</p>
                      )}
                      <div className="mt-1 text-xs text-gray-400 dark:text-stone-500">
                        {new Date(log.sent_at || log.created_at).toLocaleString(
                          "pt-BR",
                          {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          }
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "resumo" && (
        <div className="rounded-lg bg-white p-6 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-stone-100">
              Resumo IA
            </h2>
            <GenerateSummaryButton leadId={id} />
          </div>
          <div className="mt-4">
            {lead.ai_summary ? (
              <>
                <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-stone-300">
                  {lead.ai_summary}
                </p>
                {lead.updated_at && (
                  <p className="mt-3 text-xs text-gray-400 dark:text-stone-500">
                    Última atualização:{" "}
                    {new Date(lead.updated_at).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-400 dark:text-stone-500">
                Nenhum resumo gerado pela IA. Clique em &quot;Gerar resumo&quot; para criar.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: unknown }) {
  const display = value === null || value === undefined || value === "" ? "-" : String(value)
  return (
    <div className="flex justify-between text-sm">
      <dt className="text-stone-500 dark:text-stone-400">{label}</dt>
      <dd className="font-medium text-stone-900 dark:text-stone-100">{typeof value === "object" && value !== null ? value as React.ReactNode : display}</dd>
    </div>
  )
}
