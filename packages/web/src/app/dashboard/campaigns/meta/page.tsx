import { getServerUser } from "@web/lib/auth"
import { can, canAccess } from "@web/lib/permissions"
import CampaignsMetaClient from "./campaigns-meta-client"

export default async function CampaignsMetaPage() {
  const user = await getServerUser()
  // Ações administrativas sobre campanhas Meta — modeladas como acesso
  // ao módulo "sistema" (somente admin tem por padrão).
  const isAdmin = await canAccess(user.id, user.orgId, "sistema")
  // 75-301: a aba "Agente" segue a MESMA capability do marketingGuard das rotas.
  const showAgenteTab = await can(user.id, user.orgId, "marketing.gerenciar")
  return <CampaignsMetaClient isAdmin={isAdmin} showAgenteTab={showAgenteTab} />
}
