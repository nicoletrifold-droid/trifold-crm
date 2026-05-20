import { redirect } from "next/navigation"
import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"
import { AutomationForm } from "../_components/automation-form"

export default async function NovaAutomacaoPage() {
  const user = await getServerUser()
  if (!(await canAccess(user.id, user.orgId, "sistema"))) redirect("/dashboard")
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <AutomationForm />
    </div>
  )
}
