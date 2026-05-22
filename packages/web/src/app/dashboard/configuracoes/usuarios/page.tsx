import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"
import { redirect } from "next/navigation"
import Link from "next/link"
import { RoleDropdown, ToggleActiveButton } from "@web/components/admin/role-dropdown"
import { UserEditModal } from "@web/components/admin/user-edit-modal"

const colorMap: Record<string, string> = {
  purple: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  green: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  yellow: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  red: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  gray: "bg-gray-100 text-gray-700 dark:bg-stone-700/50 dark:text-stone-200",
}

export default async function UsuariosPage() {
  const user = await getServerUser()

  if (!(await canAccess(user.id, user.orgId, "configuracoes.usuarios"))) {
    redirect("/dashboard")
  }

  const supabase = await createClient()
  const isAdmin = await canAccess(user.id, user.orgId, "sistema")

  const [{ data: users }, { data: orgRoles }] = await Promise.all([
    supabase
      .from("users")
      .select("id, name, email, role, is_active, created_at, auth_id")
      .eq("org_id", user.orgId)
      .order("name"),
    supabase
      .from("roles")
      .select("id, name, label, color")
      .eq("org_id", user.orgId)
      .order("label"),
  ])

  const roles = orgRoles ?? []

  const roleColors: Record<string, string> = Object.fromEntries(
    roles.map((r) => [r.name, colorMap[r.color] ?? colorMap.gray])
  )

  const roleLabels: Record<string, string> = Object.fromEntries(
    roles.map((r) => [r.name, r.label])
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/dashboard/configuracoes"
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-stone-400 dark:hover:text-stone-200"
          >
            &larr; Configurações
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-stone-100">Usuários</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-stone-400">
            Gerenciar usuários e permissões
          </p>
        </div>
        {isAdmin && (
          <Link
            href="/dashboard/configuracoes/usuarios/novo"
            className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
          >
            Novo usuário
          </Link>
        )}
      </div>

      <div className="rounded-lg bg-white shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-stone-800">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:bg-stone-800/50 dark:text-stone-400">
              <th className="px-6 py-3">Nome</th>
              <th className="px-6 py-3">Email</th>
              <th className="px-6 py-3">Perfil</th>
              <th className="px-6 py-3">Status</th>
              {isAdmin && <th className="px-6 py-3">Ações</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-stone-800">
            {users?.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-stone-800/30">
                <td className="px-6 py-4 font-medium text-gray-900 dark:text-stone-100">
                  {u.name || "Sem nome"}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">{u.email}</td>
                <td className="px-6 py-4">
                  {isAdmin && u.id !== user.id ? (
                    <RoleDropdown userId={u.id} currentRole={u.role} roles={roles} />
                  ) : (
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        roleColors[u.role] ?? colorMap.gray
                      }`}
                    >
                      {roleLabels[u.role] ?? u.role}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      u.is_active
                        ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300"
                        : "bg-gray-100 text-gray-500 dark:bg-stone-700/50 dark:text-stone-400"
                    }`}
                  >
                    {u.is_active ? "Ativo" : "Inativo"}
                  </span>
                </td>
                {isAdmin && (
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1">
                      <UserEditModal
                        userId={u.id}
                        userName={u.name ?? ""}
                        userEmail={u.email}
                        isOwnAccount={u.id === user.id}
                        orgId={user.orgId}
                      />
                      {u.id !== user.id && (
                        <ToggleActiveButton userId={u.id} isActive={u.is_active} />
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {(!users || users.length === 0) && (
              <tr>
                <td
                  colSpan={isAdmin ? 5 : 4}
                  className="px-6 py-8 text-center text-sm text-gray-500 dark:text-stone-400"
                >
                  Nenhum usuário encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
