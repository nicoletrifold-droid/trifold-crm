import { getServerUser } from "@web/lib/auth"
import { can } from "@web/lib/permissions"
import CampaignDetailClient from "./campaign-detail-client"

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ campaign_id: string }>
}) {
  const user = await getServerUser()
  // Ações administrativas no detalhe da campanha — modeladas como acesso
  // ao módulo "sistema" (somente admin tem por padrão).
  // 75-303: ações da campanha + log seguem `campanhas.meta_acionar`
  // (antes: proxy canAccess("sistema") = admin).
  const isAdmin = await can(user.id, user.orgId, "campanhas.meta_acionar")
  const { campaign_id } = await params
  return <CampaignDetailClient campaignId={campaign_id} isAdmin={isAdmin} />
}
