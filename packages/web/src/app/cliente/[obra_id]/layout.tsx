import type { Metadata } from "next"
import { ObraTabNav } from "./_components/obra-tab-nav"
import { PushPrompt } from "@web/components/portal/push-prompt"

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
  return (
    <div className="flex min-h-screen flex-col bg-stone-950 pb-16">
      <PushPrompt />
      {children}
      <ObraTabNav obraId={obra_id} />
    </div>
  )
}
