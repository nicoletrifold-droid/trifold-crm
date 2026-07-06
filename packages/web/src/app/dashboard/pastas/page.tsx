import { redirect } from "next/navigation"
import { getServerUser } from "@web/lib/auth"
import { createClient } from "@web/lib/supabase/server"
import { PastasManager } from "./_components/pastas-manager"
import { isPastaManager } from "@web/lib/pastas/roles"
import { computePastaStatus } from "@web/lib/pastas/status"

export default async function PastasPage() {
  const user = await getServerUser()
  if (!isPastaManager(user.role)) {
    redirect("/dashboard")
  }

  const supabase = await createClient()

  const { data: pastas } = await supabase
    .from("pastas")
    .select("id, nome, tipo, casado, empreendimento, corretor_nome, imobiliaria, token, created_at, pasta_documentos(slug, situacao, signature_envelopes(status))")
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false })

  const rows = (pastas ?? []).map((p) => {
    const rawDocs = (p.pasta_documentos ?? []) as {
      slug: string
      situacao: string
      signature_envelopes?: { status: string }[]
    }[]
    const docs = rawDocs.map((d) => ({
      slug: d.slug,
      situacao: d.situacao,
      signed: (d.signature_envelopes ?? []).some((e) => e.status === "signed" || e.status === "closed"),
    }))
    const { status, total, entregues, deferidos } = computePastaStatus(docs)
    return {
      id: p.id,
      nome: p.nome,
      tipo: p.tipo as string,
      empreendimento: (p.empreendimento as string | null) ?? null,
      corretorNome: (p.corretor_nome as string | null) ?? null,
      imobiliaria: (p.imobiliaria as string | null) ?? null,
      createdAt: p.created_at as string,
      token: p.token as string,
      status,
      total,
      entregues,
      deferidos,
    }
  })

  return <PastasManager pastas={rows} />
}
