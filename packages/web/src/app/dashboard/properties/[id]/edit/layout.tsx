import { getServerUser } from "@web/lib/auth"
import { canEditImoveis } from "@web/lib/permissions-imoveis"
import { redirect } from "next/navigation"

// Guard server-side: só admin/supervisor/obras editam empreendimento.
// Redireciona ao detalhe antes de carregar o formulário (a API também bloqueia).
export default async function EditPropertyGuardLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getServerUser()
  if (!(await canEditImoveis(user.id, user.orgId))) {
    redirect(`/dashboard/properties/${id}`)
  }
  return <>{children}</>
}
