import { getServerUser } from "@web/lib/auth"
import { createClient } from "@web/lib/supabase/server"
import { redirect } from "next/navigation"
import { SidebarNav } from "@web/components/layout/sidebar-nav"
import { LayoutDashboard, Users, Kanban, CalendarDays, Bell, MessageSquarePlus } from "lucide-react"
import { NewLeadNotification } from "./_components/new-lead-notification"

const ICON_SIZE = "h-[18px] w-[18px]"

const NAV_ITEMS = [
  { href: "/broker", label: "Início", icon: <LayoutDashboard className={ICON_SIZE} /> },
  { href: "/broker/leads", label: "Meus Leads", icon: <Users className={ICON_SIZE} /> },
  { href: "/broker/pipeline", label: "Pipeline", icon: <Kanban className={ICON_SIZE} /> },
  { href: "/broker/agenda", label: "Agenda", icon: <CalendarDays className={ICON_SIZE} /> },
  { href: "/broker/alertas", label: "Alertas", icon: <Bell className={ICON_SIZE} /> },
  { href: "/broker/suporte", label: "Suporte", icon: <MessageSquarePlus className={ICON_SIZE} /> },
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

  const supabase = await createClient()

  // Count pending alerts for this broker's leads
  // We need to join follow_up_log with leads to filter by assigned_broker_id
  const { count: alertCount } = await supabase
    .from("follow_up_log")
    .select("id, lead:leads!lead_id!inner(assigned_broker_id)", { count: "exact", head: true })
    .eq("org_id", user.orgId)
    .eq("status", "pending")
    .eq("lead.assigned_broker_id", user.id)

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <SidebarNav
        items={NAV_ITEMS}
        userName={user.name}
        userRole={user.role}
        basePath="/broker"
        alertCount={alertCount ?? 0}
      />

      <main className="lg:pl-56">
        <div className="mx-auto max-w-6xl px-4 py-6 pb-24 lg:px-8 lg:py-8 lg:pb-8">
          {children}
        </div>
      </main>

      <NewLeadNotification userId={user.id} orgId={user.orgId} />
    </div>
  )
}
