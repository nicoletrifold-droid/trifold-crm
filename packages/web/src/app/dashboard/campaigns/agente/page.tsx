import { redirect } from "next/navigation"
import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import AgenteClient from "./agente-client"

// Story 75-219 — aba "Agente" do módulo Campanhas (fundação do agente de
// marketing IA). Gate server-side: SOMENTE admin/supervisor (AC2) — as rotas
// API repetem o gate via marketingGuard, este redirect é a camada da página.
export default async function CampaignsAgentePage() {
  const user = await getServerUser()
  if (user.role !== "admin" && user.role !== "supervisor") {
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
