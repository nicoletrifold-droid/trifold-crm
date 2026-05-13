import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"

export default async function PipelineConfigPage() {
  const user = await getServerUser()
  const supabase = await createClient()

  const isAdmin = user.role === "admin"

  const { data: stages } = await supabase
    .from("kanban_stages")
    .select("id, name, slug, type, position, color, is_default, is_active, created_at")
    .eq("org_id", user.orgId)
    .eq("is_active", true)
    .order("position")

  const typeLabels: Record<string, string> = {
    novo: "Novo",
    qualificado: "Qualificado",
    agendado: "Agendado",
    visitou: "Visitou",
    proposta: "Proposta",
    fechado: "Fechado",
    perdido: "Perdido",
  }

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
        <p className="text-sm text-gray-500 dark:text-stone-400">
          {stages?.length ?? 0} etapas
        </p>
      </div>

      <div className="rounded-lg bg-white shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-stone-800">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:bg-stone-800/50 dark:text-stone-400">
              <th className="px-6 py-3">Posição</th>
              <th className="px-6 py-3">Nome</th>
              <th className="px-6 py-3">Tipo</th>
              <th className="px-6 py-3">Cor</th>
              <th className="px-6 py-3">Padrão</th>
              {isAdmin && <th className="px-6 py-3"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-stone-800">
            {stages?.map((stage) => (
              <tr key={stage.id} className="hover:bg-gray-50 dark:hover:bg-stone-800/30">
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
                  {stage.position}
                </td>
                <td className="px-6 py-4 font-medium text-gray-900 dark:text-stone-100">
                  {stage.name}
                </td>
                <td className="px-6 py-4">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-stone-700/50 dark:text-stone-200">
                    {typeLabels[stage.type] ?? stage.type}
                  </span>
                </td>
                <td className="px-6 py-4">
                  {stage.color ? (
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-4 w-4 rounded-full border border-gray-200 dark:border-stone-700"
                        style={{ backgroundColor: stage.color }}
                      />
                      <span className="text-xs text-gray-500 dark:text-stone-400">
                        {stage.color}
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400 dark:text-stone-500">-</span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
                  {stage.is_default ? "Sim" : "-"}
                </td>
                {isAdmin && (
                  <td className="px-6 py-4 text-right">
                    <UpdatePositionForm
                      stageId={stage.id}
                      currentPosition={stage.position}
                    />
                  </td>
                )}
              </tr>
            ))}
            {(!stages || stages.length === 0) && (
              <tr>
                <td
                  colSpan={isAdmin ? 6 : 5}
                  className="px-6 py-8 text-center text-sm text-gray-500 dark:text-stone-400"
                >
                  Nenhuma etapa configurada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function UpdatePositionForm({
  stageId,
  currentPosition,
}: {
  stageId: string
  currentPosition: number
}) {
  return (
    <form
      action={async (formData: FormData) => {
        "use server"
        const newPosition = Number(formData.get("position"))
        if (isNaN(newPosition)) return
        const supabase = await (
          await import("@web/lib/supabase/server")
        ).createClient()
        await supabase
          .from("kanban_stages")
          .update({ position: newPosition })
          .eq("id", stageId)
      }}
      className="flex items-center gap-2"
    >
      <input
        type="number"
        name="position"
        defaultValue={currentPosition}
        className="w-16 rounded border border-gray-300 px-2 py-1 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
        min={0}
      />
      <button
        type="submit"
        className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
      >
        Salvar
      </button>
    </form>
  )
}
