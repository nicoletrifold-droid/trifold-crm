import { getServerUser } from "@web/lib/auth"
import { redirect } from "next/navigation"
import { SidebarNav } from "@web/components/layout/sidebar-nav"
import { LayoutDashboard, Users, Kanban, CalendarDays, Smartphone } from "lucide-react"
import { NewLeadNotification } from "./_components/new-lead-notification"
import { BrokerPushPrompt } from "./_components/broker-push-prompt"

const ICON_SIZE = "h-[18px] w-[18px]"

const NAV_ITEMS = [
  { href: "/broker", label: "Início", icon: <LayoutDashboard className={ICON_SIZE} /> },
  { href: "/broker/leads", label: "Meus Leads", icon: <Users className={ICON_SIZE} /> },
  { href: "/broker/pipeline", label: "Pipeline", icon: <Kanban className={ICON_SIZE} /> },
  { href: "/broker/agenda", label: "Agenda", icon: <CalendarDays className={ICON_SIZE} /> },
  { href: "/broker/instalar", label: "Instalar app", icon: <Smartphone className={ICON_SIZE} />, separator: true },
]

export default async function BrokerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getServerUser()

  if (user.role !== "broker") {
    redirect("/dashboard")
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <SidebarNav
        items={NAV_ITEMS}
        userName={user.name}
        userRole={user.role}
        basePath="/broker"
      />

      <main className="lg:pl-56">
        <div className="mx-auto max-w-6xl px-4 py-6 pb-24 lg:px-8 lg:py-8 lg:pb-8">
          {children}
        </div>
      </main>

      <NewLeadNotification userId={user.id} orgId={user.orgId} />
      <BrokerPushPrompt />
    </div>
  )
}
