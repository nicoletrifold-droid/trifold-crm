import { getServerUser } from "@web/lib/auth"
import { createClient } from "@web/lib/supabase/server"
import { redirect } from "next/navigation"
import { SidebarNav } from "@web/components/layout/sidebar-nav"
import { LayoutDashboard, Users, Kanban, CalendarDays, Building2, Smartphone, CreditCard, MessageSquarePlus } from "lucide-react"
import { NewLeadNotification } from "./_components/new-lead-notification"
import { BrokerPushPrompt } from "./_components/broker-push-prompt"
import { BrokerInstallPrompt } from "./_components/broker-install-prompt"
import { WeatherWidget } from "@web/components/weather-widget"

const ICON_SIZE = "h-[18px] w-[18px]"

const NAV_ITEMS = [
  { href: "/broker", label: "Início", icon: <LayoutDashboard className={ICON_SIZE} /> },
  { href: "/broker/leads", label: "Meus Leads", icon: <Users className={ICON_SIZE} /> },
  { href: "/broker/pipeline", label: "Pipeline", icon: <Kanban className={ICON_SIZE} /> },
  { href: "/broker/agenda", label: "Agenda", icon: <CalendarDays className={ICON_SIZE} /> },
  { href: "/broker/properties", label: "Imóveis", icon: <Building2 className={ICON_SIZE} /> },
  { href: "https://corretor-trifold.streamlit.app", label: "Fluxo de Pagamento", icon: <CreditCard className={ICON_SIZE} />, external: true, separator: true },
  { href: "/broker/instalar", label: "Instalar app", icon: <Smartphone className={ICON_SIZE} /> },
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

  // Compromissos futuros e ativos do corretor — alimenta o badge do menu "Agenda".
  const { count: agendaCount } = await supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("org_id", user.orgId)
    .eq("broker_id", user.id)
    .in("status", ["scheduled", "confirmed"])
    .gte("scheduled_at", new Date().toISOString())

  // Story 75-8 — badge de novos leads distribuídos desde a última visita a "Meus Leads".
  // Fonte: lead_distribution_log (broker_id = brokers.id; created_at > seen_at).
  let leadsCount = 0
  const { data: brokerRow } = await supabase
    .from("brokers")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle()

  if (brokerRow) {
    const { data: seenRow } = await supabase
      .from("users")
      .select("leads_notifications_seen_at")
      .eq("id", user.id)
      .maybeSingle()
    const seenAt =
      (seenRow as { leads_notifications_seen_at: string | null } | null)
        ?.leads_notifications_seen_at ?? "1970-01-01T00:00:00Z"

    const { count } = await supabase
      .from("lead_distribution_log")
      .select("id", { count: "exact", head: true })
      .eq("org_id", user.orgId)
      .eq("broker_id", brokerRow.id)
      .eq("status", "distributed")
      .gt("created_at", seenAt)
    leadsCount = count ?? 0
  }

  const navItems = NAV_ITEMS.map((item) => {
    if (item.href === "/broker/agenda") return { ...item, badge: agendaCount ?? 0 }
    if (item.href === "/broker/leads") return { ...item, badge: leadsCount }
    return item
  })

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <WeatherWidget variant="dark" className="fixed top-4 right-4 z-40 hidden lg:flex" />
      <SidebarNav
        items={navItems}
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
      <BrokerInstallPrompt />
    </div>
  )
}
