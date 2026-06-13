"use client"

import { useEffect, useState } from "react"
import type { PlacementRow } from "@web/app/api/meta-ads/campaigns/[campaign_id]/placement/route"

const PLATFORM_LABELS: Record<string, string> = {
  facebook:         "Facebook",
  instagram:        "Instagram",
  audience_network: "Audience Network",
  messenger:        "Messenger",
}

const POSITION_LABELS: Record<string, string> = {
  feed:               "Feed",
  story:              "Stories",
  reels:              "Reels",
  video_feeds:        "Video Feed",
  instream_video:     "In-Stream Video",
  marketplace:        "Marketplace",
  search:             "Busca",
  instant_article:    "Instant Article",
  right_hand_column:  "Coluna Direita",
  suggested_video:    "Vídeo Sugerido",
  profile_feed:       "Feed de Perfil",
}

function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}
function formatPct(n: number): string {
  return `${n.toFixed(2).replace(".", ",")}%`
}

interface Props { campaignId: string }

export default function CampaignPlacement({ campaignId }: Props) {
  const [placements, setPlacements] = useState<PlacementRow[]>([])
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    void fetch(`/api/meta-ads/campaigns/${encodeURIComponent(campaignId)}/placement`)
      .then((r) => r.json())
      .then((d: { placements?: PlacementRow[] }) => setPlacements(d.placements ?? []))
      .catch(() => setPlacements([]))
      .finally(() => setLoading(false))
  }, [campaignId])

  if (loading) {
    return <div className="h-24 animate-pulse rounded bg-gray-100 dark:bg-stone-800" />
  }

  if (placements.length === 0) {
    return (
      <p className="text-sm text-gray-400 italic">
        Dados de posicionamento ainda não sincronizados. Execute o sync semanal.
      </p>
    )
  }

  const totalSpend = placements.reduce((s, p) => s + p.spend, 0)

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-stone-800">
        <thead className="bg-gray-50 dark:bg-stone-800/50">
          <tr>
            {["Plataforma", "Posição", "Spend", "% Budget", "Impressões", "CTR", "Leads", "CPL"].map((h) => (
              <th
                key={h}
                className={`px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-stone-400 ${
                  h === "Plataforma" || h === "Posição" ? "text-left" : "text-right"
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-stone-800">
          {placements.map((p) => {
            const sharePct = totalSpend > 0 ? (p.spend / totalSpend) * 100 : 0
            return (
              <tr key={`${p.publisher_platform}::${p.platform_position}`} className="hover:bg-gray-50 dark:hover:bg-stone-800/30">
                <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-stone-100">
                  {PLATFORM_LABELS[p.publisher_platform] ?? p.publisher_platform}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 dark:text-stone-300">
                  {POSITION_LABELS[p.platform_position] ?? p.platform_position}
                </td>
                <td className="px-4 py-3 text-right text-sm font-medium text-gray-900 dark:text-stone-100">
                  {formatBRL(p.spend)}
                </td>
                <td className="px-4 py-3 text-right text-sm text-gray-500 dark:text-stone-400">
                  <div className="flex items-center justify-end gap-2">
                    <span className="w-12 text-right">{sharePct.toFixed(1)}%</span>
                    <div className="h-1.5 w-16 rounded-full bg-gray-200 dark:bg-stone-700">
                      <div
                        className="h-1.5 rounded-full bg-blue-500"
                        style={{ width: `${Math.min(100, sharePct)}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-sm text-gray-700 dark:text-stone-300">
                  {p.impressions.toLocaleString("pt-BR")}
                </td>
                <td className="px-4 py-3 text-right text-sm text-gray-700 dark:text-stone-300">
                  {formatPct(p.ctr)}
                </td>
                <td className="px-4 py-3 text-right text-sm font-medium text-gray-900 dark:text-stone-100">
                  {p.leads}
                </td>
                <td className="px-4 py-3 text-right text-sm text-gray-700 dark:text-stone-300">
                  {p.cpl !== null ? formatBRL(p.cpl) : "—"}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
