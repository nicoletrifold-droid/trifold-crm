import { getServerUser } from "@web/lib/auth"
import { canCreateImoveis } from "@web/lib/permissions-imoveis"
import { redirect } from "next/navigation"

// Guard server-side: só admin/supervisor podem criar empreendimento.
// Redireciona antes de carregar o formulário (a API também bloqueia).
export default async function NewPropertyGuardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getServerUser()
  if (!(await canCreateImoveis(user.id, user.orgId))) {
    redirect("/dashboard/properties")
  }
  return <>{children}</>
}
