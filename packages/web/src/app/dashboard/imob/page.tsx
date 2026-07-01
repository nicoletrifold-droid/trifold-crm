import { redirect } from "next/navigation"
import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"

// Story 75-95/75-99 — o módulo IMOB abre direto nos Leads do mundo IMOB (tela operacional).
// Kanban antigo (imob-board) segue dormente — ver memória project-imob-kanban.
export const dynamic = "force-dynamic"

export default async function ImobPage() {
  const user = await getServerUser()
  if (!(await canAccess(user.id, user.orgId, "imob"))) {
    redirect("/dashboard")
  }
  redirect("/dashboard/imob/leads")
}
