"use client"

import { useRouter } from "next/navigation"

export function RoleDropdown({
  userId,
  currentRole,
}: {
  userId: string
  currentRole: string
}) {
  const router = useRouter()

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newRole = e.target.value
    if (!["admin", "supervisor", "broker", "obras"].includes(newRole)) return

    await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    })

    router.refresh()
  }

  return (
    <select
      defaultValue={currentRole}
      onChange={handleChange}
      className="rounded-md border border-stone-200 px-2 py-1 text-xs focus:border-orange-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
    >
      <option value="admin">Admin</option>
      <option value="supervisor">Supervisor</option>
      <option value="broker">Corretor</option>
      <option value="obras">Obras</option>
    </select>
  )
}

export function ToggleActiveButton({
  userId,
  isActive,
}: {
  userId: string
  isActive: boolean
}) {
  const router = useRouter()

  async function handleToggle() {
    await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !isActive }),
    })

    router.refresh()
  }

  return (
    <button
      onClick={handleToggle}
      className={`rounded-md px-2.5 py-1 text-xs font-medium ${
        isActive
          ? "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-500/15 dark:text-red-300 dark:hover:bg-red-500/20"
          : "bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-500/15 dark:text-green-300 dark:hover:bg-green-500/20"
      }`}
    >
      {isActive ? "Desativar" : "Ativar"}
    </button>
  )
}
