import type { Metadata } from "next"
import { ObraTabNav } from "./_components/obra-tab-nav"
import { Sidebar } from "./_components/sidebar"
import { PushPrompt } from "@web/components/portal/push-prompt"
import { createClient } from "@web/lib/supabase/server"

export const metadata: Metadata = {
  manifest: "/cliente-manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Minha Obra",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
}

export default async function ObraLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ obra_id: string }>
}) {
  const { obra_id } = await params
  const supabase = await createClient()

  let userName = "Usuário"
  let userEmail = ""

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const { data: userData } = await supabase
      .from("users")
      .select("name, email")
      .eq("auth_id", user.id)
      .single()
    if (userData) {
      userName = userData.name ?? "Usuário"
      userEmail = userData.email ?? user.email ?? ""
    } else {
      userEmail = user.email ?? ""
    }
  }

  return (
    <div className="flex min-h-screen bg-stone-950">
      <PushPrompt />
      <Sidebar obraId={obra_id} userName={userName} userEmail={userEmail} />
      <div className="flex flex-1 flex-col pb-16 lg:pl-[185px] lg:pb-0">
        {children}
      </div>
      <ObraTabNav obraId={obra_id} />
    </div>
  )
}
