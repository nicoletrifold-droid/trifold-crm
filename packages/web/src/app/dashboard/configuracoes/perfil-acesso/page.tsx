import { Suspense } from "react"
import { getServerUser } from "@web/lib/auth"
import {
  getOrgPermissionsMatrix,
  getOrgRoles,
  ALL_MODULES,
} from "@web/lib/permissions"
import Link from "next/link"
import { redirect } from "next/navigation"
import {
  PermissionsMatrix,
  PermissionsMatrixSkeleton,
} from "./permissions-matrix"
import { ProfileActionsHeader } from "./profile-actions-header"

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

export default async function PerfilAcessoPage() {
  const user = await getServerUser()

  if (user.role !== "admin") {
    redirect("/dashboard")
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/dashboard/configuracoes"
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-stone-400 dark:hover:text-stone-200"
          >
            &larr; Configurações
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-stone-100">
            Perfil de Acesso
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-stone-400">
            Módulos disponíveis por perfil de usuário
          </p>
        </div>
        <ProfileActionsHeader orgId={user.orgId} />
      </div>

      <Suspense fallback={<PermissionsMatrixSkeleton />}>
        <PermissionsMatrixLoader orgId={user.orgId} />
      </Suspense>

      <p className="text-sm text-gray-400 dark:text-stone-500">
        Alterações são salvas automaticamente. Roles do sistema não podem ser
        excluídos.
      </p>
    </div>
  )
}
