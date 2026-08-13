import { redirect, notFound } from "next/navigation"
import { getServerUser } from "@web/lib/auth"
import { createClient } from "@web/lib/supabase/server"
import { PastaDetail } from "./_components/pasta-detail"
import { canManagePastas } from "@web/lib/pastas/roles"

export default async function PastaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getServerUser()
  if (!(await canManagePastas(user.id, user.orgId))) {
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

  // Story 75-120 — assinaturas (Clicksign) por documento da pasta.
  const { data: envelopes } = await supabase
    .from("signature_envelopes")
    .select("id, pasta_documento_id, status, signed_storage_path, created_at")
    .eq("pasta_id", id)
    .order("created_at", { ascending: false })

  // Última assinatura por documento (a lista já vem desc por created_at).
  const signatures: Record<string, { id: string; status: string; hasSigned: boolean }> = {}
  for (const e of envelopes ?? []) {
    const docId = e.pasta_documento_id as string | null
    if (docId && !signatures[docId]) {
      signatures[docId] = {
        id: e.id as string,
        status: e.status as string,
        hasSigned: Boolean(e.signed_storage_path),
      }
    }
  }

  // Feature de assinatura só liga quando o Clicksign está configurado (env var).
  // Assim o código pode ir pro ar antes das credenciais, sem botão quebrado.
  const clicksignConfigured = Boolean(process.env.CLICKSIGN_API_TOKEN)
  // Enquanto apontar para o sandbox, sinalizar na UI que as assinaturas são de teste.
  const clicksignSandbox = (process.env.CLICKSIGN_API_BASE_URL ?? "sandbox").includes("sandbox")

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
      signatures={signatures}
      clicksignEnabled={clicksignConfigured}
      clicksignSandbox={clicksignSandbox}
    />
  )
}
