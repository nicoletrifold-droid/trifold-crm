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
import { getBrokerNavCounts } from "@web/lib/broker/nav-counts"

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

  // Badges: Agenda (compromissos), Chat (não-lidas, verde — Story 63-19),
  // Meus Leads (novos distribuídos — Story 75-8), Bolsão (pool — Story 75-83).
  // Story 75-287: réguas extraídas p/ lib/broker/nav-counts (compartilhada com
  // a rota do badge vivo — este valor server-side é só a carga inicial).
  const counts = await getBrokerNavCounts(supabase, user.orgId, user.id)
  const chatUnread = counts.chat

  const navItems: NavItem[] = NAV_ITEMS.map((item) => {
    if (item.href === "/broker/agenda") return { ...item, badge: counts.agenda }
    if (item.href === "/broker/chat")
      return { ...item, badge: chatUnread, badgeTone: "green" as const }
    if (item.href === "/broker/leads") return { ...item, badge: counts.leads }
    if (item.href === "/broker/bolsao") return { ...item, badge: counts.bolsao }
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
      <WeatherWidget variant="dark" className="fixed top-4 right-4 z-40 max-lg:hidden lg:flex" />
      <SidebarNav
        items={navItems}
        userName={user.name}
        userRole={user.role}
        basePath="/broker"
        liveBadges={[
          { href: "/broker/agenda", endpoint: "/api/broker/nav-counts" },
          { href: "/broker/chat", endpoint: "/api/broker/nav-counts" },
          { href: "/broker/leads", endpoint: "/api/broker/nav-counts" },
          { href: "/broker/bolsao", endpoint: "/api/broker/nav-counts" },
        ]}
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
