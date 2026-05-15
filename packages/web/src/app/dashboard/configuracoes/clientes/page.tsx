import Link from "next/link"
import { redirect } from "next/navigation"
import { getServerUser } from "@web/lib/auth"
import { createClient } from "@web/lib/supabase/server"
import { ClientesPageClient, type ClienteRow, type ObraOption } from "./_components/clientes-page-client"

export const dynamic = "force-dynamic"

export default async function ClientesCRMPage() {
  const user = await getServerUser()

  if (!["admin", "supervisor"].includes(user.role)) {
    redirect("/dashboard")
  }

  const supabase = await createClient()

  const PER_PAGE = 50

  const [clientesResult, obrasResult] = await Promise.all([
    supabase
      .from("clientes")
      .select(
        "id, nome, email, telefone, created_at, clientes_obras_vinculos(id, obra_id, numero_unidade, obras(id, name))",
        { count: "exact" }
      )
      .eq("org_id", user.orgId)
      .order("nome", { ascending: true })
      .range(0, PER_PAGE - 1),
    supabase
      .from("obras")
      .select("id, name")
      .eq("org_id", user.orgId)
      .order("name", { ascending: true }),
  ])

  const clientes = (clientesResult.data ?? []) as unknown as ClienteRow[]
  const total = clientesResult.count ?? 0
  const obras = (obrasResult.data ?? []) as ObraOption[]

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/configuracoes"
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-stone-400 dark:hover:text-stone-200"
        >
          &larr; Configurações
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-stone-100">Clientes</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-stone-400">
          Cadastro de clientes e vínculos com obras
        </p>
      </div>

      <ClientesPageClient
        initialClientes={clientes}
        initialTotal={total}
        obras={obras}
        perPage={PER_PAGE}
      />
    </div>
  )
}
