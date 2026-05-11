// TODO: página temporária — remover após concluir o backfill de vínculos existentes

import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, GitMerge } from "lucide-react"
import { BackfillForm } from "./_components/backfill-form"

export default async function ObraBackfillPage() {
  const user = await getServerUser()

  if (user.role !== "admin") {
    redirect("/dashboard/obras")
  }

  const supabase = await createClient()

  const [linkedRes, propertiesRes, obrasRes] = await Promise.all([
    supabase
      .from("obras")
      .select("property_id")
      .not("property_id", "is", null)
      .eq("org_id", user.orgId),
    supabase
      .from("properties")
      .select("id, name, city, state")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("obras")
      .select("id, name, status, progress_pct")
      .is("property_id", null)
      .eq("org_id", user.orgId)
      .order("name"),
  ])

  const linkedIds = new Set(
    (linkedRes.data ?? []).map((o) => o.property_id as string).filter(Boolean)
  )

  const propertiesSemObra = (propertiesRes.data ?? []).filter(
    (p) => !linkedIds.has(p.id)
  )

  const obrasDisponiveis = obrasRes.data ?? []

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/obras"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para Obras
        </Link>
        <div className="flex items-center gap-3">
          <GitMerge className="h-6 w-6 text-orange-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Backfill: Vincular Empreendimentos
            </h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Empreendimentos sem obra vinculada:{" "}
              <span className="font-medium text-gray-800">
                {propertiesSemObra.length}
              </span>{" "}
              · Obras disponíveis:{" "}
              <span className="font-medium text-gray-800">
                {obrasDisponiveis.length}
              </span>
            </p>
          </div>
        </div>
      </div>

      {obrasDisponiveis.length === 0 && propertiesSemObra.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Não há obras disponíveis (todas já vinculadas a empreendimentos).
          Crie uma nova obra em{" "}
          <Link
            href="/dashboard/obras"
            className="font-medium underline"
          >
            Obras
          </Link>{" "}
          para poder vincular.
        </div>
      )}

      <BackfillForm
        properties={propertiesSemObra}
        obras={obrasDisponiveis}
      />
    </div>
  )
}
