import { getServerUser } from "@web/lib/auth"
import CampaignsMetaClient from "./campaigns-meta-client"

export default async function CampaignsMetaPage() {
  const user = await getServerUser()
  const isAdmin = user.role === "admin"
  return <CampaignsMetaClient isAdmin={isAdmin} />
}
