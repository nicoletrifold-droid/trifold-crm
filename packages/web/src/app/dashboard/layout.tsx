import { getServerUser } from "@web/lib/auth"
import { createClient } from "@web/lib/supabase/server"
import { getUserPermissions } from "@web/lib/permissions"
import { SidebarNav } from "@web/components/layout/sidebar-nav"
import { WeatherWidget } from "@web/components/weather-widget"
import {
  LayoutDashboard,
  Kanban,
  Users,
  Building2,
  MessageSquare,
  CalendarDays,
  Bell,
  Activity,
  BarChart3,
  Megaphone,
  Mail,
  Settings,
  Shield,
  HardHat,
  Inbox,
  Gift,
  MessageSquarePlus,
  Shuffle,
  CreditCard,
} from "lucide-react"

const ICON_SIZE = "h-[18px] w-[18px]"

const NAV_ITEMS_BASE = [
  // CRM Core
  { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className={ICON_SIZE} /> },
  { href: "/dashboard/pipeline", label: "Pipeline", icon: <Kanban className={ICON_SIZE} /> },
  { href: "/dashboard/leads", label: "Leads", icon: <Users className={ICON_SIZE} /> },
  { href: "/dashboard/properties", label: "Imóveis", icon: <Building2 className={ICON_SIZE} /> },
  { href: "/dashboard/roleta", label: "Roleta", icon: <Shuffle className={ICON_SIZE} /> },
  // Comunicação
  { href: "/dashboard/conversas", label: "Conversas", icon: <MessageSquare className={ICON_SIZE} />, separator: true },
  { href: "/dashboard/agenda", label: "Agenda", icon: <CalendarDays className={ICON_SIZE} /> },
  { href: "/dashboard/alertas", label: "Alertas", icon: <Bell className={ICON_SIZE} /> },
  { href: "/dashboard/analytics", label: "Analytics", icon: <BarChart3 className={ICON_SIZE} /> },
  // Análise & Crescimento
  { href: "/dashboard/atividades", label: "Atividades", icon: <Activity className={ICON_SIZE} />, separator: true },
  { href: "/dashboard/campaigns", label: "Campanhas", icon: <Megaphone className={ICON_SIZE} /> },
]

const NAV_ITEM_OBRAS = { href: "/dashboard/obras", label: "Obras", icon: <HardHat className={ICON_SIZE} /> }
const NAV_ITEM_BRINDES = { href: "/dashboard/brindes", label: "Brindes", icon: <Gift className={ICON_SIZE} /> }
const NAV_ITEM_MENSAGENS = { href: "/dashboard/mensagens", label: "Mensagens", icon: <Inbox className={ICON_SIZE} /> }
const NAV_ITEM_EMAIL = { href: "/dashboard/sistema/email", label: "Email", icon: <Mail className={ICON_SIZE} /> }
const NAV_ITEM_SISTEMA = { href: "/dashboard/sistema", label: "Sistema", icon: <Shield className={ICON_SIZE} /> }
const NAV_ITEM_CONFIG = { href: "/dashboard/configuracoes", label: "Config", icon: <Settings className={ICON_SIZE} /> }
const NAV_ITEM_CHAMADOS = { href: "/dashboard/chamados", label: "Suporte", icon: <MessageSquarePlus className={ICON_SIZE} /> }

/**
 * Mapeamento href → moduleKey para resolver permissões via `getUserPermissions`.
 * Reflete os 17 módulos canônicos do seed (migration 047) — Story 35-5 AC2.
 */
const NAV_MODULE_MAP: Record<string, string> = {
  "/dashboard": "dashboard",
  "/dashboard/pipeline": "pipeline",
  "/dashboard/leads": "leads",
  "/dashboard/properties": "imoveis",
  "/dashboard/roleta": "roleta",
  "/dashboard/conversas": "conversas",
  "/dashboard/agenda": "agenda",
  "/dashboard/alertas": "alertas",
  "/dashboard/atividades": "atividades",
  "/dashboard/analytics": "analytics",
  "/dashboard/campaigns": "campanhas",
  "/dashboard/obras": "obras",
  "/dashboard/brindes": "brindes",
  "/dashboard/mensagens": "mensagens",
  "/dashboard/sistema/email": "sistema",
  "/dashboard/sistema": "sistema",
  "/dashboard/configuracoes": "configuracoes",
  "/dashboard/chamados": "chamados",
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getServerUser()
  const supabase = await createClient()

  // Story 35-5: lê permissões do banco em vez de regras hardcoded por role.
  const permissions = await getUserPermissions(user.id, user.orgId)

  // Contagens de alertas, mensagens e aprovações pendentes de obras — só consulta
  // o banco se os módulos correspondentes estiverem acessíveis.
  const isAdminOrSupervisorObras =
    permissions["obras"] && (user.role === "admin" || user.role === "supervisor")

  const [{ count: alertCount }, { count: mensagensCount }, { count: aprovacoesPendentesCount }] =
    permissions["alertas"] || permissions["mensagens"] || isAdminOrSupervisorObras
      ? await Promise.all([
          permissions["alertas"]
            ? supabase
                .from("follow_up_log")
                .select("id", { count: "exact", head: true })
                .eq("org_id", user.orgId)
                .eq("status", "pending")
            : Promise.resolve({ count: 0 }),
          permissions["mensagens"]
            ? supabase
                .from("obra_mensagens")
                .select("id", { count: "exact", head: true })
                .eq("org_id", user.orgId)
                .eq("sender_type", "cliente")
                .is("read_at", null)
            : Promise.resolve({ count: 0 }),
          isAdminOrSupervisorObras
            ? supabase
                .from("obra_upload_aprovacoes")
                .select("id", { count: "exact", head: true })
                .eq("org_id", user.orgId)
                .eq("status", "pendente")
            : Promise.resolve({ count: 0 }),
        ])
      : [{ count: 0 }, { count: 0 }, { count: 0 }]

  // Sidebar dinâmico: cada item é incluído se a permissão do módulo for true.
  const baseFiltered = NAV_ITEMS_BASE.filter((item) => permissions[NAV_MODULE_MAP[item.href]!])

  const showFluxo = user.role === "admin" || user.role === "gerente-comercial"
  const fluxoItem = { href: "https://corretor-trifold.streamlit.app", label: "Fluxo de Pagamento", icon: <CreditCard className={ICON_SIZE} />, external: true }
  const roletaIdx = baseFiltered.findIndex((item) => item.href === "/dashboard/roleta")
  const baseWithFluxo = showFluxo && roletaIdx >= 0
    ? [...baseFiltered.slice(0, roletaIdx + 1), fluxoItem, ...baseFiltered.slice(roletaIdx + 1)]
    : showFluxo
    ? [...baseFiltered, fluxoItem]
    : baseFiltered

  const navItems = [
    ...baseWithFluxo,
    ...(permissions["obras"]
      ? [{ ...NAV_ITEM_OBRAS, badge: aprovacoesPendentesCount ?? 0 }]
      : []),
    ...(permissions["brindes"] ? [NAV_ITEM_BRINDES] : []),
    ...(permissions["mensagens"]
      ? [{ ...NAV_ITEM_MENSAGENS, badge: mensagensCount ?? 0 }]
      : []),
    // Grupo inferior: Chamados → Config → Email → Sistema
    // O separator é colocado no primeiro item visível do grupo (linha divisória após Mensagens)
    ...(() => {
      const bottomGroup = [
        ...(permissions["chamados"] ? [NAV_ITEM_CHAMADOS] : []),
        ...(permissions["configuracoes"] ? [NAV_ITEM_CONFIG] : []),
        ...(permissions["sistema"] ? [NAV_ITEM_EMAIL, NAV_ITEM_SISTEMA] : []),
      ]
      return bottomGroup.map((item, idx) =>
        idx === 0 ? { ...item, separator: true } : item
      )
    })(),
  ]

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <WeatherWidget variant="system" className="fixed top-4 right-4 z-40" />
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
