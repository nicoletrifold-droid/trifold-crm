import { createAdminClient } from "@web/lib/supabase/admin"
import { PastaNovaPublicClient } from "./_components/pasta-nova-public"

export const dynamic = "force-dynamic"

// Story 75-146 — página PÚBLICA de auto-cadastro (link por imobiliária). Resolve o link
// pelo token via service role; se inexistente ou revogado, mostra "Link inválido ou
// desativado". Caso ativo, renderiza o wizard em modo público (imobiliária travada).
export default async function PastaNovaPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const admin = createAdminClient()

  const { data: link } = await admin
    .from("pasta_links")
    .select("id, imobiliaria, ativo, corretor_nome, corretor_telefone, corretor_email")
    .eq("token", token)
    .maybeSingle()

  if (!link || link.ativo !== true) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 p-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-stone-800">Link inválido ou desativado</h1>
          <p className="mt-2 text-stone-500">
            Este link de cadastro não existe ou foi desativado. Fale com a Trifold.
          </p>
        </div>
      </div>
    )
  }

  return (
    <PastaNovaPublicClient
      token={token}
      imobiliaria={link.imobiliaria}
      corretorDefaults={{
        nome: link.corretor_nome ?? undefined,
        telefone: link.corretor_telefone ?? undefined,
        email: link.corretor_email ?? undefined,
      }}
    />
  )
}
