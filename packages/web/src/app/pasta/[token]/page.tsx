import { createAdminClient } from "@web/lib/supabase/admin"
import { buildInfoFields } from "@web/lib/pastas/checklist"
import { PastaPublicClient } from "./_components/pasta-public"

export const dynamic = "force-dynamic"

export default async function PastaPublicPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const admin = createAdminClient()

  const { data: pasta } = await admin
    .from("pastas")
    .select("id, nome, tipo, casado, empreendimento, form_data")
    .eq("token", token)
    .maybeSingle()

  if (!pasta) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-stone-800">Link inválido</h1>
          <p className="mt-2 text-stone-500">
            Este link de documentos não existe ou expirou. Fale com seu corretor.
          </p>
        </div>
      </div>
    )
  }

  const { data: docs } = await admin
    .from("pasta_documentos")
    .select("id, slug, label, titular, situacao, filename")
    .eq("pasta_id", pasta.id)
    .order("ordem", { ascending: true })

  const infoFields = buildInfoFields(pasta.tipo as "pf" | "pj", pasta.casado)

  return (
    <PastaPublicClient
      token={token}
      pasta={{
        nome: pasta.nome,
        empreendimento: pasta.empreendimento,
        formData: (pasta.form_data as Record<string, string>) ?? {},
      }}
      docs={docs ?? []}
      infoFields={infoFields}
    />
  )
}
