import { redirect, notFound } from "next/navigation"
import { getServerUser } from "@web/lib/auth"
import { createClient } from "@web/lib/supabase/server"
import { PastaDetail } from "./_components/pasta-detail"

const MANAGER_ROLES = ["admin", "supervisor"]

export default async function PastaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getServerUser()
  if (!MANAGER_ROLES.includes(user.role)) {
    redirect("/dashboard")
  }

  const { id } = await params
  const supabase = await createClient()

  const { data: pasta } = await supabase
    .from("pastas")
    .select("id, nome, tipo, casado, empreendimento, token, form_data")
    .eq("id", id)
    .eq("org_id", user.orgId)
    .maybeSingle()

  if (!pasta) notFound()

  const { data: docs } = await supabase
    .from("pasta_documentos")
    .select("id, slug, label, titular, situacao, filename, uploaded_at")
    .eq("pasta_id", id)
    .order("ordem", { ascending: true })

  return (
    <PastaDetail
      pasta={{
        id: pasta.id,
        nome: pasta.nome,
        tipo: pasta.tipo as string,
        empreendimento: (pasta.empreendimento as string | null) ?? null,
        token: pasta.token as string,
        formData: (pasta.form_data as Record<string, string>) ?? {},
      }}
      docs={docs ?? []}
    />
  )
}
