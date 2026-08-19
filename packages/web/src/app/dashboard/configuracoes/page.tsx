import { getServerUser } from "@web/lib/auth"
import { can } from "@web/lib/permissions"
import { createClient } from "@web/lib/supabase/server"
import Link from "next/link"
import { NotificationToggle } from "@web/components/notification-toggle"
import { AprovacaoEmailToggle } from "./_components/aprovacao-email-toggle"

const CONFIG_CARDS = [
  {
    href: "/dashboard/configuracoes/empresa",
    icon: "◈",
    title: "Empresa",
    description: "Dados da organização",
  },
  {
    href: "/dashboard/configuracoes/usuarios",
    icon: "◎",
    title: "Usuários",
    description: "Gerenciar usuários e permissões",
  },
  {
    href: "/dashboard/configuracoes/corretores",
    icon: "◈",
    title: "Corretores",
    description: "Cadastro e gestão de corretores",
  },
  {
    href: "/dashboard/configuracoes/clientes",
    icon: "◉",
    title: "Clientes",
    description: "Cadastro de clientes e vínculos com obras",
  },
  {
    href: "/dashboard/configuracoes/horario",
    icon: "▣",
    title: "Horário Comercial",
    description: "Horários de atendimento",
  },
  {
    href: "/dashboard/configuracoes/integracoes",
    icon: "⟁",
    title: "Integrações",
    description: "Meta Ads, WhatsApp, Telegram",
  },
  {
    href: "/dashboard/configuracoes/nicole",
    icon: "◬",
    title: "Nicole",
    description: "Personalidade e treinamento da IA",
  },
  {
    href: "/dashboard/configuracoes/pipeline",
    icon: "▦",
    title: "Etapas do Pipeline",
    description: "Configurar etapas do funil de vendas",
  },
  {
    href: "/dashboard/pipeline/config",
    icon: "△",
    title: "Follow-up",
    description: "Regras de follow-up por etapa",
  },
  {
    href: "/dashboard/configuracoes/perfil-acesso",
    icon: "◫",
    title: "Perfil de Acesso",
    description: "Permissões por perfil de usuário",
  },
  {
    href: "/dashboard/configuracoes/relatorio-diario",
    icon: "✉",
    title: "Relatório Diário",
    description: "Quem recebe o resumo de leads das 7h59 no WhatsApp",
  },
  {
    href: "/dashboard/configuracoes/materiais",
    icon: "◲",
    title: "Central de Materiais",
    description: "Link dos materiais de marketing para os corretores",
  },
]

// Cards visíveis para gerente-comercial
const GERENTE_ALLOWED: string[] = [
  "/dashboard/configuracoes/corretores",
  "/dashboard/configuracoes/nicole",
  "/dashboard/pipeline/config",
]

export default async function ConfiguracoesPage() {
  const user = await getServerUser()
  const isGerenteComercial = user.role === "gerente-comercial"
  const visibleCards = isGerenteComercial
    ? CONFIG_CARDS.filter((c) => GERENTE_ALLOWED.includes(c.href))
    : CONFIG_CARDS

  // Story 75-210: preferência de e-mail de aprovação — só quem recebe (admin/supervisor).
  // 75-308: elegibilidade ao e-mail de aprovação é a capability própria.
  const isAprovador = await can(user.id, user.orgId, "obras.receber_email_aprovacao")
  let aprovacaoEmailEnabled = true
  if (isAprovador) {
    const supabase = await createClient()
    const { data } = await supabase
      .from("users")
      .select("notif_obra_aprovacao_email")
      .eq("id", user.id)
      .single()
    aprovacaoEmailEnabled = data?.notif_obra_aprovacao_email ?? true
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Configurações</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-stone-400">
          Gerencie as configurações do sistema
        </p>
      </div>

      {/* Notificações push do usuário logado (Story 75-35) */}
      <NotificationToggle />

      {/* E-mails de aprovação de obras — preferência do aprovador (Story 75-210) */}
      {isAprovador && <AprovacaoEmailToggle initialEnabled={aprovacaoEmailEnabled} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleCards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-orange-300 hover:shadow-md dark:border-stone-800 dark:bg-stone-900 dark:hover:border-orange-500/40"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-lg text-orange-600 dark:bg-orange-500/15 dark:text-orange-300">
                {card.icon}
              </span>
              <div>
                <h2 className="text-sm font-semibold text-gray-900 group-hover:text-orange-700 dark:text-stone-100 dark:group-hover:text-orange-300">
                  {card.title}
                </h2>
                <p className="text-xs text-gray-500 dark:text-stone-400">{card.description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
