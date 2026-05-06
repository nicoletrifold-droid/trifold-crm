"use client"

import { useEffect, useState } from "react"
import { createClient } from "@web/lib/supabase/client"
import Link from "next/link"
import { X } from "lucide-react"

interface LeadQuickData {
  id: string
  name: string | null
  phone: string
  email: string | null
  qualification_score: number | null
  interest_level: string | null
  source: string | null
  channel: string | null
  utm_campaign: string | null
  ai_summary: string | null
  created_at: string
  updated_at: string
  has_down_payment: boolean | null
  preferred_bedrooms: number | null
  preferred_floor: string | null
  preferred_view: string | null
  preferred_garage_count: number | null
  stage: { id: string; name: string; color: string | null } | null
  property_interest: { id: string; name: string } | null
  broker: { id: string; name: string; email: string } | null
}

type Message = { id: string; role: string; content: string; created_at: string }

interface LeadDetailDrawerProps {
  leadId: string | null
  onClose: () => void
}

import { INTEREST_LEVEL_LABELS as interestLevelLabels, INTEREST_LEVEL_COLORS as interestLevelColors } from "@web/lib/constants"
import { SourceBadge } from "@web/components/ui/source-badge"

async function fetchLeadData(id: string) {
  const supabase = createClient()

  const [leadRes, { data: conversations }] = await Promise.all([
    fetch(`/api/leads/${id}`),
    supabase
      .from("conversations")
      .select(`id, messages:messages(id, role, content, created_at)`)
      .eq("lead_id", id)
      .order("last_message_at", { ascending: false })
      .limit(1),
  ])

  let lead: LeadQuickData | null = null
  if (leadRes.ok) {
    const json = await leadRes.json() as { data: Record<string, unknown> }
    const raw = json.data
    if (raw) {
      lead = {
        id: raw.id as string,
        name: (raw.name as string | null) ?? null,
        phone: raw.phone as string,
        email: (raw.email as string | null) ?? null,
        qualification_score: (raw.qualification_score as number | null) ?? null,
        interest_level: (raw.interest_level as string | null) ?? null,
        source: (raw.source as string | null) ?? null,
        channel: (raw.channel as string | null) ?? null,
        utm_campaign: (raw.utm_campaign as string | null) ?? null,
        ai_summary: (raw.ai_summary as string | null) ?? null,
        created_at: raw.created_at as string,
        updated_at: raw.updated_at as string,
        has_down_payment: (raw.has_down_payment as boolean | null) ?? null,
        preferred_bedrooms: (raw.preferred_bedrooms as number | null) ?? null,
        preferred_floor: (raw.preferred_floor as string | null) ?? null,
        preferred_view: (raw.preferred_view as string | null) ?? null,
        preferred_garage_count: (raw.preferred_garage_count as number | null) ?? null,
        stage: (raw.stage as LeadQuickData["stage"]) ?? null,
        property_interest: (raw.property_interest as LeadQuickData["property_interest"]) ?? null,
        broker: (raw.broker as LeadQuickData["broker"]) ?? null,
      }
    }
  }

  const msgs = (conversations?.[0]?.messages ?? []) as Message[]
  const sortedMsgs = [...msgs]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)

  return { lead, messages: sortedMsgs }
}

export function LeadDetailDrawer({ leadId, onClose }: LeadDetailDrawerProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    if (leadId) {
      document.addEventListener("keydown", handleEscape)
      return () => document.removeEventListener("keydown", handleEscape)
    }
  }, [leadId, onClose])

  if (!leadId) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto bg-white shadow-2xl"
        style={{ animation: "slideInFromRight 200ms ease-out" }}
      >
        <LeadDetailContent key={leadId} leadId={leadId} onClose={onClose} />
      </div>
    </>
  )
}

function LeadDetailContent({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const [state, setState] = useState<{
    loading: boolean
    lead: LeadQuickData | null
    messages: Message[]
  }>({ loading: true, lead: null, messages: [] })

  useEffect(() => {
    let cancelled = false
    fetchLeadData(leadId).then((result) => {
      if (!cancelled) setState({ loading: false, lead: result.lead, messages: result.messages })
    })
    return () => { cancelled = true }
  }, [leadId])

  const { loading, lead, messages } = state

  const isCTWA = lead?.source === "whatsapp_click_to_ad"

  return (
    <>
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-stone-200 bg-white px-5 py-4">
        <div className="min-w-0 flex-1">
          {loading ? (
            <div className="h-6 w-40 animate-pulse rounded bg-stone-200" />
          ) : (
            <h2 className="truncate text-lg font-bold text-stone-900">
              {lead?.name || lead?.phone || "..."}
            </h2>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/leads/${leadId}`}
            className="rounded-md bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-600 hover:bg-orange-100 transition-colors"
          >
            Ver completo
          </Link>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4 p-5">
          {[80, 95, 70, 88, 75, 92].map((w, i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-stone-100" style={{ width: `${w}%` }} />
          ))}
        </div>
      ) : lead ? (
        <div className="divide-y divide-stone-100">
          {/* Badges */}
          <div className="flex flex-wrap items-center gap-2 px-5 py-4">
            {lead.stage && (
              <span
                className="rounded-full px-2.5 py-1 text-xs font-medium"
                style={{
                  backgroundColor: lead.stage.color ? `${lead.stage.color}20` : "#f3f4f6",
                  color: lead.stage.color || "#374151",
                }}
              >
                {lead.stage.name}
              </span>
            )}
            {lead.qualification_score != null && (
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  lead.qualification_score >= 70
                    ? "bg-green-100 text-green-700"
                    : lead.qualification_score >= 40
                      ? "bg-yellow-100 text-yellow-700"
                      : "bg-gray-100 text-gray-700"
                }`}
              >
                Score: {lead.qualification_score}
              </span>
            )}
            {lead.interest_level && (
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  interestLevelColors[lead.interest_level] ?? "bg-gray-100 text-gray-700"
                }`}
              >
                {interestLevelLabels[lead.interest_level] ?? lead.interest_level}
              </span>
            )}
          </div>

          {/* Contact info */}
          <div className="px-5 py-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-400">
              Contato
            </h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-stone-500">Telefone</dt>
                <dd className="font-medium text-stone-900">{lead.phone}</dd>
              </div>
              {lead.email && (
                <div className="flex justify-between">
                  <dt className="text-stone-500">Email</dt>
                  <dd className="font-medium text-stone-900">{lead.email}</dd>
                </div>
              )}
              {lead.source && (
                <div className="flex justify-between items-center">
                  <dt className="text-stone-500">Origem</dt>
                  <dd><SourceBadge source={lead.source} /></dd>
                </div>
              )}
              {isCTWA && lead.utm_campaign && (
                <div className="flex justify-between items-center">
                  <dt className="text-stone-500">Campanha</dt>
                  <dd className="font-medium text-stone-900 text-right max-w-[60%] truncate">{lead.utm_campaign}</dd>
                </div>
              )}
              {lead.channel && (
                <div className="flex justify-between">
                  <dt className="text-stone-500">Canal</dt>
                  <dd className="font-medium text-stone-900">{lead.channel}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Property & preferences */}
          <div className="px-5 py-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-400">
              Interesse
            </h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-stone-500">Empreendimento</dt>
                <dd className="font-medium text-stone-900">
                  {lead.property_interest?.name ?? "-"}
                </dd>
              </div>
              {lead.preferred_bedrooms != null && (
                <div className="flex justify-between">
                  <dt className="text-stone-500">Quartos</dt>
                  <dd className="font-medium text-stone-900">{lead.preferred_bedrooms}</dd>
                </div>
              )}
              {lead.preferred_floor && (
                <div className="flex justify-between">
                  <dt className="text-stone-500">Andar</dt>
                  <dd className="font-medium text-stone-900">{lead.preferred_floor}</dd>
                </div>
              )}
              {lead.preferred_view && (
                <div className="flex justify-between">
                  <dt className="text-stone-500">Vista</dt>
                  <dd className="font-medium text-stone-900">{lead.preferred_view}</dd>
                </div>
              )}
              {lead.preferred_garage_count != null && (
                <div className="flex justify-between">
                  <dt className="text-stone-500">Vagas</dt>
                  <dd className="font-medium text-stone-900">{lead.preferred_garage_count}</dd>
                </div>
              )}
              {lead.has_down_payment != null && (
                <div className="flex justify-between">
                  <dt className="text-stone-500">Tem entrada</dt>
                  <dd className="font-medium text-stone-900">
                    {lead.has_down_payment ? "Sim" : "Não"}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Broker */}
          {lead.broker && (
            <div className="px-5 py-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-400">
                Corretor
              </h3>
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-600">
                  {lead.broker.name.charAt(0).toUpperCase()}
                </div>
                <div className="text-sm">
                  <div className="font-medium text-stone-900">{lead.broker.name}</div>
                  <div className="text-stone-400">{lead.broker.email}</div>
                </div>
              </div>
            </div>
          )}

          {/* AI Summary */}
          {lead.ai_summary && (
            <div className="px-5 py-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-400">
                Resumo IA
              </h3>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-700">
                {lead.ai_summary}
              </p>
            </div>
          )}

          {/* Recent messages */}
          {messages.length > 0 && (
            <div className="px-5 py-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-400">
                Últimas mensagens
              </h3>
              <div className="space-y-2">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`rounded-lg px-3 py-2 text-sm ${
                      msg.role === "user"
                        ? "bg-stone-100 text-stone-800"
                        : msg.role === "broker"
                          ? "bg-blue-50 text-blue-900"
                          : "bg-orange-50 text-orange-900"
                    }`}
                  >
                    <div className="mb-0.5 text-[10px] font-medium uppercase opacity-60">
                      {msg.role === "user"
                        ? "Lead"
                        : msg.role === "assistant"
                          ? "IA"
                          : msg.role === "broker"
                            ? "Corretor"
                            : msg.role}
                    </div>
                    <p className="line-clamp-3 whitespace-pre-wrap">{msg.content}</p>
                    <div className="mt-1 text-[10px] opacity-50">
                      {new Date(msg.created_at).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <Link
                href={`/dashboard/leads/${leadId}?tab=conversa`}
                className="mt-3 inline-block text-xs font-medium text-orange-600 hover:text-orange-700"
              >
                Ver conversa completa &rarr;
              </Link>
            </div>
          )}

          {/* Timestamps */}
          <div className="px-5 py-4 text-xs text-stone-400">
            <div>
              Criado: {new Date(lead.created_at).toLocaleString("pt-BR", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </div>
            <div>
              Atualizado: {new Date(lead.updated_at).toLocaleString("pt-BR", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-5 text-sm text-stone-400">Lead não encontrado.</div>
      )}
    </>
  )
}
