import { redirect } from "next/navigation"
import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"
import AgenteClient from "./agente-client"

// Story 75-219 — aba "Agente" do módulo Campanhas (fundação do agente de
// marketing IA). Story 75-229 — gate migrado do role hardcoded para o
// sub-módulo "campanhas.agente" na matriz de permissões; as rotas API repetem
// o gate via marketingGuard, este redirect é a camada da página.
export default async function CampaignsAgentePage() {
  const user = await getServerUser()
  if (!(await canAccess(user.id, user.orgId, "campanhas.agente"))) {
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

  return <AgenteClient properties={properties ?? []} />
}
