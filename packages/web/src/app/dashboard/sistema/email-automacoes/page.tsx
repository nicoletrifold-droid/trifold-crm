import { redirect } from "next/navigation"
import { getServerUser } from "@web/lib/auth"
import { AutomationList } from "./_components/automation-list"

export default async function EmailAutomacoesPage() {
  const user = await getServerUser()
  if (user.role !== "admin") redirect("/dashboard")
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <AutomationList />
    </div>
  )
}
