"use client"

import { createClient } from "@web/lib/supabase/client"
import { useRouter } from "next/navigation"

export function LogoutButton() {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  return (
    <button
      onClick={handleLogout}
      className="mt-1 flex w-full items-center justify-center rounded-lg px-3 py-1.5 text-[12px] text-stone-400 hover:bg-stone-50 hover:text-stone-600"
    >
      Sair
    </button>
  )
}
