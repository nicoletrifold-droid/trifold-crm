import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"
import CampaignsMetaClient from "./campaigns-meta-client"

export default async function CampaignsMetaPage() {
  const user = await getServerUser()
  // Ações administrativas sobre campanhas Meta — modeladas como acesso
  // ao módulo "sistema" (somente admin tem por padrão).
  const isAdmin = await canAccess(user.id, user.orgId, "sistema")
  // Story 75-219 — aba "Agente". Story 75-229 — gate migrado para a matriz de
  // permissões (sub-módulo "campanhas.agente").
  const showAgenteTab = await canAccess(user.id, user.orgId, "campanhas.agente")
  return <CampaignsMetaClient isAdmin={isAdmin} showAgenteTab={showAgenteTab} />
}
