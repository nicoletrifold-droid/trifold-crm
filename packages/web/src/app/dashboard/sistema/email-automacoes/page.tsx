import { redirect } from "next/navigation"
import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"
import { AutomationList } from "./_components/automation-list"

export default async function EmailAutomacoesPage() {
  const user = await getServerUser()
  if (!(await canAccess(user.id, user.orgId, "sistema"))) redirect("/dashboard")
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <AutomationList />
    </div>
  )
}
