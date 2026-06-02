import { redirect } from "next/navigation"
import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"
import { createClient } from "@web/lib/supabase/server"
import { MessageSquarePlus } from "lucide-react"
import { ChamadoForm } from "@web/app/dashboard/chamados/_components/chamado-form"
import { ChamadosClientWrapper } from "@web/app/dashboard/chamados/_components/chamados-client-wrapper"

interface Chamado {
  id: string
  description: string
  reason: string
  image_url: string | null
  status: string
  reporter_name: string
  created_at: string
}

export default async function BrokerSuportePage() {
  const user = await getServerUser()

  if (!(await canAccess(user.id, user.orgId, "chamados"))) {
    redirect("/broker")
  }

  const supabase = await createClient()
  const isAdmin = user.role === "admin" || user.role === "supervisor"

  let query = supabase
    .from("chamados")
    .select("id, description, reason, image_url, status, reporter_name, created_at")
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false })

  if (!isAdmin) {
    const { data: userRecord } = await supabase
      .from("users")
      .select("id")
      .eq("auth_id", (await supabase.auth.getUser()).data.user?.id ?? "")
      .single()

    if (userRecord) {
      query = query.eq("reporter_id", userRecord.id)
    }
  }

  const { data: chamados } = await query
  const allChamados: Chamado[] = chamados ?? []

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-100 dark:bg-stone-800">
            <MessageSquarePlus className="h-5 w-5 text-stone-600 dark:text-stone-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-stone-900 dark:text-white">
              Suporte e Melhorias
            </h1>
            <p className="text-sm text-stone-500 dark:text-stone-400">
              Reporte bugs, erros ou solicite melhorias no sistema
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-start">
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900">
          <h2 className="mb-5 text-base font-semibold text-stone-900 dark:text-white">
            Abrir novo ticket
          </h2>
          <ChamadoForm userName={user.name} />
        </div>

        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-stone-900 dark:text-white">
              Meus tickets
            </h2>
            {allChamados.length > 0 && (
              <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-semibold text-stone-600 dark:bg-stone-800 dark:text-stone-400">
                {allChamados.length}
              </span>
            )}
          </div>

          <ChamadosClientWrapper
            initialChamados={allChamados}
            isAdmin={false}
          />
        </div>
      </div>
    </div>
  )
}
