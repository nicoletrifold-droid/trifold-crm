import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"
import { CorretorDetail } from "./_detail"

export default async function EditCorretorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getServerUser()

  // Mesma regra da coluna de ações da lista: admin (módulo "sistema") ou
  // gerente-comercial (módulo "corretores") podem editar. Demais só consultam.
  const canEdit =
    (await canAccess(user.id, user.orgId, "sistema")) ||
    (await canAccess(user.id, user.orgId, "corretores"))

  return <CorretorDetail brokerId={id} canEdit={canEdit} />
}
