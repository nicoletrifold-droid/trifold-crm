/**
 * Story 900-22 — lista de empresas clientes.
 * Story 900-22b — as leituras passam por `platformQuery()`, e a tabela mostra o convite do admin.
 *
 * Por que `platformQuery()` e não o client de service-role direto: o platform admin precisa
 * enxergar TODAS as orgs, e a RLS de `organizations` escopa por org do usuário — então aqui o
 * service-role é o mecanismo correto, não um atalho. Justamente por isso a fronteira real de
 * "o que a Trifold consegue ler de um cliente" não é a RLS, é a lista fechada
 * `PLATFORM_READABLE_TABLES`. Uma leitura crua nesta tela seria uma superfície fora dessa lista,
 * e é isso que `platform-query-scan.ts` varre e proíbe nos diretórios de plataforma.
 *
 * O acesso em si já foi decidido pelo `requirePlatformAdmin()` do layout.
 */

import Link from "next/link"
import { platformQuery } from "@web/lib/tenancy/platform-query"
import { deriveAdminInviteStatus } from "@web/lib/tenancy/admin-invite"
import { FUSO_DO_CONSOLE } from "@web/lib/tenancy/console-leitura"
import { ReenviarConvite } from "./_components/reenviar-convite"

export const dynamic = "force-dynamic"

interface OrgRow {
  id: string
  name: string
  slug: string
  is_active: boolean
  created_at: string
  admin_invite_email: string | null
}

export default async function OrgsPage() {
  const { data: orgs } = await platformQuery(
    "organizations",
    "id, name, slug, is_active, created_at, admin_invite_email",
  ).order("created_at", { ascending: true })

  const lista = (orgs ?? []) as unknown as OrgRow[]

  // Contagem de usuários por org, numa consulta só — evita N+1 na renderização.
  const { data: usuarios } = await platformQuery("users", "org_id")
  const porOrg = new Map<string, number>()
  for (const u of (usuarios ?? []) as unknown as Array<{ org_id: string | null }>) {
    if (u.org_id) porOrg.set(u.org_id, (porOrg.get(u.org_id) ?? 0) + 1)
  }

  // Consulta DEDICADA e filtrada por `role`, em vez de reaproveitar a contagem acima: o número
  // de linhas `role='admin'` é limitado pelo número de orgs, não pelo total de usuários, então
  // ela não sofre o corte de 1000 linhas do PostgREST que truncaria o estado do admin numa
  // empresa grande (mesma classe de defeito corrigida na Story 75-198).
  //
  // `created_at ASC` é o MESMO desempate que `ensureAdminInvited` usa na escrita, e tem que ser
  // o mesmo: a org "Trifold" legada tem mais de uma linha `role='admin'`. Se a leitura pegasse
  // uma linha e o convite agisse sobre outra, o badge apontaria para um admin e o "Reenviar"
  // para outro — o operador veria "convite pendente" e receberia `400 NO_PENDING_INVITE`, sem
  // explicação possível na tela.
  const { data: adminRows } = await platformQuery("users", "org_id, id, auth_id")
    .eq("role", "admin")
    .order("created_at", { ascending: true })
  const adminPorOrg = new Map<string, { id: string; authId: string | null }>()
  for (const a of (adminRows ?? []) as unknown as Array<{
    org_id: string | null
    id: string
    auth_id: string | null
  }>) {
    if (a.org_id && !adminPorOrg.has(a.org_id)) {
      adminPorOrg.set(a.org_id, { id: a.id, authId: a.auth_id })
    }
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
              <th className="px-4 py-3">Admin</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Criada em</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {lista.map((org) => {
              const statusConvite = deriveAdminInviteStatus({
                adminInviteEmail: org.admin_invite_email,
                admin: adminPorOrg.get(org.id) ?? null,
              })

              return (
                <tr key={org.id} className="hover:bg-slate-900/50">
                  <td className="px-4 py-3 font-medium">{org.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">{org.slug}</td>
                  <td className="px-4 py-3 text-slate-300">{porOrg.get(org.id) ?? 0}</td>
                  <td className="px-4 py-3 align-top">
                    {statusConvite === "active" && (
                      <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400">
                        convidado
                      </span>
                    )}
                    {statusConvite === "pending" && (
                      <>
                        <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-400">
                          convite pendente
                        </span>
                        <ReenviarConvite orgId={org.id} />
                      </>
                    )}
                    {statusConvite === "none" && <span className="text-slate-600">—</span>}
                  </td>
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
                    {new Date(org.created_at).toLocaleDateString("pt-BR", { timeZone: FUSO_DO_CONSOLE })}
                  </td>
                </tr>
              )
            })}
            {lista.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
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
