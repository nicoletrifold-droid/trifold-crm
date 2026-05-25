"use client"

import { useCallback, useEffect, useState } from "react"

interface FunnelStages {
  leads_meta: number
  leads_crm: number
  responderam: number
  qualificados: number
  visita_agendada: number
  proposta: number
}

type GargaloKey =
  | "leads_crm"
  | "responderam"
  | "qualificados"
  | "visita_agendada"
  | "proposta"
  | null

interface CampaignFunnelResponse {
  stages: FunnelStages
  gargalo: GargaloKey
  cpl_real: number | null
  taxa_qualificacao: number | null
  taxa_visita: number | null
}

const STAGE_KEYS: (keyof FunnelStages)[] = [
  "leads_meta",
  "leads_crm",
  "responderam",
  "qualificados",
  "visita_agendada",
  "proposta",
]

const STAGE_LABELS: Record<keyof FunnelStages, string> = {
  leads_meta:      "Leads Meta",
  leads_crm:       "Leads CRM",
  responderam:     "Responderam",
  qualificados:    "Qualificados",
  visita_agendada: "Visita Agendada",
  proposta:        "Proposta",
}

const GARGALO_MESSAGES: Record<string, string> = {
  leads_crm:
    "Poucos leads chegam ao CRM. Verifique se o webhook Meta está funcionando ou se há problema no formulário.",
  responderam:
    "Muitos leads não respondem o bot. Considere revisar a mensagem de abordagem inicial.",
  qualificados:
    "Muitos leads respondem mas não se qualificam. Revise as perguntas de qualificação da Nicole.",
  visita_agendada:
    "Leads qualificados não estão agendando visita. Verifique a oferta de visita e disponibilidade de horários.",
  proposta:
    "Visitas acontecem mas poucas chegam à proposta. Foco em preparação da visita e follow-up pós-visita.",
}

interface Props {
  campaignId: string
  period: string
}

export default function CampaignFunnel({ campaignId, period }: Props) {
  const [data, setData] = useState<CampaignFunnelResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(
        `/api/meta-ads/campaigns/${encodeURIComponent(campaignId)}/funnel?period=${period}`,
      )
      if (!r.ok) throw new Error()
      const d = (await r.json()) as CampaignFunnelResponse
      setData(d)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [campaignId, period])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return <div className="h-36 animate-pulse rounded bg-gray-100" />
  }

  if (!data) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">
        Não foi possível carregar o funil de conversão.
      </div>
    )
  }

  const { stages, gargalo, cpl_real, taxa_qualificacao, taxa_visita } = data
  const top = stages.leads_meta

  if (top < 5) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
        Volume insuficiente para análise de funil neste período (mínimo 5 leads Meta).
      </div>
    )
  }

  const fmt = (n: number) => n.toFixed(1).replace(".", ",")

  return (
    <div className="space-y-3">
      {/* Barras horizontais */}
      <div className="space-y-1.5">
        {STAGE_KEYS.map((key, idx) => {
          const count = stages[key]
          const prev = idx > 0 ? stages[STAGE_KEYS[idx - 1]!] : null
          const pctOfTop = top > 0 ? (count / top) * 100 : 0
          const pctOfPrev =
            prev != null && prev > 0 ? (count / prev) * 100 : null
          const isGargalo = key !== "leads_meta" && key === gargalo

          return (
            <div
              key={key}
              className={`relative h-9 rounded overflow-hidden bg-gray-100 ${
                isGargalo ? "ring-2 ring-yellow-400" : ""
              }`}
            >
              <div
                className="absolute inset-y-0 left-0 bg-blue-500 transition-all"
                style={{ width: `${Math.min(pctOfTop, 100)}%` }}
              />
              <div className="absolute inset-0 flex items-center justify-between px-3">
                <span className="text-xs font-semibold text-gray-900 truncate">
                  {isGargalo && "⚠️ "}
                  {STAGE_LABELS[key]}: {count}
                </span>
                <span className="shrink-0 ml-2 text-xs text-gray-700">
                  {fmt(pctOfTop)}% do topo
                  {pctOfPrev !== null && (
                    <span className="hidden sm:inline">
                      {" · "}
                      {fmt(pctOfPrev)}% do ant.
                    </span>
                  )}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Card de insight */}
      {gargalo && (
        <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
          <span className="font-medium">Maior gargalo: </span>
          {GARGALO_MESSAGES[gargalo]}
        </div>
      )}

      {/* Métricas derivadas */}
      <div className="flex flex-wrap gap-4 pt-1 text-sm text-gray-600">
        {cpl_real !== null && (
          <span>
            <span className="font-medium text-gray-900">CPL Real:</span>{" "}
            {new Intl.NumberFormat("pt-BR", {
              style: "currency",
              currency: "BRL",
            }).format(cpl_real)}
          </span>
        )}
        {taxa_qualificacao !== null && (
          <span>
            <span className="font-medium text-gray-900">Qualificação:</span>{" "}
            {fmt(taxa_qualificacao)}%
          </span>
        )}
        {taxa_visita !== null && (
          <span>
            <span className="font-medium text-gray-900">Taxa de Visita:</span>{" "}
            {fmt(taxa_visita)}%
          </span>
        )}
      </div>
    </div>
  )
}
