import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import Link from "next/link"
import { notFound } from "next/navigation"
import { CampaignActions } from "./campaign-actions"
import { EntriesTable } from "./entries-table"

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  draft: { label: "Rascunho", className: "bg-gray-100 text-gray-600" },
  active: { label: "Ativa", className: "bg-green-100 text-green-700" },
  paused: { label: "Pausada", className: "bg-yellow-100 text-yellow-700" },
  ended: { label: "Encerrada", className: "bg-red-100 text-red-700" },
}

function MetricCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  await getServerUser()
  const supabase = await createClient()

  const { data: campaign } = await supabase
    .from("campaigns")
    .select(`*, properties:property_id(name)`)
    .eq("id", id)
    .single()

  if (!campaign) notFound()

  // Get all entries for metrics
  const { data: entries } = await supabase
    .from("campaign_entries")
    .select(
      "id, name, phone, email, custom_data, whatsapp_status, email_status, is_valid_phone, is_valid_email, has_responded, created_at"
    )
    .eq("campaign_id", id)
    .order("created_at", { ascending: false })

  const e = entries ?? []
  const total = e.length
  const waDelivered = e.filter((x) => ["delivered", "read"].includes(x.whatsapp_status)).length
  const emailOpened = e.filter((x) => ["opened", "clicked"].includes(x.email_status)).length
  const emailClicked = e.filter((x) => x.email_status === "clicked").length
  const valid = e.filter((x) => x.is_valid_phone && x.is_valid_email).length
  const responded = e.filter((x) => x.has_responded).length

  const pct = (n: number) => (total > 0 ? `${Math.round((n / total) * 100)}%` : "0%")

  const badge = STATUS_BADGES[campaign.status] ?? STATUS_BADGES.draft
  const prop = Array.isArray(campaign.properties) ? campaign.properties[0] : campaign.properties

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{campaign.name}</h1>
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>
              {badge.label}
            </span>
          </div>
          {(prop as { name: string } | null)?.name && (
            <p className="mt-1 text-sm text-gray-500">{(prop as { name: string }).name}</p>
          )}
          {campaign.description && (
            <p className="mt-1 text-sm text-gray-400">{campaign.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          <CampaignActions campaignId={id} status={campaign.status} />
          <Link
            href={`/dashboard/pipeline?campaign_id=${id}`}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            Ver no Pipeline
          </Link>
          <Link
            href={`/dashboard/campaigns/${id}/editar`}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            Editar
          </Link>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <MetricCard label="Cadastros" value={total} />
        <MetricCard label="WhatsApp entregues" value={waDelivered} sub={`${pct(waDelivered)} do total`} />
        <MetricCard label="E-mail abertos" value={emailOpened} sub={`${pct(emailOpened)} do total`} />
        <MetricCard label="Leads validos" value={valid} sub={`${pct(valid)} do total`} />
        <MetricCard label="Responderam" value={responded} sub={`${pct(responded)} do total`} />
      </div>

      {/* Detail breakdown */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">WhatsApp</h3>
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <div><p className="font-bold text-gray-900">{e.filter(x => x.whatsapp_status !== "pending").length}</p><p className="text-gray-400">Enviados</p></div>
            <div><p className="font-bold text-gray-900">{waDelivered}</p><p className="text-gray-400">Entregues</p></div>
            <div><p className="font-bold text-gray-900">{e.filter(x => x.whatsapp_status === "read").length}</p><p className="text-gray-400">Lidos</p></div>
            <div><p className="font-bold text-red-600">{e.filter(x => x.whatsapp_status === "failed").length}</p><p className="text-gray-400">Falharam</p></div>
          </div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">E-mail</h3>
          <div className="grid grid-cols-5 gap-2 text-center text-xs">
            <div><p className="font-bold text-gray-900">{e.filter(x => x.email_status !== "pending").length}</p><p className="text-gray-400">Enviados</p></div>
            <div><p className="font-bold text-gray-900">{e.filter(x => ["delivered","opened","clicked"].includes(x.email_status)).length}</p><p className="text-gray-400">Entregues</p></div>
            <div><p className="font-bold text-gray-900">{emailOpened}</p><p className="text-gray-400">Abertos</p></div>
            <div><p className="font-bold text-blue-600">{emailClicked}</p><p className="text-gray-400">Cliques</p></div>
            <div><p className="font-bold text-red-600">{e.filter(x => x.email_status === "bounced").length}</p><p className="text-gray-400">Bounced</p></div>
          </div>
        </div>
      </div>

      {/* Entries Table */}
      <EntriesTable entries={e} />
    </div>
  )
}
