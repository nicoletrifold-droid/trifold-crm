import { redirect, notFound } from "next/navigation"
import { getServerUser } from "@web/lib/auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { AutomationForm } from "../_components/automation-form"

export default async function EditarAutomacaoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getServerUser()
  if (user.role !== "admin") redirect("/dashboard")

  const { id } = await params
  const supabase = createAdminClient()
  const { data: automation } = await supabase
    .from("email_automations")
    .select("id, name, trigger_event, trigger_filter, template_id, delay_minutes, is_active")
    .eq("id", id)
    .eq("org_id", user.orgId)
    .single()

  if (!automation) notFound()

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <AutomationForm
        initialData={{
          ...automation,
          trigger_filter: automation.trigger_filter as Record<string, string> | null,
        }}
      />
    </div>
  )
}
