import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { ObraDetailTabs } from "./_components/obra-detail-tabs"
import { ObraEditButton } from "./_components/obra-edit-button"

const STATUS_LABEL: Record<string, string> = {
  em_andamento: "Em andamento",
  concluida: "Concluída",
  pausada: "Pausada",
}

const STATUS_BADGE: Record<string, string> = {
  em_andamento: "bg-amber-100 text-amber-700",
  concluida: "bg-green-100 text-green-700",
  pausada: "bg-gray-100 text-gray-700",
}

function formatDeliveryDate(date: string | null): string {
  if (!date) return "A definir"
  return new Date(date).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  })
}

export default async function ObraDetailPage({
  params,
}: {
  params: Promise<{ obra_id: string }>
}) {
  const user = await getServerUser()

  if (user.role !== "admin" && user.role !== "supervisor") {
    redirect("/dashboard")
  }

  const { obra_id } = await params
  const supabase = await createClient()

  const { data: obra } = await supabase
    .from("obras")
    .select(
      "id, name, description, progress_pct, status, expected_delivery_date, property_id"
    )
    .eq("id", obra_id)
    .eq("org_id", user.orgId)
    .single()

  if (!obra) {
    notFound()
  }

  const [fasesRes, fotosRes, documentosRes, mensagensRes, clientesRes] =
    await Promise.all([
      supabase
        .from("obra_fases")
        .select(
          "id, name, description, status, progress_pct, order_index, start_date, end_date, expected_start_date, expected_end_date"
        )
        .eq("obra_id", obra_id)
        .order("order_index"),
      supabase
        .from("obra_fotos")
        .select("id, storage_path, caption, taken_at, fase_id, created_at")
        .eq("obra_id", obra_id)
        .order("created_at", { ascending: false }),
      supabase
        .from("obra_documentos")
        .select("id, name, filename, category, file_size_bytes, created_at")
        .eq("obra_id", obra_id)
        .order("created_at", { ascending: false }),
      supabase
        .from("obra_mensagens")
        .select(
          "id, content, message_type, storage_path, sender_type, created_at, sender_display_name"
        )
        .eq("obra_id", obra_id)
        .order("created_at", { ascending: true }),
      supabase
        .from("cliente_obras")
        .select("is_primary, users(id, name, email)")
        .eq("obra_id", obra_id),
    ])

  const fases = fasesRes.data ?? []
  const fotos = fotosRes.data ?? []
  const documentos = documentosRes.data ?? []
  const mensagens = mensagensRes.data ?? []
  const clientesRaw = clientesRes.data ?? []

  const clientes = clientesRaw.map((row) => {
    const u = Array.isArray(row.users) ? row.users[0] : row.users
    return {
      id: u?.id ?? "",
      name: u?.name ?? "",
      email: u?.email ?? "",
      is_primary: row.is_primary,
    }
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  const statusBadge = STATUS_BADGE[obra.status] ?? "bg-gray-100 text-gray-700"
  const statusLabel = STATUS_LABEL[obra.status] ?? obra.status

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/dashboard/obras"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para Obras
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{obra.name}</h1>
            {obra.description && (
              <p className="mt-1 text-sm text-gray-500">{obra.description}</p>
            )}
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${statusBadge}`}
            >
              {statusLabel}
            </span>
            <ObraEditButton obra={obra} />
          </div>
        </div>
      </div>

      {/* Informações */}
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
          Informações
        </h2>

        <div className="mb-4">
          <div className="mb-1.5 flex justify-between text-sm">
            <span className="text-gray-500">Progresso geral</span>
            <span className="font-medium text-gray-900">
              {obra.progress_pct}%
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-200">
            <div
              className="h-2 rounded-full bg-orange-500 transition-all"
              style={{ width: `${obra.progress_pct}%` }}
            />
          </div>
        </div>

        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-gray-500">Status</dt>
            <dd className="font-medium text-gray-900">{statusLabel}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Previsão de entrega</dt>
            <dd className="font-medium text-gray-900">
              {formatDeliveryDate(obra.expected_delivery_date)}
            </dd>
          </div>
        </dl>
      </section>

      {/* Tabs */}
      <ObraDetailTabs
        obraId={obra.id}
        adminName={user.name ?? "Admin"}
        fases={fases}
        fotos={fotos}
        documentos={documentos}
        mensagens={mensagens}
        clientes={clientes}
        supabaseUrl={supabaseUrl}
      />
    </div>
  )
}
