import { redirect } from "next/navigation"
import { getServerUser } from "@web/lib/auth"
import { createClient } from "@web/lib/supabase/server"
import { PastasManager } from "./_components/pastas-manager"
import { canManagePastas } from "@web/lib/pastas/roles"
import { computePastaStatus } from "@web/lib/pastas/status"

export default async function PastasPage() {
  const user = await getServerUser()
  if (!(await canManagePastas(user.id, user.orgId))) {
    redirect("/dashboard")
  }

  const supabase = await createClient()

  const [{ data: pastas }, { data: linkRows }] = await Promise.all([
    supabase
      .from("pastas")
      .select("id, nome, tipo, casado, empreendimento, corretor_nome, imobiliaria, token, origem, created_at, pasta_documentos(slug, situacao, signature_envelopes(status))")
      .eq("org_id", user.orgId)
      .order("created_at", { ascending: false }),
    // Story 75-146 — links de auto-cadastro por imobiliária (gestão no dashboard).
    supabase
      .from("pasta_links")
      .select("id, imobiliaria, token, ativo, corretor_nome, created_at")
      .eq("org_id", user.orgId)
      .order("created_at", { ascending: false }),
  ])

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
      origem: (p.origem as string | null) ?? "interno",
      status,
      total,
      entregues,
      deferidos,
    }
  })

  const links = ((linkRows ?? []) as {
    id: string
    imobiliaria: string
    token: string
    ativo: boolean
    corretor_nome: string | null
    created_at: string
  }[]).map((l) => ({
    id: l.id,
    imobiliaria: l.imobiliaria,
    token: l.token,
    ativo: l.ativo,
    corretorNome: l.corretor_nome ?? null,
    createdAt: l.created_at,
  }))

  return <PastasManager pastas={rows} links={links} />
}
