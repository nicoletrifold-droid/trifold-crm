"use client"

import { useEffect, useState } from "react"
import { createClient } from "@web/lib/supabase/client"
import type { AppUser } from "@web/lib/auth"

export function useUser() {
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    async function getUser() {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser()

      if (!authUser) {
        setUser(null)
        setLoading(false)
        return
      }

      const { data: appUser } = await supabase
        .from("users")
        .select("id, auth_id, org_id, name, email, role, avatar_url, theme")
        .eq("auth_id", authUser.id)
        .single()

      if (appUser) {
        setUser({
          id: appUser.id,
          authId: appUser.auth_id,
          orgId: appUser.org_id,
          name: appUser.name,
          email: appUser.email,
          role: appUser.role,
          avatarUrl: appUser.avatar_url,
          theme: (appUser.theme as "light" | "dark" | "system") ?? "system",
        })
      }

      setLoading(false)
    }

    getUser()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setUser(null)
        setLoading(false)
      } else {
        getUser()
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return { user, loading }
}
