import { redirect } from "next/navigation"
import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { can, canAccess } from "@web/lib/permissions"
import AgenteClient from "./agente-client"

// Story 75-219 — aba "Agente" do módulo Campanhas (fundação do agente de
// marketing IA). 75-301: o gate da página é a MESMA capability do
// marketingGuard das rotas (`marketing.gerenciar`) — matriz e exceções valem.
export default async function CampaignsAgentePage() {
  const user = await getServerUser()
  if (!(await can(user.id, user.orgId, "marketing.gerenciar"))) {
    redirect("/dashboard/campaigns")
  }

  // Empreendimentos ativos para o formulário "+ Novo post" (client do usuário —
  // RLS já permite leitura para staff).
  const supabase = await createClient()
  const { data: properties } = await supabase
    .from("properties")
    .select("id, name")
    .eq("org_id", user.orgId)
    .eq("is_active", true)
    .order("name")

  return (
    <AgenteClient
      properties={properties ?? []}
      showFormulariosTab={await canAccess(user.id, user.orgId, "campanhas")}
    />
  )
}
