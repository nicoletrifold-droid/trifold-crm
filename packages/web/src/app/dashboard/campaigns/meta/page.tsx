import { getServerUser } from "@web/lib/auth"
import { can, canAccess } from "@web/lib/permissions"
import CampaignsMetaClient from "./campaigns-meta-client"

export default async function CampaignsMetaPage() {
  const user = await getServerUser()
  // 75-303: ações administrativas (Sync + painel) seguem a capability
  // `campanhas.meta_sincronizar` (antes: proxy canAccess("sistema") = admin).
  const isAdmin = await can(user.id, user.orgId, "campanhas.meta_sincronizar")
  // 75-301: a aba "Agente" segue a MESMA capability do marketingGuard das rotas.
  const showAgenteTab = await can(user.id, user.orgId, "marketing.gerenciar")
  const showFormulariosTab = await canAccess(user.id, user.orgId, "campanhas")
  return (
    <CampaignsMetaClient
      isAdmin={isAdmin}
      showAgenteTab={showAgenteTab}
      showFormulariosTab={showFormulariosTab}
    />
  )
}
