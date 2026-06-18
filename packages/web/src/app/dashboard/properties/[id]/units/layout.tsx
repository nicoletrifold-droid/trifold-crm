import { getServerUser } from "@web/lib/auth"
import { canEditImoveis } from "@web/lib/permissions-imoveis"
import { redirect } from "next/navigation"

// Guard server-side: só admin/supervisor/obras gerenciam unidades.
// Cobre a lista (/units) e o detalhe da unidade (/units/[unitId]).
// Status da unidade segue read-only (integração externa).
export default async function UnitsGuardLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getServerUser()
  if (!canEditImoveis(user.role)) {
    redirect(`/dashboard/properties/${id}`)
  }
  return <>{children}</>
}
