import { getServerUser } from "@web/lib/auth"
import Link from "next/link"

const ALL_CARDS = [
  {
    href: "/dashboard/configuracoes/personalidade",
    icon: "◬",
    title: "Personalidade",
    description: "Prompts e comportamento da IA",
    roles: ["admin", "supervisor"],
  },
  {
    href: "/dashboard/configuracoes/nicole/treinamento",
    icon: "◎",
    title: "Treinamento",
    description: "Base de conhecimento sobre empreendimentos",
    roles: ["admin", "supervisor", "gerente-comercial"],
  },
]

export default async function NicolePage() {
  const user = await getServerUser()
  const NICOLE_CARDS = ALL_CARDS.filter(c => c.roles.includes(user.role))

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/configuracoes"
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-stone-400 dark:hover:text-stone-200"
        >
          &larr; Configurações
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-stone-100">Nicole</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-stone-400">
          Configurações da IA Nicole
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {NICOLE_CARDS.map((card) => (
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
