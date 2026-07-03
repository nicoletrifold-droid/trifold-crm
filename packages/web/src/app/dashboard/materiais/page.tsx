import { getServerUser } from "@web/lib/auth"
import { createClient } from "@web/lib/supabase/server"
import { canAccess } from "@web/lib/permissions"
import { redirect } from "next/navigation"
import Link from "next/link"
import { BookOpen } from "lucide-react"

// Story 75-117 — Central de Materiais.
// Quando a org tem `settings.materiais_url` configurada, o item do menu abre o
// link externo direto e ninguém cai aqui. Esta página é o fallback exibido
// enquanto o gestor não configurou a URL — evita link quebrado/vazio.
export default async function MateriaisPage() {
  const user = await getServerUser()

  if (!(await canAccess(user.id, user.orgId, "materiais"))) {
    redirect("/dashboard")
  }

  const supabase = await createClient()
  const { data: org } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", user.orgId)
    .single()

  const url = ((org?.settings as Record<string, string> | null)?.materiais_url ?? "").trim()

  // Se já houver URL configurada, manda direto pro link externo.
  if (url) {
    redirect(url)
  }

  const canConfigure = await canAccess(user.id, user.orgId, "configuracoes.empresa")

  return (
    <div className="mx-auto max-w-lg py-12">
      <div className="rounded-lg bg-white p-8 text-center shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-orange-600 dark:bg-stone-800 dark:text-orange-400">
          <BookOpen className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-xl font-bold text-gray-900 dark:text-stone-100">
          Central de Materiais
        </h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-stone-400">
          O link com os materiais de marketing ainda não foi configurado.
          {canConfigure
            ? " Configure a URL para liberar o acesso à equipe."
            : " Peça ao gestor para configurar o link."}
        </p>
        {canConfigure && (
          <Link
            href="/dashboard/configuracoes/materiais"
            className="mt-6 inline-block rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
          >
            Configurar link
          </Link>
        )}
      </div>
    </div>
  )
}
