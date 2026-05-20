import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"
import CampaignsMetaClient from "./campaigns-meta-client"

export default async function CampaignsMetaPage() {
  const user = await getServerUser()
  // Ações administrativas sobre campanhas Meta — modeladas como acesso
  // ao módulo "sistema" (somente admin tem por padrão).
  const isAdmin = await canAccess(user.id, user.orgId, "sistema")
  return <CampaignsMetaClient isAdmin={isAdmin} />
}
