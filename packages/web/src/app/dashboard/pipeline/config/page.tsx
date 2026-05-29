import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"
import { redirect } from "next/navigation"

export default async function FollowUpConfigPage() {
  const user = await getServerUser()

  if (!(await canAccess(user.id, user.orgId, "pipeline"))) {
    redirect("/dashboard")
  }

  const supabase = await createClient()

  const { data: stages } = await supabase
    .from("kanban_stages")
    .select("id, name, slug, color, position")
    .eq("is_active", true)
    .order("position")

  const { data: rules } = await supabase
    .from("follow_up_rules")
    .select("*")
    .eq("org_id", user.orgId)

  const rulesMap = new Map(
    (rules ?? []).map((r: Record<string, unknown>) => [r.stage_id as string, r])
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">
          Configuração de Follow-up
        </h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Follow-up é ativo apenas após agendamento. Antes disso, a Nicole atende 100%.
          Se o corretor enviar mensagem, ele assume por 24h — depois a Nicole retoma.
        </p>
      </div>

      <div className="space-y-4">
        {stages?.map((stage) => {
          const rule = rulesMap.get(stage.id) as Record<string, unknown> | undefined
          return (
            <FollowUpStageCard
              key={stage.id}
              stage={stage}
              rule={rule}
            />
          )
        })}

        {(!stages || stages.length === 0) && (
          <div className="rounded-lg bg-white p-8 text-center text-sm text-gray-500 shadow-sm dark:bg-stone-900 dark:text-stone-400">
            Nenhuma etapa configurada.
          </div>
        )}
      </div>
    </div>
  )
}

function FollowUpStageCard({
  stage,
  rule,
}: {
  stage: { id: string; name: string; slug: string; color: string | null; position: number }
  rule: Record<string, unknown> | undefined
}) {
  const alertDays = (rule?.alert_days as number) ?? 1
  const nicoleDays = (rule?.nicole_takeover_days as number) ?? 2
  const template = (rule?.message_template as string) ?? ""
  const isActive = (rule?.is_active as boolean) ?? true

  async function saveRule(formData: FormData) {
    "use server"
    const { createClient: createSC } = await import("@web/lib/supabase/server")
    const supabase = await createSC()

    const newAlertDays = Number(formData.get("alert_days"))
    const newNicoleDays = Number(formData.get("nicole_takeover_days"))
    const newTemplate = (formData.get("message_template") as string)?.trim() || null
    const newIsActive = formData.get("is_active") === "on"

    if (isNaN(newAlertDays) || isNaN(newNicoleDays)) return
    if (newAlertDays >= newNicoleDays) return

    const { getServerUser: getUser } = await import("@web/lib/auth")
    const u = await getUser()

    await supabase.from("follow_up_rules").upsert(
      {
        org_id: u.orgId,
        stage_id: stage.id,
        alert_days: newAlertDays,
        nicole_takeover_days: newNicoleDays,
        message_template: newTemplate,
        is_active: newIsActive,
      },
      { onConflict: "org_id,stage_id" }
    )

    const { redirect: nav } = await import("next/navigation")
    nav("/dashboard/pipeline/config")
  }

  const inputClass = "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
  const labelClass = "block text-xs font-medium text-gray-500 dark:text-stone-400"

  return (
    <form action={saveRule} className="rounded-lg bg-white p-6 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
      <div className="mb-4 flex items-center gap-3">
        <span
          className="inline-block h-4 w-4 rounded-full border border-gray-200 dark:border-stone-700"
          style={{ backgroundColor: stage.color || "#9ca3af" }}
        />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-stone-100">{stage.name}</h3>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-stone-800 dark:text-stone-400">
          Posição {stage.position}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div>
          <label className={labelClass}>Alerta ao corretor (dias)</label>
          <input
            type="number"
            name="alert_days"
            defaultValue={alertDays}
            min={0}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Nicole assume (dias)</label>
          <input
            type="number"
            name="nicole_takeover_days"
            defaultValue={nicoleDays}
            min={1}
            className={inputClass}
          />
        </div>

        <div className="md:col-span-2">
          <label className={labelClass}>Ativo</label>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={isActive}
              className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500 dark:border-stone-600"
            />
            <span className="text-sm text-gray-600 dark:text-stone-300">
              Follow-up automático habilitado
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <label className={labelClass}>Template da mensagem</label>
        <textarea
          name="message_template"
          defaultValue={template}
          rows={3}
          placeholder="Oi {nome}, tudo bem? Vi que conversamos sobre o {empreendimento}..."
          className={`${inputClass} mt-1`}
        />
        <p className="mt-1 text-xs text-gray-400 dark:text-stone-500">
          Variáveis disponíveis: {"{nome}"}, {"{empreendimento}"}
        </p>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
        >
          Salvar
        </button>
      </div>
    </form>
  )
}
