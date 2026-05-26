"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

type RoleOption = { name: string; label: string }

export function RoleDropdown({
  userId,
  currentRole,
  roles,
}: {
  userId: string
  currentRole: string
  roles: RoleOption[]
}) {
  const router = useRouter()
  const [value, setValue] = useState(currentRole)
  const [saving, setSaving] = useState(false)

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newRole = e.target.value
    if (!newRole || newRole === value) return

    setSaving(true)
    setValue(newRole)

    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    })

    if (!res.ok) {
      setValue(value)
    } else {
      router.refresh()
    }

    setSaving(false)
  }

  return (
    <select
      value={value}
      onChange={handleChange}
      disabled={saving}
      className="rounded-md border border-stone-200 px-2 py-1 text-xs focus:border-orange-500 focus:outline-none disabled:opacity-60 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
    >
      {roles.map((r) => (
        <option key={r.name} value={r.name}>
          {r.label}
        </option>
      ))}
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
