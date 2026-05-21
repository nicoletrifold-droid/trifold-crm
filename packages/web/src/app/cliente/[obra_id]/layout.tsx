import type { Metadata } from "next"
import { ObraTabNav } from "./_components/obra-tab-nav"
import { Sidebar } from "./_components/sidebar"
import { PrivacyButton } from "./_components/privacy-button"
import { PrivacyConsentModal } from "./_components/privacy-consent-modal"
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
  let privacyAccepted = false

  const {
    data: { user },
  } = await supabase.auth.getUser()

  let unreadMensagens = 0

  if (user) {
    const { data: userData } = await supabase
      .from("users")
      .select("id, name, email, privacy_accepted_at")
      .eq("auth_id", user.id)
      .single()
    if (userData) {
      userName = userData.name ?? "Usuário"
      userEmail = userData.email ?? user.email ?? ""
      privacyAccepted = !!userData.privacy_accepted_at

      const { count } = await supabase
        .from("obra_mensagens")
        .select("id", { count: "exact", head: true })
        .eq("obra_id", obra_id)
        .eq("cliente_id", userData.id)
        .eq("sender_type", "equipe")
        .is("read_at", null)
      unreadMensagens = count ?? 0
    } else {
      userEmail = user.email ?? ""
    }
  }

  return (
    <>
      <div className="flex min-h-screen bg-stone-950">
        <Sidebar obraId={obra_id} userName={userName} userEmail={userEmail} unreadMensagens={unreadMensagens} />
        <div className="flex flex-1 flex-col pb-16 lg:pl-[260px] lg:pb-0">
          {children}
        </div>
        <ObraTabNav obraId={obra_id} unreadMensagens={unreadMensagens} />
        <PrivacyButton />
      </div>
      <PrivacyConsentModal privacyAccepted={privacyAccepted} />
      <PushPrompt />
    </>
  )
}
