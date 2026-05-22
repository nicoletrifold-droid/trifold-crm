import { getServerUser } from "@web/lib/auth"
import { redirect } from "next/navigation"

/**
 * Layout server-side guard para `/dashboard/sistema/logs`.
 *
 * Defesa em profundidade: além das rotas API rejeitarem com 403 para
 * roles != "admin", o layout redireciona usuários não-admin antes mesmo
 * de renderizar o Client Component da página de logs.
 */
export default async function LogsLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser()

  if (user.role !== "admin") {
    redirect("/dashboard")
  }

  return <>{children}</>
}
