/**
 * Story 900-22 — lista de empresas clientes.
 *
 * Usa `createAdminClient` de propósito: o platform admin precisa enxergar TODAS as orgs, e
 * a RLS de `organizations` escopa por org do usuário. Esta é justamente a fronteira em que o
 * service-role é o mecanismo correto, e não um atalho — o acesso já foi decidido pelo
 * `requirePlatformAdmin()` do layout.
 *
 * Quando a Onda 6 trouxer `platformQuery()` e a lista fechada `PLATFORM_READABLE_TABLES`,
 * esta consulta passa por lá.
 */

import Link from "next/link"
import { createAdminClient } from "@web/lib/supabase/admin"

export const dynamic = "force-dynamic"

interface OrgRow {
  id: string
  name: string
  slug: string
  is_active: boolean
  created_at: string
}

export default async function OrgsPage() {
  const db = createAdminClient()

  const { data: orgs } = await db
    .from("organizations")
    .select("id, name, slug, is_active, created_at")
    .order("created_at", { ascending: true })

  const lista = (orgs ?? []) as OrgRow[]

  // Contagem de usuários por org, numa consulta só — evita N+1 na renderização.
  const { data: usuarios } = await db.from("users").select("org_id")
  const porOrg = new Map<string, number>()
  for (const u of (usuarios ?? []) as Array<{ org_id: string | null }>) {
    if (u.org_id) porOrg.set(u.org_id, (porOrg.get(u.org_id) ?? 0) + 1)
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Empresas</h1>
          <p className="text-sm text-slate-400">
            {lista.length} {lista.length === 1 ? "empresa" : "empresas"} no sistema
          </p>
        </div>
        <Link
          href="/platform/orgs/new"
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400"
        >
          Nova empresa
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Empresa</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Usuários</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Criada em</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {lista.map((org) => (
              <tr key={org.id} className="hover:bg-slate-900/50">
                <td className="px-4 py-3 font-medium">{org.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-400">{org.slug}</td>
                <td className="px-4 py-3 text-slate-300">{porOrg.get(org.id) ?? 0}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      org.is_active
                        ? "rounded bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400"
                        : "rounded bg-slate-700/40 px-2 py-0.5 text-xs text-slate-400"
                    }
                  >
                    {org.is_active ? "ativa" : "inativa"}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">
                  {new Date(org.created_at).toLocaleDateString("pt-BR")}
                </td>
              </tr>
            ))}
            {lista.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  Nenhuma empresa ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
