import { getServerUser } from "@web/lib/auth"
import { createClient } from "@web/lib/supabase/server"
import { SidebarNav } from "@web/components/layout/sidebar-nav"
import {
  LayoutDashboard,
  Kanban,
  Users,
  Building2,
  UserCheck,
  MessageSquare,
  CalendarDays,
  Bell,
  Activity,
  BarChart3,
  Megaphone,
  Mail,
  GraduationCap,
  Settings,
  Shield,
  HardHat,
  Inbox,
} from "lucide-react"

const ICON_SIZE = "h-[18px] w-[18px]"

const NAV_ITEMS_BASE = [
  { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className={ICON_SIZE} /> },
  { href: "/dashboard/pipeline", label: "Pipeline", icon: <Kanban className={ICON_SIZE} /> },
  { href: "/dashboard/leads", label: "Leads", icon: <Users className={ICON_SIZE} /> },
  { href: "/dashboard/properties", label: "Imóveis", icon: <Building2 className={ICON_SIZE} /> },
  { href: "/dashboard/corretores", label: "Corretores", icon: <UserCheck className={ICON_SIZE} /> },
  { href: "/dashboard/conversas", label: "Conversas", icon: <MessageSquare className={ICON_SIZE} /> },
  { href: "/dashboard/agenda", label: "Agenda", icon: <CalendarDays className={ICON_SIZE} /> },
  { href: "/dashboard/alertas", label: "Alertas", icon: <Bell className={ICON_SIZE} /> },
  { href: "/dashboard/atividades", label: "Atividades", icon: <Activity className={ICON_SIZE} /> },
  { href: "/dashboard/analytics", label: "Analytics", icon: <BarChart3 className={ICON_SIZE} /> },
  { href: "/dashboard/campaigns", label: "Campanhas", icon: <Megaphone className={ICON_SIZE} /> },
  { href: "/dashboard/treinamento", label: "Treinamento", icon: <GraduationCap className={ICON_SIZE} /> },
  { href: "/dashboard/configuracoes", label: "Config", icon: <Settings className={ICON_SIZE} /> },
]

const NAV_ITEM_OBRAS = { href: "/dashboard/obras", label: "Obras", icon: <HardHat className={ICON_SIZE} /> }
const NAV_ITEM_MENSAGENS = { href: "/dashboard/mensagens", label: "Mensagens", icon: <Inbox className={ICON_SIZE} /> }
const NAV_ITEM_EMAIL = { href: "/dashboard/sistema/email", label: "Email", icon: <Mail className={ICON_SIZE} /> }
const NAV_ITEM_SISTEMA = { href: "/dashboard/sistema", label: "Sistema", icon: <Shield className={ICON_SIZE} /> }

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getServerUser()
  const supabase = await createClient()

  const isObras = user.role === "obras"
  const isAdminOrSupervisor = user.role === "admin" || user.role === "supervisor"

  // Count pending alerts and unread messages — skip for obras role (not needed)
  const [{ count: alertCount }, { count: mensagensCount }] = isObras
    ? [{ count: 0 }, { count: 0 }]
    : await Promise.all([
        supabase
          .from("follow_up_log")
          .select("id", { count: "exact", head: true })
          .eq("org_id", user.orgId)
          .eq("status", "pending"),
        supabase
          .from("obra_mensagens")
          .select("id", { count: "exact", head: true })
          .eq("org_id", user.orgId)
          .eq("sender_type", "cliente")
          .is("read_at", null),
      ])

  // obras role: only the Obras item, no other nav
  // admin/supervisor: full nav + Obras + Mensagens
  // Sistema: admin only
  const navItems = isObras
    ? [NAV_ITEM_OBRAS]
    : [
        ...NAV_ITEMS_BASE,
        ...(isAdminOrSupervisor ? [NAV_ITEM_OBRAS] : []),
        ...(isAdminOrSupervisor
          ? [{ ...NAV_ITEM_MENSAGENS, badge: mensagensCount ?? 0 }]
          : []),
        ...(user.role === "admin" ? [NAV_ITEM_EMAIL, NAV_ITEM_SISTEMA] : []),
      ]

  return (
    <div className="min-h-screen bg-stone-50">
      <SidebarNav
        items={navItems}
        userName={user.name}
        userRole={user.role}
        basePath="/dashboard"
        alertCount={alertCount ?? 0}
      />

      {/* Main content area */}
      <main className="lg:pl-56">
        <div className="mx-auto max-w-6xl px-4 py-6 pb-24 lg:px-8 lg:py-8 lg:pb-8">
          {children}
        </div>
      </main>
    </div>
  )
}
