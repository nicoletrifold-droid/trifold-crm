import { Suspense } from "react"
import { getServerUser } from "@web/lib/auth"
import {
  getOrgPermissionsMatrix,
  getOrgRoles,
  ALL_MODULES,
} from "@web/lib/permissions"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ChevronLeft, ShieldCheck, Sparkles } from "lucide-react"
import {
  PermissionsMatrix,
  PermissionsMatrixSkeleton,
} from "./permissions-matrix"
import { ProfileActionsHeader } from "./profile-actions-header"

async function ProfileActionsHeaderWithColors({ orgId }: { orgId: string }) {
  const roles = await getOrgRoles(orgId)
  const existingColors = roles.map((r) => r.color).filter(Boolean)
  return <ProfileActionsHeader orgId={orgId} existingColors={existingColors} />
}

/**
 * Componente assíncrono interno que carrega `roles` e `matrix` em paralelo
 * e renderiza o Client Component `PermissionsMatrix`. Isolar este fetch num
 * componente próprio permite que o `<Suspense>` exiba o skeleton enquanto
 * os dados estão sendo carregados.
 */
async function PermissionsMatrixLoader({ orgId }: { orgId: string }) {
  const [roles, matrix] = await Promise.all([
    getOrgRoles(orgId),
    getOrgPermissionsMatrix(orgId),
  ])

  return (
    <PermissionsMatrix roles={roles} matrix={matrix} modules={ALL_MODULES} />
  )
}

async function ProfileStats({ orgId }: { orgId: string }) {
  const roles = await getOrgRoles(orgId)
  const moduleCount = ALL_MODULES.length
  const roleCount = roles.length

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-2.5 py-1 font-medium text-orange-700 ring-1 ring-inset ring-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-500/20">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
        {roleCount} {roleCount === 1 ? "perfil" : "perfis"}
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 px-2.5 py-1 font-medium text-gray-600 ring-1 ring-inset ring-gray-200 dark:bg-stone-800 dark:text-stone-300 dark:ring-stone-700">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        {moduleCount} módulos
      </span>
    </div>
  )
}

export default async function PerfilAcessoPage() {
  const user = await getServerUser()

  if (user.role !== "admin") {
    redirect("/dashboard")
  }

  return (
    <div className="space-y-6">
      {/* Header — hero compacto com contexto, hierarquia e ações */}
      <div className="space-y-4">
        <Link
          href="/dashboard/configuracoes"
          className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 transition-colors hover:text-orange-600 dark:text-stone-400 dark:hover:text-orange-400"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Configurações
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 shadow-md shadow-orange-500/20 ring-1 ring-orange-600/20">
                <ShieldCheck
                  className="h-5 w-5 text-white"
                  aria-hidden="true"
                />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-stone-100">
                  Perfil de Acesso
                </h1>
                <p className="text-sm text-gray-500 dark:text-stone-400">
                  Defina o que cada perfil de usuário pode acessar no sistema
                </p>
              </div>
            </div>

            <Suspense
              fallback={
                <div className="flex gap-2">
                  <div className="h-6 w-20 animate-pulse rounded-full bg-gray-200 dark:bg-stone-800" />
                  <div className="h-6 w-24 animate-pulse rounded-full bg-gray-200 dark:bg-stone-800" />
                </div>
              }
            >
              <ProfileStats orgId={user.orgId} />
            </Suspense>
          </div>

          <ProfileActionsHeaderWithColors orgId={user.orgId} />
        </div>
      </div>

      {/* Matriz de permissões — card principal */}
      <Suspense fallback={<PermissionsMatrixSkeleton />}>
        <PermissionsMatrixLoader orgId={user.orgId} />
      </Suspense>

      {/* Footer hint — discreto e útil */}
      <div className="flex items-start gap-2 rounded-lg border border-dashed border-gray-200 bg-gray-50/50 px-4 py-3 text-xs text-gray-500 dark:border-stone-800 dark:bg-stone-900/40 dark:text-stone-400">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.8}
          stroke="currentColor"
          className="h-4 w-4 flex-shrink-0 text-orange-500"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
          />
        </svg>
        <p>
          Alterações são salvas automaticamente. Perfis do sistema não podem ser
          excluídos.
        </p>
      </div>
    </div>
  )
}
