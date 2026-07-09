import { requireViewerAccess } from "@web/lib/portal/viewer"
import { PortalClienteSeletor, type EmpreendimentoGroup } from "./_components/seletor"

export const dynamic = "force-dynamic"

interface VinculoRow {
  id: string
  numero_unidade: string | null
  distrato: boolean | null
  obras: { id: string; name: string | null; property_id: string | null } | null
  clientes: { nome: string | null } | { nome: string | null }[] | null
}

export default async function PortalClientePage() {
  const { user, admin } = await requireViewerAccess()

  // Modelo real: cada cliente/unidade é um clientes_obras_vinculos sobre a obra do
  // empreendimento. Listamos os vínculos (unidades) agrupados por empreendimento.
  const [vincRes, propsRes] = await Promise.all([
    admin
      .from("clientes_obras_vinculos")
      .select("id, numero_unidade, distrato, obras!inner(id, name, property_id, org_id), clientes(nome)")
      .eq("obras.org_id", user.orgId),
    admin.from("properties").select("id, name").eq("org_id", user.orgId),
  ])

  const propMap = new Map<string, string>(
    (propsRes.data ?? []).map((p) => [p.id as string, (p.name as string) ?? "Empreendimento"])
  )

  const groupsMap = new Map<string, EmpreendimentoGroup>()
  for (const v of (vincRes.data ?? []) as unknown as VinculoRow[]) {
    const obra = Array.isArray(v.obras) ? v.obras[0] : v.obras
    if (!obra) continue
    const propId = obra.property_id ?? "sem-empreendimento"
    const propName = obra.property_id
      ? (propMap.get(obra.property_id) ?? obra.name ?? "Empreendimento")
      : (obra.name ?? "Sem empreendimento")
    const c = Array.isArray(v.clientes) ? v.clientes[0] : v.clientes
    const clienteNome = (c as { nome?: string | null } | null)?.nome ?? null

    const group: EmpreendimentoGroup =
      groupsMap.get(propId) ?? { propertyId: propId, propertyName: propName, unidades: [] }
    group.unidades.push({
      vinculoId: v.id,
      obraName: obra.name ?? "Unidade",
      unidade: v.numero_unidade,
      clienteNome,
      distrato: Boolean(v.distrato),
    })
    groupsMap.set(propId, group)
  }

  const groups = [...groupsMap.values()]
    .map((g) => ({
      ...g,
      unidades: g.unidades.sort((a, b) =>
        (a.clienteNome ?? "").localeCompare(b.clienteNome ?? "")
      ),
    }))
    .sort((a, b) => a.propertyName.localeCompare(b.propertyName))

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 lg:py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100 lg:text-2xl">
          Portal do Cliente — Visão Mestre
        </h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Escolha um empreendimento e uma unidade para acompanhar o portal daquele cliente
          (somente leitura).
        </p>
      </div>

      <PortalClienteSeletor groups={groups} />
    </div>
  )
}
