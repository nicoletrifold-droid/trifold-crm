import { redirect } from "next/navigation"
import { getServerUser } from "@web/lib/auth"
import { createClient } from "@web/lib/supabase/server"
import { PastasManager } from "./_components/pastas-manager"

const MANAGER_ROLES = ["admin", "supervisor"]

export default async function PastasPage() {
  const user = await getServerUser()
  if (!MANAGER_ROLES.includes(user.role)) {
    redirect("/dashboard")
  }

  const supabase = await createClient()

  const { data: pastas } = await supabase
    .from("pastas")
    .select("id, nome, tipo, casado, empreendimento, token, status, created_at, pasta_documentos(situacao)")
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false })

  const rows = (pastas ?? []).map((p) => {
    const docs = (p.pasta_documentos ?? []) as { situacao: string }[]
    const entregues = docs.filter((d) => d.situacao === "entregue" || d.situacao === "deferido").length
    return {
      id: p.id,
      nome: p.nome,
      tipo: p.tipo as string,
      empreendimento: (p.empreendimento as string | null) ?? null,
      token: p.token as string,
      total: docs.length,
      entregues,
    }
  })

  return <PastasManager pastas={rows} />
}
