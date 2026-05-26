import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { ObraDetailTabs } from "./_components/obra-detail-tabs"
import { ObraEditButton } from "./_components/obra-edit-button"
import { ObraDeleteButton } from "./_components/obra-delete-button"
import { ProgressInlineEdit } from "./_components/progress-inline-edit"
import type { AprovacaoItem } from "./_components/aprovacoes-tab"
import { STATUS_BADGE, STATUS_LABEL } from "@web/lib/status-badge"

function formatDeliveryDate(date: string | null): string {
  if (!date) return "A definir"
  return new Date(date).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  })
}

export default async function ObraDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ obra_id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await getServerUser()

  if (!(await canAccess(user.id, user.orgId, "obras"))) {
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
    .is("deleted_at", null)
    .maybeSingle()

  if (!obra) {
    notFound()
  }

  const propertyRes = obra.property_id
    ? await supabase
        .from("properties")
        .select("id, name")
        .eq("id", obra.property_id)
        .single()
    : null

  const property = propertyRes?.data ?? null

  const isAdminOrSupervisor = user.role === "admin" || user.role === "supervisor"

  const [fasesRes, fotosRes, documentosRes, clientesRes, aprovacoesRes] =
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
        .from("clientes_obras_vinculos")
        .select("id, numero_unidade, clientes(id, nome, cpf, email, sienge_customer_id)")
        .eq("obra_id", obra_id),
      // Busca aprovações: admin/supervisor vê todos os pendentes; obras vê os próprios
      isAdminOrSupervisor
        ? supabase
            .from("obra_upload_aprovacoes")
            .select(
              "id, tipo, storage_path, storage_bucket, metadata, status, enviado_por, motivo_rejeicao, created_at, users!enviado_por(name)"
            )
            .eq("obra_id", obra_id)
            .eq("org_id", user.orgId)
            .eq("status", "pendente")
            .order("created_at", { ascending: false })
        : supabase
            .from("obra_upload_aprovacoes")
            .select(
              "id, tipo, storage_path, storage_bucket, metadata, status, motivo_rejeicao, created_at"
            )
            .eq("obra_id", obra_id)
            .eq("org_id", user.orgId)
            .eq("enviado_por", user.id)
            .in("status", ["pendente", "rejeitado"])
            .order("created_at", { ascending: false }),
    ])

  const fases = fasesRes.data ?? []
  const fotos = fotosRes.data ?? []
  const documentos = documentosRes.data ?? []
  const mensagens: never[] = []
  const clientesRaw = clientesRes.data ?? []
  const aprovacoesRaw = aprovacoesRes.data ?? []

  const clientes = clientesRaw.map((row) => {
    const c = Array.isArray(row.clientes) ? row.clientes[0] : row.clientes
    return {
      id: row.id,              // vinculo_id — usado em desvincular/editar
      clienteId: (c as { id?: string } | null)?.id ?? "",
      name: (c as { nome?: string } | null)?.nome ?? "",
      cpf: (c as { cpf?: string | null } | null)?.cpf ?? null,
      email: (c as { email?: string } | null)?.email ?? "",
      is_primary: false,
      numero_unidade: row.numero_unidade ?? null,
      sienge_customer_id: (c as { sienge_customer_id?: number | null } | null)?.sienge_customer_id ?? null,
    }
  })


  // Gerar signed URLs para aprovações (admin/supervisor e obras)
  const initialAprovacoes: AprovacaoItem[] = await Promise.all(
    aprovacoesRaw.map(async (item) => {
      const { data: signed } = await supabase.storage
        .from((item as { storage_bucket?: string }).storage_bucket ?? "obra-fotos")
        .createSignedUrl(item.storage_path, 3600)

      const userRecord = (item as { users?: unknown }).users
      const enviado_por_nome = isAdminOrSupervisor
        ? (() => {
            if (Array.isArray(userRecord)) return (userRecord[0] as { name?: string })?.name ?? "—"
            return (userRecord as { name?: string } | null)?.name ?? "—"
          })()
        : ""

      return {
        id: item.id,
        tipo: item.tipo as "foto" | "documento",
        storage_path: item.storage_path,
        signed_url: signed?.signedUrl ?? null,
        metadata: (item.metadata as Record<string, unknown>) ?? {},
        enviado_por_nome,
        created_at: item.created_at,
        status: item.status,
        motivo_rejeicao: (item as { motivo_rejeicao?: string }).motivo_rejeicao ?? null,
      }
    })
  )

  const sp = await searchParams
  const tabParam = typeof sp.tab === "string" ? sp.tab : undefined

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  const statusBadge = STATUS_BADGE[obra.status] ?? "bg-gray-100 text-gray-700 dark:bg-stone-700/50 dark:text-stone-200"
  const statusLabel = STATUS_LABEL[obra.status] ?? obra.status

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/dashboard/obras"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-stone-400 dark:hover:text-stone-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para Obras
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">{obra.name}</h1>
            {obra.description && (
              <p className="mt-1 text-sm text-gray-500 dark:text-stone-400">{obra.description}</p>
            )}
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${statusBadge}`}
            >
              {statusLabel}
            </span>
            <ObraEditButton obra={obra} />
            {user.role === "admin" && (
              <ObraDeleteButton obraId={obra.id} obraName={obra.name} />
            )}
          </div>
        </div>
      </div>

      {/* Informações */}
      <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-stone-400">
          Informações
        </h2>

        <ProgressInlineEdit obraId={obra.id} value={obra.progress_pct} />

        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-gray-500 dark:text-stone-400">Status</dt>
            <dd className="font-medium text-gray-900 dark:text-stone-100">{statusLabel}</dd>
          </div>
          <div>
            <dt className="text-gray-500 dark:text-stone-400">Previsão de entrega</dt>
            <dd className="font-medium text-gray-900 dark:text-stone-100">
              {formatDeliveryDate(obra.expected_delivery_date)}
            </dd>
          </div>
        </dl>
      </section>

      {/* Empreendimento vinculado */}
      {property && (
        <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-stone-400">
            Empreendimento
          </h2>
          <Link
            href={`/dashboard/properties/${property.id}`}
            className="font-medium text-orange-600 hover:underline dark:text-orange-300 dark:hover:text-orange-200"
          >
            {property.name}
          </Link>
        </section>
      )}

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
        userRole={user.role}
        initialAprovacoes={initialAprovacoes}
        initialTab={tabParam}
      />
    </div>
  )
}
