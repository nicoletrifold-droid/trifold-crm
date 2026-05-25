import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import Link from "next/link"

function CampaignsTabs() {
  return (
    <div className="flex border-b border-gray-200 mb-4 dark:border-stone-800">
      <Link
        href="/dashboard/campaigns"
        className="px-4 py-2 text-sm font-medium border-b-2 border-orange-600 text-orange-600 dark:text-orange-300"
      >
        CRM
      </Link>
      <Link
        href="/dashboard/campaigns/meta"
        className="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-colors dark:text-stone-400 dark:hover:text-stone-200 dark:hover:border-stone-700"
      >
        Meta Ads
      </Link>
    </div>
  )
}

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  draft: { label: "Rascunho", className: "bg-gray-100 text-gray-600 dark:bg-stone-700/50 dark:text-stone-300" },
  active: { label: "Ativa", className: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300" },
  paused: { label: "Pausada", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300" },
  ended: { label: "Encerrada", className: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" },
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

  // Get entry counts via COUNT queries (avoids transferring all rows)
  const campaignIds = (campaigns ?? []).map((c) => c.id)
  const entryCounts: Record<string, { total: number; valid: number }> = {}

  if (campaignIds.length > 0) {
    const countResults = await Promise.all(
      campaignIds.map(async (id) => {
        const [{ count: total }, { count: valid }] = await Promise.all([
          supabase
            .from("campaign_entries")
            .select("*", { count: "exact", head: true })
            .eq("campaign_id", id),
          supabase
            .from("campaign_entries")
            .select("*", { count: "exact", head: true })
            .eq("campaign_id", id)
            .eq("is_valid_phone", true)
            .eq("is_valid_email", true),
        ])
        return [id, { total: total ?? 0, valid: valid ?? 0 }] as const
      })
    )
    for (const [id, counts] of countResults) {
      entryCounts[id] = counts
    }
  }

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Campanhas</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-stone-400">
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
        <div className="flex flex-col items-center justify-center rounded-lg bg-white p-12 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <p className="text-lg font-medium text-gray-600 dark:text-stone-300">Nenhuma campanha criada</p>
          <p className="mt-1 text-sm text-gray-400 dark:text-stone-500">
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
        <div className="overflow-hidden rounded-lg bg-white shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-stone-800">
            <thead className="bg-gray-50 dark:bg-stone-800/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-stone-400">Nome</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-stone-400">Empreendimento</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-stone-400">Periodo</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-stone-400">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-stone-400">Cadastros</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-stone-400">Validos</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-stone-400">Taxa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-stone-800">
              {campaigns.map((c) => {
                const counts = entryCounts[c.id] ?? { total: 0, valid: 0 }
                const rate = counts.total > 0 ? Math.round((counts.valid / counts.total) * 100) : 0
                const badge = STATUS_BADGES[c.status] ?? STATUS_BADGES.draft!
                const prop = Array.isArray(c.properties) ? c.properties[0] : c.properties

                return (
                  <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-stone-800/30">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/campaigns/${c.id}`} className="font-medium text-gray-900 hover:text-orange-700 dark:text-stone-100 dark:hover:text-orange-300">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-stone-400">
                      {(prop as { name: string } | null)?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-stone-400">
                      {formatDate(c.starts_at)} — {formatDate(c.ends_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-gray-900 dark:text-stone-100">{counts.total}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-gray-900 dark:text-stone-100">{counts.valid}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-500 dark:text-stone-400">{rate}%</td>
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
