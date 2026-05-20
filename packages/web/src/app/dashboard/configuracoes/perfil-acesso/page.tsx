import { getServerUser } from "@web/lib/auth"
import Link from "next/link"
import { redirect } from "next/navigation"

type AccessLevel = true | false | string

interface RoleProfile {
  role: string
  label: string
  badge: string
  modules: Record<string, AccessLevel>
}

const MODULES = [
  "Dashboard",
  "Pipeline",
  "Leads",
  "Imóveis",
  "Corretores",
  "Conversas",
  "Agenda",
  "Alertas",
  "Atividades",
  "Analytics",
  "Campanhas",
  "Treinamento",
  "Obras",
  "Brindes",
  "Mensagens",
  "Configurações",
  "Sistema",
]

const ROLE_PROFILES: RoleProfile[] = [
  {
    role: "admin",
    label: "Admin",
    badge: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
    modules: {
      Dashboard: true,
      Pipeline: true,
      Leads: true,
      Imóveis: true,
      Corretores: true,
      Conversas: true,
      Agenda: true,
      Alertas: true,
      Atividades: true,
      Analytics: true,
      Campanhas: true,
      Treinamento: true,
      Obras: true,
      Brindes: true,
      Mensagens: true,
      Configurações: true,
      Sistema: true,
    },
  },
  {
    role: "supervisor",
    label: "Supervisor",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
    modules: {
      Dashboard: true,
      Pipeline: true,
      Leads: true,
      Imóveis: true,
      Corretores: true,
      Conversas: true,
      Agenda: true,
      Alertas: true,
      Atividades: true,
      Analytics: true,
      Campanhas: true,
      Treinamento: true,
      Obras: true,
      Brindes: true,
      Mensagens: true,
      Configurações: false,
      Sistema: false,
    },
  },
  {
    role: "broker",
    label: "Corretor",
    badge: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
    modules: {
      Dashboard: false,
      Pipeline: "Próprio",
      Leads: "Próprios",
      Imóveis: true,
      Corretores: false,
      Conversas: true,
      Agenda: true,
      Alertas: true,
      Atividades: true,
      Analytics: false,
      Campanhas: false,
      Treinamento: true,
      Obras: false,
      Brindes: false,
      Mensagens: false,
      Configurações: false,
      Sistema: false,
    },
  },
  {
    role: "obras",
    label: "Obras",
    badge: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300",
    modules: {
      Dashboard: false,
      Pipeline: false,
      Leads: false,
      Imóveis: false,
      Corretores: false,
      Conversas: false,
      Agenda: false,
      Alertas: false,
      Atividades: false,
      Analytics: false,
      Campanhas: false,
      Treinamento: false,
      Obras: true,
      Brindes: true,
      Mensagens: false,
      Configurações: false,
      Sistema: false,
    },
  },
]

export default async function PerfilAcessoPage() {
  const user = await getServerUser()

  if (user.role !== "admin") {
    redirect("/dashboard")
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/configuracoes"
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-stone-400 dark:hover:text-stone-200"
        >
          &larr; Configurações
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-stone-100">Perfil de Acesso</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-stone-400">
          Módulos disponíveis por perfil de usuário
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {ROLE_PROFILES.map((profile) => (
          <div
            key={profile.role}
            className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900"
          >
            <div className="mb-4 flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-900 dark:text-stone-100">
                {profile.label}
              </h2>
              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${profile.badge}`}>
                {profile.role}
              </span>
            </div>

            <ul className="space-y-1">
              {MODULES.map((module) => {
                const access = profile.modules[module]
                const hasAccess = access !== false

                return (
                  <li key={module} className="flex items-center gap-2 text-sm">
                    {hasAccess ? (
                      <span className="text-green-600 dark:text-green-400">✓</span>
                    ) : (
                      <span className="text-gray-300 dark:text-stone-600">—</span>
                    )}
                    <span
                      className={
                        hasAccess
                          ? "text-gray-700 dark:text-stone-200"
                          : "text-gray-300 dark:text-stone-600"
                      }
                    >
                      {module}
                      {typeof access === "string" && (
                        <span className="ml-1 text-xs text-gray-400 dark:text-stone-500">
                          ({access})
                        </span>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>

      <p className="text-sm text-gray-400 dark:text-stone-500">
        Perfis de acesso são fixos no sistema. Para alterar o perfil de um usuário, acesse{" "}
        <Link
          href="/dashboard/configuracoes/usuarios"
          className="underline hover:text-gray-600 dark:hover:text-stone-300"
        >
          Usuários
        </Link>
        .
      </p>
    </div>
  )
}
