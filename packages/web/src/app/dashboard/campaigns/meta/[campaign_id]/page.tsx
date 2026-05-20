import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"
import CampaignDetailClient from "./campaign-detail-client"

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ campaign_id: string }>
}) {
  const user = await getServerUser()
  // Ações administrativas no detalhe da campanha — modeladas como acesso
  // ao módulo "sistema" (somente admin tem por padrão).
  const isAdmin = await canAccess(user.id, user.orgId, "sistema")
  const { campaign_id } = await params
  return <CampaignDetailClient campaignId={campaign_id} isAdmin={isAdmin} />
}
