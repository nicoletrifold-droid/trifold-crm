import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"
import { CreateStageModal } from "./_components/create-stage-modal"
import { StagesTable } from "./_components/stages-table"

export default async function PipelineConfigPage() {
  const user = await getServerUser()
  const supabase = await createClient()

  // Edição da configuração de pipeline — modelado como acesso ao módulo
  // "sistema" (somente admin tem por padrão).
  const isAdmin = await canAccess(user.id, user.orgId, "sistema")

  const { data: stages } = await supabase
    .from("kanban_stages")
    .select("id, name, slug, type, position, color, is_default, is_active, created_at")
    .eq("org_id", user.orgId)
    .eq("is_active", true)
    .order("position")

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">
            Configuracao do Pipeline
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-stone-400">
            Gerencie as etapas do kanban
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-500 dark:text-stone-400">
            {stages?.length ?? 0} etapas
          </p>
          {isAdmin && <CreateStageModal />}
        </div>
      </div>

      <StagesTable initialStages={stages ?? []} isAdmin={isAdmin} />
    </div>
  )
}
