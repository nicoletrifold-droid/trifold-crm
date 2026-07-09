import { getServerUser } from "@web/lib/auth"
import { createClient } from "@web/lib/supabase/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { getUserPermissions } from "@web/lib/permissions"
import { redirect } from "next/navigation"
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
  Container,
  Handshake,
  FolderClosed,
  Rocket,
  BookOpen,
  Eye,
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
const NAV_ITEM_LANCAMENTOS = { href: "/dashboard/lancamentos", label: "Lançamentos", icon: <Rocket className={ICON_SIZE} /> }
const NAV_ITEM_BRINDES = { href: "/dashboard/brindes", label: "Brindes", icon: <Gift className={ICON_SIZE} /> }
const NAV_ITEM_MENSAGENS = { href: "/dashboard/mensagens", label: "Mensagens", icon: <Inbox className={ICON_SIZE} /> }
const NAV_ITEM_CHAT = { href: "/dashboard/chat", label: "Chat", icon: <MessageSquare className={ICON_SIZE} /> }
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
  "/dashboard/lancamentos": "lancamentos",
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

  if (user.role === "broker") {
    redirect("/broker")
  }

  const supabase = await createClient()

  // Story 35-5: lê permissões do banco em vez de regras hardcoded por role.
  const permissions = await getUserPermissions(user.id, user.orgId)

  // Contagens de alertas, mensagens e aprovações pendentes de obras — só consulta
  // o banco se os módulos correspondentes estiverem acessíveis.
  const isAdminOrSupervisorObras =
    permissions["obras"] && (user.role === "admin" || user.role === "supervisor")

  // Busca alertas_notifications_seen_at para filtrar badge — atualizado
  // via server action quando o usuário abre a página de Alertas
  const alertasSeenAt = permissions["alertas"]
    ? await supabase
        .from("users")
        .select("alertas_notifications_seen_at")
        .eq("id", user.id)
        .single()
        .then(({ data }) => (data as { alertas_notifications_seen_at: string | null } | null)?.alertas_notifications_seen_at ?? null)
    : null

  const [{ count: alertCount }, { count: mensagensCount }, { count: aprovacoesPendentesCount }, { count: chamadosPendentesCount }] =
    permissions["alertas"] || permissions["mensagens"] || isAdminOrSupervisorObras || permissions["chamados"]
      ? await Promise.all([
          permissions["alertas"]
            ? (() => {
                let q = supabase
                  .from("follow_up_log")
                  .select("id", { count: "exact", head: true })
                  .eq("org_id", user.orgId)
                  .eq("status", "pending")
                // Só conta alertas MAIS NOVOS que a última visita ao módulo
                if (alertasSeenAt) q = q.gt("created_at", alertasSeenAt)
                return q
              })()
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
          // Badge Suporte:
          // - admin/supervisor: tickets não resolvidos
          // - outros: respostas do admin ainda não lidas pelo reporter
          permissions["chamados"]
            ? (user.role === "admin" || user.role === "supervisor")
              ? supabase
                  .from("chamados")
                  .select("id", { count: "exact", head: true })
                  .eq("org_id", user.orgId)
                  .neq("status", "resolvido")
              : supabase
                  .from("chamados")
                  .select("id", { count: "exact", head: true })
                  .eq("org_id", user.orgId)
                  .eq("reporter_id", user.id)
                  .not("admin_response", "is", null)
                  .is("reporter_seen_response_at", null)
            : Promise.resolve({ count: 0 }),
        ])
      : [{ count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }]

  // Compromissos futuros e ativos da org — alimenta o badge do menu "Agenda".
  // Escopo org-wide (todos os corretores), coerente com a página /dashboard/agenda.
  const agendaCount = permissions["agenda"]
    ? (
        await supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("org_id", user.orgId)
          .in("status", ["scheduled", "confirmed"])
          .gte("scheduled_at", new Date().toISOString())
      ).count ?? 0
    : 0

  // Story 75-86 — badge do menu "Chat": nº de conversas de relacionamento com
  // mensagens não-lidas (role='user' após broker_last_read_at). Admin client porque
  // a RLS de conversations não libera a gerente-relacionamento.
  let chatUnread = 0
  if (permissions["chat"]) {
    const admin = createAdminClient()
    const { data: rConvs } = await admin
      .from("conversations")
      .select("id, broker_last_read_at")
      .eq("org_id", user.orgId)
      .eq("is_relationship", true)
      .limit(300)
    const rIds = (rConvs ?? []).map((c) => c.id as string)
    if (rIds.length > 0) {
      const readAt = new Map((rConvs ?? []).map((c) => [c.id as string, c.broker_last_read_at as string | null]))
      const { data: msgs } = await admin
        .from("messages")
        .select("conversation_id, created_at")
        .in("conversation_id", rIds)
        .eq("role", "user")
      const unreadConvs = new Set<string>()
      for (const m of (msgs ?? []) as Array<{ conversation_id: string; created_at: string }>) {
        const r = readAt.get(m.conversation_id)
        if (!r || new Date(m.created_at) > new Date(r)) unreadConvs.add(m.conversation_id)
      }
      chatUnread = unreadConvs.size
    }
  }

  // Sidebar dinâmico: cada item é incluído se a permissão do módulo for true.
  const baseFiltered = NAV_ITEMS_BASE.filter((item) => {
    if (!permissions[NAV_MODULE_MAP[item.href]!]) return false
    return true
  }).map((item) =>
    item.href === "/dashboard/agenda" ? { ...item, badge: agendaCount } : item
  )

  // Itens inseridos logo ABAIXO da Roleta, só para admin/gerente-comercial:
  // Bolsão (Story 75-73) e Fluxo de Pagamento. Gate hardcoded (não passa pelo
  // sistema de permissões de módulo enquanto a função do Bolsão é definida).
  // Story 75-93: visibilidade pela matriz de Perfil de Acesso (não mais por nome de role fixo).
  const showBolsao = Boolean(permissions["bolsao"])
  const showFluxo = Boolean(permissions["fluxo"])
  // Story 75-83: contador de leads no bolsão (pool = bolsao_em not null).
  const bolsaoCount = showBolsao
    ? (
        await supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("org_id", user.orgId)
          .eq("is_active", true)
          .not("bolsao_em", "is", null)
          .is("assigned_broker_id", null) // Story 75-89: contar só o pool real (sem dono)
      ).count ?? 0
    : 0
  const bolsaoItem = { href: "/dashboard/bolsao", label: "Bolsão", icon: <Container className={ICON_SIZE} />, badge: bolsaoCount }
  const fluxoItem = { href: "https://corretor-trifold.streamlit.app", label: "Fluxo de Pagamento", icon: <CreditCard className={ICON_SIZE} />, external: true }
  // Story 75-87 — módulo IMOB (imobiliárias externas que ajudam na venda dos
  // empreendimentos). Só admin/supervisor. Gate hardcoded por ora (placeholder);
  // migrar p/ permissões de módulo quando a função for definida (como o Bolsão).
  const showImob = Boolean(permissions["imob"]) // Story 75-93: via matriz de Perfil de Acesso
  const imobItem = { href: "/dashboard/imob", label: "IMOB", icon: <Handshake className={ICON_SIZE} /> }
  // Story 75-104 — módulo Pastas (upload de documentos por link). Gate via matriz.
  const showPastas = Boolean(permissions["pastas"])
  const pastasItem = { href: "/dashboard/pastas", label: "Pastas", icon: <FolderClosed className={ICON_SIZE} /> }
  // Story 75-117 — módulo Central de Materiais (link externo p/ materiais de marketing).
  // Gate via matriz. URL configurável em organizations.settings.materiais_url; se vazia,
  // aponta p/ página interna de aviso (nunca link quebrado).
  const showMateriais = Boolean(permissions["materiais"])
  const materiaisUrl = showMateriais
    ? await supabase
        .from("organizations")
        .select("settings")
        .eq("id", user.orgId)
        .single()
        .then(({ data }) =>
          ((data?.settings as Record<string, string> | null)?.materiais_url ?? "").trim()
        )
    : ""
  const materiaisItem = materiaisUrl
    ? { href: materiaisUrl, label: "Central de Materiais", icon: <BookOpen className={ICON_SIZE} />, external: true }
    : { href: "/dashboard/materiais", label: "Central de Materiais", icon: <BookOpen className={ICON_SIZE} /> }
  const afterRoleta = [
    ...(showBolsao ? [bolsaoItem] : []),
    ...(showFluxo ? [fluxoItem] : []),
    ...(showMateriais ? [materiaisItem] : []),
    ...(showImob ? [imobItem] : []),
    ...(showPastas ? [pastasItem] : []),
  ]
  const roletaIdx = baseFiltered.findIndex((item) => item.href === "/dashboard/roleta")
  const baseWithExtras = afterRoleta.length === 0
    ? baseFiltered
    : roletaIdx >= 0
    ? [...baseFiltered.slice(0, roletaIdx + 1), ...afterRoleta, ...baseFiltered.slice(roletaIdx + 1)]
    : [...baseFiltered, ...afterRoleta]

  // Story 78-1 — Portal Cliente (Visão Mestre): "ver como cliente", somente leitura.
  // Gate hardcoded por role (admin/supervisor); migrar p/ matriz de Perfil de Acesso depois.
  const showPortalViewer = user.role === "admin" || user.role === "supervisor"
  const portalViewerItem = {
    href: "/dashboard/portal-cliente",
    label: "Portal Cliente",
    icon: <Eye className={ICON_SIZE} />,
  }

  const navItems = [
    ...baseWithExtras,
    ...(permissions["obras"]
      ? [{ ...NAV_ITEM_OBRAS, badge: aprovacoesPendentesCount ?? 0 }]
      : []),
    ...(showPortalViewer ? [portalViewerItem] : []),
    // Épico Lançamentos — item logo abaixo de Obras, gated pela matriz de Perfil de Acesso.
    ...(permissions["lancamentos"] ? [NAV_ITEM_LANCAMENTOS] : []),
    ...(permissions["brindes"] ? [NAV_ITEM_BRINDES] : []),
    ...(permissions["mensagens"]
      ? [{ ...NAV_ITEM_MENSAGENS, badge: mensagensCount ?? 0 }]
      : []),
    ...(permissions["chat"] ? [{ ...NAV_ITEM_CHAT, badge: chatUnread }] : []),
    // Grupo inferior: Chamados → Config → Email → Sistema
    // O separator é colocado no primeiro item visível do grupo (linha divisória após Mensagens)
    ...(() => {
      const bottomGroup = [
        ...(permissions["chamados"] ? [{ ...NAV_ITEM_CHAMADOS, badge: chamadosPendentesCount ?? 0 }] : []),
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
