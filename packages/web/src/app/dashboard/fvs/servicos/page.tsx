import { redirect } from "next/navigation"
import { getServerUser } from "@web/lib/auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { canAccess } from "@web/lib/permissions"
import { ServicosManager, type ServicoComFicha } from "./_components/servicos-manager"
import type { FvsFichaModelo, FvsFichaModeloItem, FvsServico } from "@web/lib/fvs/fvs"

// FVS — serviços + fichas-modelo (Story 75-293, AC4).
// 3 queries e montagem em memória, de propósito: embed aninhado com 2 níveis já
// mordeu antes (JOIN de 2 filhas = cartesiano — ver portal-fotos-fases).
export const dynamic = "force-dynamic"

export default async function FvsServicosPage() {
  const user = await getServerUser()
  if (!(await canAccess(user.id, user.orgId, "fvs"))) {
    redirect("/dashboard")
  }

  const admin = createAdminClient()
  const [{ data: servicos }, { data: fichas }, { data: itens }] = await Promise.all([
    admin.from("fvs_servicos").select("*").eq("org_id", user.orgId).order("nome"),
    admin.from("fvs_fichas_modelo").select("*").eq("org_id", user.orgId).eq("ativa", true),
    admin.from("fvs_ficha_modelo_itens").select("*").eq("org_id", user.orgId).order("ordem"),
  ])

  const fichaPorServico = new Map<string, FvsFichaModelo>()
  for (const f of (fichas ?? []) as FvsFichaModelo[]) fichaPorServico.set(f.servico_id, f)
  const itensPorFicha = new Map<string, FvsFichaModeloItem[]>()
  for (const it of (itens ?? []) as FvsFichaModeloItem[]) {
    const list = itensPorFicha.get(it.ficha_modelo_id) ?? []
    list.push(it)
    itensPorFicha.set(it.ficha_modelo_id, list)
  }

  const rows: ServicoComFicha[] = ((servicos ?? []) as FvsServico[]).map((s) => {
    const ficha = fichaPorServico.get(s.id) ?? null
    return { servico: s, ficha, itens: ficha ? itensPorFicha.get(ficha.id) ?? [] : [] }
  })

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <ServicosManager rows={rows} />
    </div>
  )
}
