import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"
import { redirect } from "next/navigation"
import Link from "next/link"
import { UsersTableControls } from "@web/components/admin/users-table-controls"

const colorMap: Record<string, string> = {
  purple: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  green: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  yellow: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  red: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  gray: "bg-gray-100 text-gray-700 dark:bg-stone-700/50 dark:text-stone-200",
}

const VALID_SORT_COLUMNS = ["name", "email", "role", "is_active"] as const
type SortColumn = (typeof VALID_SORT_COLUMNS)[number]

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; order?: string; q?: string }>
}) {
  const { sort: rawSort, order: rawOrder, q = "" } = await searchParams

  const sort: SortColumn = VALID_SORT_COLUMNS.includes(rawSort as SortColumn)
    ? (rawSort as SortColumn)
    : "name"
  const order = rawOrder === "desc" ? "desc" : "asc"

  const user = await getServerUser()

  if (!(await canAccess(user.id, user.orgId, "configuracoes.usuarios"))) {
    redirect("/dashboard")
  }

  const supabase = await createClient()
  const isAdmin = await canAccess(user.id, user.orgId, "sistema")

  let usersQuery = supabase
    .from("users")
    .select("id, name, email, role, is_active, auth_id")
    .eq("org_id", user.orgId)

  if (q.trim()) {
    usersQuery = usersQuery.or(`name.ilike.%${q.trim()}%,email.ilike.%${q.trim()}%`)
  }

  usersQuery = usersQuery.order(sort, { ascending: order === "asc" })

  const [{ data: users }, { data: orgRoles }] = await Promise.all([
    usersQuery,
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

      <UsersTableControls
        users={users ?? []}
        roles={roles}
        roleColors={roleColors}
        roleLabels={roleLabels}
        isAdmin={isAdmin}
        currentUserId={user.id}
        currentOrgId={user.orgId}
        sort={sort}
        order={order}
        q={q}
      />
    </div>
  )
}
