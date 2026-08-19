import { notFound, redirect } from "next/navigation"
import { getServerUser } from "@web/lib/auth"
import { can } from "@web/lib/permissions"
import { resolverAcessoCampanhas, destinoSemModuloCampanhas } from "@web/lib/campaigns/access"
import CampaignsMetaClient from "./campaigns-meta-client"

export default async function CampaignsMetaPage() {
  const user = await getServerUser()

  // Story 75-344 — mesmo gate de servidor da aba CRM (esta rota também não tinha).
  const acesso = await resolverAcessoCampanhas(user.id, user.orgId)
  if (!acesso.modulo) {
    const destino = destinoSemModuloCampanhas(acesso)
    if (destino) redirect(destino)
    notFound()
  }

  // 75-303: ações administrativas (Sync + painel) seguem a capability
  // `campanhas.meta_sincronizar` (antes: proxy canAccess("sistema") = admin).
  const isAdmin = await can(user.id, user.orgId, "campanhas.meta_sincronizar")
  return (
    <CampaignsMetaClient
      isAdmin={isAdmin}
      showAgenteTab={acesso.agente}
      showFormulariosTab={acesso.formularios}
      showModuloCampanhas={acesso.modulo}
    />
  )
}
