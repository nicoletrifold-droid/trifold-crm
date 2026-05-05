import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { redirect, notFound } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { FotoUploadForm } from "./_components/foto-upload-form"
import { FotoDeleteButton } from "./_components/foto-delete-button"

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
      "id, name, description, progress_pct, status, expected_delivery_date"
    )
    .eq("id", obra_id)
    .eq("org_id", user.orgId)
    .single()

  if (!obra) {
    notFound()
  }

  const [fasesRes, fotosRes] = await Promise.all([
    supabase
      .from("obra_fases")
      .select("id, name, status, order_index")
      .eq("obra_id", obra_id)
      .order("order_index"),
    supabase
      .from("obra_fotos")
      .select("id, storage_path, caption, taken_at, fase_id, created_at")
      .eq("obra_id", obra_id)
      .order("created_at", { ascending: false }),
  ])

  const fases = fasesRes.data ?? []
  const fotos = fotosRes.data ?? []
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""

  const statusBadge = STATUS_BADGE[obra.status] ?? "bg-gray-100 text-gray-700"
  const statusLabel = STATUS_LABEL[obra.status] ?? obra.status

  return (
    <div className="space-y-6">
      {/* Header com voltar */}
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
          <span
            className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium ${statusBadge}`}
          >
            {statusLabel}
          </span>
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

      {/* Upload */}
      <FotoUploadForm obraId={obra.id} fases={fases} />

      {/* Galeria de fotos */}
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
            Fotos ({fotos.length})
          </h2>
        </div>

        {fotos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <p className="text-sm text-gray-500">
              Nenhuma foto cadastrada ainda.
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Use o formulário acima para adicionar fotos.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {fotos.map((foto) => {
              const url = `${supabaseUrl}/storage/v1/object/public/obra-fotos/${foto.storage_path}`
              return (
                <div
                  key={foto.id}
                  className="group relative overflow-hidden rounded-lg border border-gray-200"
                >
                  <div className="relative aspect-square w-full bg-gray-100">
                    <Image
                      src={url}
                      alt={foto.caption ?? "Foto da obra"}
                      fill
                      unoptimized
                      className="object-cover"
                    />
                    <FotoDeleteButton
                      obraId={obra.id}
                      fotoId={foto.id}
                    />
                  </div>
                  {foto.caption && (
                    <p className="truncate px-2 py-1.5 text-xs text-gray-700">
                      {foto.caption}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
