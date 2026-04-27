import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import Link from "next/link"

function CampaignsTabs() {
  return (
    <div className="flex border-b border-gray-200 mb-4">
      <Link
        href="/dashboard/campaigns"
        className="px-4 py-2 text-sm font-medium border-b-2 border-orange-600 text-orange-600"
      >
        CRM
      </Link>
      <Link
        href="/dashboard/campaigns/meta"
        className="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-colors"
      >
        Meta Ads
      </Link>
    </div>
  )
}

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  draft: { label: "Rascunho", className: "bg-gray-100 text-gray-600" },
  active: { label: "Ativa", className: "bg-green-100 text-green-700" },
  paused: { label: "Pausada", className: "bg-yellow-100 text-yellow-700" },
  ended: { label: "Encerrada", className: "bg-red-100 text-red-700" },
}

export default async function CampaignsPage() {
  const user = await getServerUser()
  const supabase = await createClient()

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select(
      `id, name, slug, starts_at, ends_at, status, created_at,
       properties:property_id(name)`
    )
    .order("created_at", { ascending: false })

  // Get entry counts
  const campaignIds = (campaigns ?? []).map((c) => c.id)
  let entryCounts: Record<string, { total: number; valid: number }> = {}

  if (campaignIds.length > 0) {
    const { data: entries } = await supabase
      .from("campaign_entries")
      .select("campaign_id, is_valid_phone, is_valid_email")
      .in("campaign_id", campaignIds)

    entryCounts = (entries ?? []).reduce(
      (acc, e) => {
        const cid = e.campaign_id
        if (!acc[cid]) acc[cid] = { total: 0, valid: 0 }
        acc[cid].total++
        if (e.is_valid_phone && e.is_valid_email) acc[cid].valid++
        return acc
      },
      {} as Record<string, { total: number; valid: number }>
    )
  }

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campanhas</h1>
          <p className="mt-1 text-sm text-gray-500">
            Gerencie acoes de marketing e acompanhe performance
          </p>
        </div>
        <Link
          href="/dashboard/campaigns/nova"
          className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
        >
          + Nova Campanha
        </Link>
      </div>

      <CampaignsTabs />

      {(!campaigns || campaigns.length === 0) ? (
        <div className="flex flex-col items-center justify-center rounded-lg bg-white p-12 shadow-sm">
          <p className="text-lg font-medium text-gray-600">Nenhuma campanha criada</p>
          <p className="mt-1 text-sm text-gray-400">
            Crie sua primeira campanha para comecar a capturar leads
          </p>
          <Link
            href="/dashboard/campaigns/nova"
            className="mt-4 rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
          >
            Criar campanha
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Nome</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Empreendimento</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Periodo</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Cadastros</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Validos</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Taxa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {campaigns.map((c) => {
                const counts = entryCounts[c.id] ?? { total: 0, valid: 0 }
                const rate = counts.total > 0 ? Math.round((counts.valid / counts.total) * 100) : 0
                const badge = STATUS_BADGES[c.status] ?? STATUS_BADGES.draft
                const prop = Array.isArray(c.properties) ? c.properties[0] : c.properties

                return (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/campaigns/${c.id}`} className="font-medium text-gray-900 hover:text-orange-700">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {(prop as { name: string } | null)?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatDate(c.starts_at)} — {formatDate(c.ends_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">{counts.total}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">{counts.valid}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-500">{rate}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
