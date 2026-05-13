"use client"

import { useTheme } from "next-themes"
import { Sun, Moon, Monitor } from "lucide-react"

const CYCLE: Array<"light" | "dark" | "system"> = ["light", "dark", "system"]

const ICONS = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const

const LABELS = {
  light: "Tema claro",
  dark: "Tema escuro",
  system: "Tema do sistema",
} as const

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()

  const current = (theme && CYCLE.includes(theme as "light" | "dark" | "system") ? theme : "system") as "light" | "dark" | "system"
  const nextTheme = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length]
  const Icon = ICONS[current]

  async function handleClick() {
    setTheme(nextTheme)
    try {
      await fetch("/api/user/theme", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: nextTheme }),
      })
    } catch {
      // persistência falhou, tema local já foi aplicado
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={LABELS[current]}
      aria-label={LABELS[current]}
      suppressHydrationWarning
      className={`flex h-7 w-7 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors dark:text-stone-500 dark:hover:bg-stone-800/60 dark:hover:text-stone-200 ${className ?? ""}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}
