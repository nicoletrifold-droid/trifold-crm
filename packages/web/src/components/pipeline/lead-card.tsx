"use client"

import { useState } from "react"
import { Building2 } from "lucide-react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { MANDATORY_FIELDS } from "@trifold/shared"
import { getDaysSinceContact, getTimeAgo } from "@web/lib/time"
import { SourceBadge } from "@web/components/ui/source-badge"
import { ehIdMeta } from "@web/lib/leads/meta-utm"
import { QualificacaoComercialBadge } from "@web/components/ui/qualificacao-comercial-badge"
import { WaitingBadge } from "@web/components/leads/waiting-badge"
import { CreativeChip } from "@web/components/pipeline/creative-chip"
import { CreativePreviewModal } from "@web/components/pipeline/creative-preview-modal"
import type { CreativeData } from "@web/lib/pipeline/types"

interface LeadCardProps {
  lead: {
    id: string
    name: string | null
    phone: string
    qualification_score: number | null
    interest_level: string | null
    // Story 84-2 (Epic 84) — Qualificação Comercial: aditivo, NÃO substitui qualification_score
    qualificacao_comercial?: string | null
    property_interest_id: string | null
    assigned_broker_id: string | null
    created_at: string
    updated_at: string
    last_contact_at?: string | null
    ai_summary?: string | null
    source?: string | null
    utm_campaign?: string | null
    utm_content?: string | null
    // Story 50-2 (Epic 50): criativo Meta resolvido server-side via fetchCreativesForLeads
    creative?: CreativeData | null
    // Story 75-91: minutos aguardando atendimento (só leads em "Aguardando" não atendidos).
    waitingMinutes?: number | null
    // Pipeline IMOB (2026-08-31): imobiliária parceira resolvida server-side
    // (fetchImobiliariaNomePorLead). Só o board do IMOB preenche.
    imobiliaria_nome?: string | null
  }
  propertyName?: string
  brokerName?: string
  onSelect?: (leadId: string) => void
  /**
   * Pipeline IMOB (2026-08-31) — 'imob' troca o progresso X/3 do cadastro (que
   * a equipe IMOB não usa) pelo nome da imobiliária parceira. Default: funil
   * principal, card inalterado.
   */
  segmento?: string
}

type PropertyBadge = { label: string; bg: string; text: string; dot: string }
const PROPERTY_BADGE_UNKNOWN: PropertyBadge = {
  label: "—", bg: "bg-stone-50 dark:bg-stone-800", text: "text-stone-400 dark:text-stone-500", dot: "bg-stone-300 dark:bg-stone-600",
}
const PROPERTY_BADGE: Record<string, PropertyBadge> = {
  vind: { label: "Vind", bg: "bg-emerald-50 dark:bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-400" },
  yarden: { label: "Yarden", bg: "bg-blue-50 dark:bg-blue-500/15", text: "text-blue-700 dark:text-blue-300", dot: "bg-blue-400" },
  both: { label: "Ambos", bg: "bg-violet-50 dark:bg-violet-500/15", text: "text-violet-700 dark:text-violet-300", dot: "bg-violet-400" },
  unknown: PROPERTY_BADGE_UNKNOWN,
}

function getMandatoryFieldsFilled(lead: LeadCardProps["lead"]): number {
  let filled = 0
  for (const field of MANDATORY_FIELDS) {
    const value = (lead as Record<string, unknown>)[field.key]
    if (value !== null && value !== undefined && value !== "") filled++
  }
  return filled
}

// Story 75-55 — rótulos dos campos obrigatórios ainda NÃO preenchidos (p/ o tooltip do X/3).
function getMissingMandatoryLabels(lead: LeadCardProps["lead"]): string[] {
  const missing: string[] = []
  for (const field of MANDATORY_FIELDS) {
    const value = (lead as Record<string, unknown>)[field.key]
    if (value === null || value === undefined || value === "") missing.push(field.label)
  }
  return missing
}

export function LeadCard({ lead, propertyName, brokerName, onSelect, segmento }: LeadCardProps) {
  // Story 50-2: estado do modal de preview do criativo (cada card gerencia o próprio)
  const [previewOpen, setPreviewOpen] = useState(false)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lead.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    touchAction: 'none' as const,
  }

  // Pipeline IMOB: variante do card (X/3 → imobiliária parceira).
  const isImob = segmento === "imob"

  const score = lead.qualification_score ?? 0
  const scoreColor =
    score >= 70 ? "text-emerald-600 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-500/15" :
    score >= 40 ? "text-amber-600 bg-amber-50 dark:text-amber-300 dark:bg-amber-500/15" :
    "text-stone-400 bg-stone-50 dark:text-stone-400 dark:bg-stone-800"

  // Story 75-110: "dias sem contato" = desde o ÚLTIMO CONTATO real (mensagem ou registro
  // manual no Histórico), não desde updated_at (que não muda ao registrar contato).
  const contactRef = lead.last_contact_at ?? lead.updated_at
  const daysSinceContact = getDaysSinceContact(contactRef)
  const needsFollowUp = daysSinceContact > 2
  const isUrgent = daysSinceContact > 4

  const alertBorderClass = isUrgent
    ? "border-red-400 dark:border-red-500/50"
    : needsFollowUp
    ? "border-orange-400 dark:border-orange-500/50"
    : "border-stone-200 dark:border-stone-800"

  const timeAgo = getTimeAgo(contactRef)
  const filledCount = getMandatoryFieldsFilled(lead)
  const totalMandatory = MANDATORY_FIELDS.length
  const fillPercent = Math.round((filledCount / totalMandatory) * 100)
  // Story 75-55 — tooltip explicando o X/3 (cadastro do lead) e o que falta.
  const missingMandatory = getMissingMandatoryLabels(lead)
  const fillTitle =
    missingMandatory.length === 0
      ? `Cadastro do lead completo (${filledCount} de ${totalMandatory} obrigatórios)`
      : `Cadastro do lead: ${filledCount} de ${totalMandatory} obrigatórios · Faltando: ${missingMandatory.join(", ")}`

  const interestKey = propertyName?.toLowerCase().includes("vind") ? "vind" :
    propertyName?.toLowerCase().includes("yarden") ? "yarden" : "unknown"
  const badge = PROPERTY_BADGE[interestKey] ?? PROPERTY_BADGE_UNKNOWN

  const summaryPreview = lead.ai_summary
    ? lead.ai_summary.length > 80 ? lead.ai_summary.slice(0, 80) + "..." : lead.ai_summary
    : null

  const initials = brokerName
    ? brokerName.split(" ").map((n) => n[0]).join("").slice(0, 2)
    : null

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group cursor-grab rounded-xl border bg-white p-3 transition-all hover:shadow-md active:cursor-grabbing dark:bg-stone-900 ${alertBorderClass} ${needsFollowUp ? "border-2" : ""} ${!needsFollowUp ? "hover:border-stone-300 dark:hover:border-stone-700" : ""}`}
    >
      <div
        onClick={(e) => {
          // Only trigger if not dragging (no significant pointer movement)
          if (onSelect && !isDragging) {
            e.preventDefault()
            onSelect(lead.id)
          }
        }}
        className="block"
      >
        {/* Header: Name + Score */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-stone-900 dark:text-stone-100">
              {lead.name || lead.phone}
            </p>
            {lead.name && (
              <p className="truncate text-[11px] text-stone-400 dark:text-stone-500">{lead.phone}</p>
            )}
          </div>
          {score > 0 && (
            <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${scoreColor}`}>
              {score}
            </span>
          )}
        </div>

        {/* Story 75-91 — "⏱ aguardando há X" (só leads em "Aguardando atendimento" não atendidos). */}
        {lead.waitingMinutes != null && (
          <div className="mt-1">
            <WaitingBadge minutes={lead.waitingMinutes} />
          </div>
        )}

        {/* Property Badge + Source/Creative + Progress — flex-wrap: o rótulo
            "WhatsApp Patrocinado" é mais largo que o antigo "Click-to-Ad" */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <QualificacaoComercialBadge value={lead.qualificacao_comercial ?? null} size="xs" />

          <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${badge.bg} ${badge.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
            {badge.label}
          </span>

          {/* Story 50-2 (Epic 50): CreativeChip substitui SourceBadge quando há criativo Meta resolvido.
              Fallback gracioso para SourceBadge + utm_content (ad_name) quando creative === null. */}
          {lead.creative ? (
            <CreativeChip
              adId={lead.creative.adId}
              adName={lead.creative.adName}
              campaignName={lead.creative.campaignName ?? undefined}
              thumbnailUrl={lead.creative.thumbnailUrl ?? undefined}
              imageUrl={lead.creative.imageUrl ?? undefined}
              onPreviewClick={() => setPreviewOpen(true)}
            />
          ) : (
            <>
              {/* Story 75-365 — utm_content/utm_campaign podem carregar o ID
                  numérico do Meta ({{ad.id}}/{{campaign.id}}); ID cru nunca
                  vira label — o badge fica só com o rótulo da origem. */}
              {lead.source && (
                <SourceBadge
                  source={lead.source}
                  label={!ehIdMeta(lead.utm_content) ? (lead.utm_content ?? undefined) : undefined}
                  size="xs"
                />
              )}
              {lead.source === "whatsapp_click_to_ad" && lead.utm_campaign && !ehIdMeta(lead.utm_campaign) && (
                <span className="inline-flex items-center rounded-md bg-green-50 px-1.5 py-0.5 text-[9px] font-medium text-green-600 dark:bg-green-500/15 dark:text-green-300">
                  {lead.utm_campaign.length > 16 ? lead.utm_campaign.slice(0, 16) + "…" : lead.utm_campaign}
                </span>
              )}
            </>
          )}

          {/* Pipeline IMOB (2026-08-31) — no IMOB o X/3 do cadastro não diz nada
              (decisão do Marcos): o que importa é DE QUAL parceira o lead veio.
              Sem imobiliária resolvida, nada é renderizado. */}
          {isImob ? (
            lead.imobiliaria_nome && (
              <span
                className="inline-flex min-w-0 flex-1 items-center justify-end gap-1 text-[10px] font-medium text-stone-500 dark:text-stone-400"
                title={`Imobiliária parceira: ${lead.imobiliaria_nome}`}
              >
                <Building2 className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{lead.imobiliaria_nome}</span>
              </span>
            )
          ) : (
            <div className="flex flex-1 items-center gap-1.5" title={fillTitle}>
              <div className="h-1 flex-1 rounded-full bg-stone-100 dark:bg-stone-700">
                <div
                  className="h-1 rounded-full bg-orange-400 transition-all"
                  style={{ width: `${fillPercent}%` }}
                />
              </div>
              <span className="text-[9px] tabular-nums text-stone-300 dark:text-stone-500">
                {filledCount}/{totalMandatory}
              </span>
            </div>
          )}
        </div>

        {/* AI Summary Preview */}
        {summaryPreview && (
          <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-stone-500 dark:text-stone-400">
            {summaryPreview}
          </p>
        )}

        {/* Follow-up Alert Badge */}
        {needsFollowUp && (
          <div className="mt-2 flex items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                isUrgent
                  ? "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300"
                  : "bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300"
              }`}
            >
              {daysSinceContact}d sem contato
            </span>
            <span className="text-[10px] text-stone-400 dark:text-stone-500">
              {lead.assigned_broker_id ? "Corretor" : "Nicole"}
            </span>
          </div>
        )}

        {/* Footer: Broker + Time */}
        <div className="mt-2.5 flex items-center justify-between">
          {initials ? (
            <div className="flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-100 text-[9px] font-bold text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
                {initials}
              </span>
              <span className="text-[10px] text-stone-400 dark:text-stone-500">{brokerName?.split(" ")[0]}</span>
            </div>
          ) : (
            <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-400 dark:bg-red-500/15 dark:text-red-300">
              Sem corretor
            </span>
          )}
          <span className="text-[10px] tabular-nums text-stone-300 dark:text-stone-600">{timeAgo}</span>
        </div>
      </div>

      {/* Story 50-2: CreativePreviewModal (render condicional só quando há criativo + modal aberto) */}
      {lead.creative && (
        <CreativePreviewModal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          adId={lead.creative.adId}
          adName={lead.creative.adName}
          campaignName={lead.creative.campaignName}
          thumbnailUrl={lead.creative.thumbnailUrl}
          imageUrl={lead.creative.imageUrl}
          metaCampaignId={lead.creative.metaCampaignId}
        />
      )}
    </div>
  )
}

