import { getServerUser } from "@web/lib/auth"
import Link from "next/link"

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
    href: "/dashboard/configuracoes/personalidade",
    icon: "◬",
    title: "Personalidade Nicole",
    description: "Prompts e comportamento",
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
]

export default async function ConfiguracoesPage() {
  await getServerUser()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Configurações</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-stone-400">
          Gerencie as configurações do sistema
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CONFIG_CARDS.map((card) => (
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
