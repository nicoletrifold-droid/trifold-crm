"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { RoleDropdown, ToggleActiveButton } from "@web/components/admin/role-dropdown"
import { UserEditModal } from "@web/components/admin/user-edit-modal"
import { ScrollableX } from "@web/components/ui/scrollable-x"

type RoleOption = { name: string; label: string }
type User = {
  id: string
  name: string | null
  email: string
  phone?: string | null
  role: string
  is_active: boolean
  auth_id?: string | null
}

function SortIcon({ active, order }: { active: boolean; order: string }) {
  if (!active) return <span className="ml-1 text-stone-500 opacity-40">↕</span>
  return <span className="ml-1">{order === "asc" ? "↑" : "↓"}</span>
}

export function UsersTableControls({
  users,
  roles,
  roleColors,
  roleLabels,
  isAdmin,
  currentUserId,
  currentOrgId,
  sort,
  order,
  q,
}: {
  users: User[]
  roles: RoleOption[]
  roleColors: Record<string, string>
  roleLabels: Record<string, string>
  isAdmin: boolean
  currentUserId: string
  currentOrgId: string
  sort: string
  order: string
  q: string
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [searchValue, setSearchValue] = useState(q)

  function navigate(overrides: Record<string, string>) {
    const sp = new URLSearchParams()
    if (sort) sp.set("sort", sort)
    if (order) sp.set("order", order)
    if (searchValue) sp.set("q", searchValue)
    Object.entries(overrides).forEach(([k, v]) => {
      if (v) sp.set(k, v)
      else sp.delete(k)
    })
    startTransition(() => {
      router.replace(`?${sp.toString()}`)
    })
  }

  function handleSort(column: string) {
    if (sort === column) {
      navigate({ order: order === "asc" ? "desc" : "asc" })
    } else {
      navigate({ sort: column, order: "asc" })
    }
  }

  function handleSearch(value: string) {
    setSearchValue(value)
    const sp = new URLSearchParams()
    if (sort) sp.set("sort", sort)
    if (order) sp.set("order", order)
    if (value) sp.set("q", value)
    startTransition(() => {
      router.replace(`?${sp.toString()}`)
    })
  }

  const thClass =
    "px-6 py-3 cursor-pointer select-none hover:text-stone-200 transition-colors whitespace-nowrap"

  const fallbackColor = "bg-gray-100 text-gray-700 dark:bg-stone-700/50 dark:text-stone-200"

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative max-w-xs">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
          />
        </svg>
        <input
          type="text"
          value={searchValue}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Buscar por nome ou email..."
          className="w-full rounded-lg border border-stone-200 bg-stone-50 py-2 pl-9 pr-4 text-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
        />
      </div>

      {/* Table */}
      <ScrollableX className="rounded-lg bg-white shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-stone-800">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:bg-stone-800/50 dark:text-stone-400">
              <th className={thClass} onClick={() => handleSort("name")}>
                Nome <SortIcon active={sort === "name"} order={order} />
              </th>
              <th className={thClass} onClick={() => handleSort("email")}>
                Email <SortIcon active={sort === "email"} order={order} />
              </th>
              <th className={thClass} onClick={() => handleSort("role")}>
                Perfil <SortIcon active={sort === "role"} order={order} />
              </th>
              <th className={thClass} onClick={() => handleSort("is_active")}>
                Status <SortIcon active={sort === "is_active"} order={order} />
              </th>
              {isAdmin && (
                <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-stone-400">
                  Ações
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-stone-800">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-stone-800/30">
                <td className="px-6 py-4 font-medium text-gray-900 dark:text-stone-100">
                  {u.name || "Sem nome"}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">{u.email}</td>
                <td className="px-6 py-4">
                  {isAdmin && u.id !== currentUserId ? (
                    <RoleDropdown userId={u.id} currentRole={u.role} roles={roles} />
                  ) : (
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        roleColors[u.role] ?? fallbackColor
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
                        userPhone={u.phone}
                        isOwnAccount={u.id === currentUserId}
                        orgId={currentOrgId}
                      />
                      {u.id !== currentUserId && (
                        <ToggleActiveButton userId={u.id} isActive={u.is_active} />
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td
                  colSpan={isAdmin ? 5 : 4}
                  className="px-6 py-8 text-center text-sm text-gray-500 dark:text-stone-400"
                >
                  {searchValue ? "Nenhum usuário encontrado para essa busca." : "Nenhum usuário encontrado."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </ScrollableX>
    </div>
  )
}
