import { redirect } from "next/navigation"
import { getServerUser } from "@web/lib/auth"
import { AutomationForm } from "../_components/automation-form"

export default async function NovaAutomacaoPage() {
  const user = await getServerUser()
  if (user.role !== "admin") redirect("/dashboard")
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <AutomationForm />
    </div>
  )
}
