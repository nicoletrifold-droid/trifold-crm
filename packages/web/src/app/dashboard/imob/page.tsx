import { redirect } from "next/navigation"
import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"

// Story 75-95 — o Kanban saiu do IMOB (vai p/ outro local). O módulo IMOB abre direto
// no cadastro de imobiliárias. O board (imob-board / APIs /api/imob/cards|columns /
// tabelas imob_*) fica DORMENTE p/ reuso — ver memória project-imob-kanban.
export const dynamic = "force-dynamic"

export default async function ImobPage() {
  const user = await getServerUser()
  if (!(await canAccess(user.id, user.orgId, "imob"))) {
    redirect("/dashboard")
  }
  redirect("/dashboard/imob/imobiliarias")
}
