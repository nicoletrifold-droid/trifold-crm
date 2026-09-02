import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { can } from "@web/lib/permissions"
import { CreateStageModal } from "./_components/create-stage-modal"
import { StagesTable } from "./_components/stages-table"

export default async function PipelineConfigPage() {
  const user = await getServerUser()
  const supabase = await createClient()

  // 75-371 — o gate da TELA é a MESMA chave que a API e a RLS exigem para
  // escrever (`configuracoes.pipeline_editar`). Antes a tela perguntava só pelo
  // acesso ao sub-módulo "configuracoes.pipeline", que herda de "configuracoes":
  // quem só enxerga Configurações via o botão e levava 403 no "Criar etapa".
  const canEdit = await can(user.id, user.orgId, "configuracoes.pipeline_editar")

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
          {canEdit && <CreateStageModal />}
        </div>
      </div>

      <StagesTable initialStages={stages ?? []} canEdit={canEdit} />
    </div>
  )
}
