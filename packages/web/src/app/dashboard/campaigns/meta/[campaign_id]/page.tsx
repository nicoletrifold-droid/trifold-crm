import { getServerUser } from "@web/lib/auth"
import CampaignDetailClient from "./campaign-detail-client"

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ campaign_id: string }>
}) {
  const user = await getServerUser()
  const isAdmin = user.role === "admin"
  const { campaign_id } = await params
  return <CampaignDetailClient campaignId={campaign_id} isAdmin={isAdmin} />
}
