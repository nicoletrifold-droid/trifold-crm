import { getServerUser } from "@web/lib/auth"
import { createClient } from "@web/lib/supabase/server"
import { redirect } from "next/navigation"
import { SidebarNav, type NavItem } from "@web/components/layout/sidebar-nav"
import { LayoutDashboard, Users, Kanban, CalendarDays, Building2, Smartphone, CreditCard, MessageSquarePlus, MessageCircle, Container, BookOpen } from "lucide-react"
import { getUserPermissions } from "@web/lib/permissions"
import { NewLeadNotification } from "./_components/new-lead-notification"
import { BrokerPushPrompt } from "./_components/broker-push-prompt"
import { BrokerInstallPrompt } from "./_components/broker-install-prompt"
import { WeatherWidget } from "@web/components/weather-widget"
import { getBrokerUnreadTotal } from "@web/lib/broker/unread-count"

const ICON_SIZE = "h-[18px] w-[18px]"

// Story 63-18 — nova ordem: as 4 primeiras são as tabs do bottom bar mobile
// (Início, Pipeline, Agenda, Chat); o restante (índice 4+) vai para o sheet "Mais".
// Desktop (sidebar) exibe TODOS os itens nesta mesma ordem (sem slice).
const NAV_ITEMS = [
  { href: "/broker", label: "Início", icon: <LayoutDashboard className={ICON_SIZE} /> },
  { href: "/broker/pipeline", label: "Pipeline", icon: <Kanban className={ICON_SIZE} /> },
  { href: "/broker/agenda", label: "Agenda", icon: <CalendarDays className={ICON_SIZE} /> },
  { href: "/broker/chat", label: "Chat", icon: <MessageCircle className={ICON_SIZE} /> },
  { href: "/broker/leads", label: "Meus Leads", icon: <Users className={ICON_SIZE} /> },
  { href: "/broker/properties", label: "Imóveis", icon: <Building2 className={ICON_SIZE} /> },
  { href: "/broker/bolsao", label: "Bolsão", icon: <Container className={ICON_SIZE} /> },
  { href: "https://corretor-trifold.streamlit.app", label: "Fluxo de Pagamento", icon: <CreditCard className={ICON_SIZE} />, external: true, separator: true },
  { href: "/broker/instalar", label: "App e Notificações", icon: <Smartphone className={ICON_SIZE} /> },
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

  // Compromissos futuros/ativos (badge "Agenda") + total de conversas não-lidas
  // (badge verde "Chat", Story 63-19). Queries independentes → Promise.all.
  const [{ count: agendaCount }, chatUnread] = await Promise.all([
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("org_id", user.orgId)
      .eq("broker_id", user.id)
      .in("status", ["scheduled", "confirmed"])
      .gte("scheduled_at", new Date().toISOString()),
    getBrokerUnreadTotal(supabase, user.orgId, user.id),
  ])

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

  // Story 75-83 — contador de leads no bolsão (pool = bolsao_em not null). RLS
  // leads_select_bolsao (migration 128) libera o pool p/ o corretor enxergar/contar.
  const { count: bolsaoCount } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("org_id", user.orgId)
    .eq("is_active", true)
    .not("bolsao_em", "is", null)
    .is("assigned_broker_id", null) // Story 75-89: contar só o pool real (sem dono)

  // Badges: Agenda (compromissos), Chat (não-lidas, verde — Story 63-19),
  // Meus Leads (novos distribuídos — Story 75-8), Bolsão (pool — Story 75-83).
  const navItems: NavItem[] = NAV_ITEMS.map((item) => {
    if (item.href === "/broker/agenda") return { ...item, badge: agendaCount ?? 0 }
    if (item.href === "/broker/chat")
      return { ...item, badge: chatUnread, badgeTone: "green" as const }
    if (item.href === "/broker/leads") return { ...item, badge: leadsCount }
    if (item.href === "/broker/bolsao") return { ...item, badge: bolsaoCount ?? 0 }
    return item
  })

  // Story 75-117 — Central de Materiais (link externo). Gate pela matriz de Perfil
  // de Acesso (corretor liberado por padrão). URL em organizations.settings.materiais_url;
  // sem URL, o item não aparece no app do corretor (a config é feita no dashboard).
  const permissions = await getUserPermissions(user.id, user.orgId)
  if (permissions["materiais"]) {
    const { data: org } = await supabase
      .from("organizations")
      .select("settings")
      .eq("id", user.orgId)
      .single()
    const materiaisUrl = ((org?.settings as Record<string, string> | null)?.materiais_url ?? "").trim()
    if (materiaisUrl) {
      const materiaisItem: NavItem = {
        href: materiaisUrl,
        label: "Central de Materiais",
        icon: <BookOpen className={ICON_SIZE} />,
        external: true,
      }
      const fluxoIdx = navItems.findIndex(
        (item) => item.href === "https://corretor-trifold.streamlit.app"
      )
      if (fluxoIdx >= 0) navItems.splice(fluxoIdx + 1, 0, materiaisItem)
      else navItems.push(materiaisItem)
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      {/* Story 63-19 — anúncio de não-lidas para leitores de tela (badge visual é aria-hidden). */}
      <span aria-live="polite" className="sr-only">
        {chatUnread > 0
          ? `${chatUnread} conversa${chatUnread === 1 ? "" : "s"} não lida${chatUnread === 1 ? "" : "s"}`
          : ""}
      </span>
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
