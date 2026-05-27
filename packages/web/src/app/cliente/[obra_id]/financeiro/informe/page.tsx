import Link from "next/link"
import { redirect } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { createClient } from "@web/lib/supabase/server"

interface PageProps {
  params: Promise<{ obra_id: string }>
}

export default async function InformePage({ params }: PageProps) {
  const { obra_id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: portalUser } = await supabase
    .from("users")
    .select("id")
    .eq("auth_id", user.id)
    .single()

  if (!portalUser) redirect("/login")

  const { data: acesso } = await supabase
    .from("cliente_obras")
    .select("obra_id")
    .eq("obra_id", obra_id)
    .eq("user_id", portalUser.id)
    .single()

  const { data: obra } = await supabase
    .from("obras")
    .select("id, name")
    .eq("id", obra_id)
    .single()

  if (!obra || !acesso) redirect("/cliente/sem-obra")

  return (
    <div className="min-h-screen bg-stone-950">
      {/* Mobile header */}
      <header className="sticky top-0 z-10 border-b border-stone-800 bg-stone-950/90 backdrop-blur-sm lg:hidden">
        <div className="mx-auto max-w-2xl px-4 py-4">
          <p className="text-xs text-stone-500">Financeiro · Informe de Rendimentos</p>
          <p className="text-sm font-semibold text-white">{obra.name}</p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 lg:py-8">
        <Link
          href={`/cliente/${obra_id}/financeiro`}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-stone-400 transition-colors hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar
        </Link>

        <h1 className="mb-6 text-xl font-bold text-white lg:text-2xl">
          Informe de Rendimentos
        </h1>

        <div className="rounded-xl border border-stone-800 bg-stone-900 px-6 py-16 text-center">
          <p className="text-lg font-bold text-white">Em breve</p>
          <p className="mt-2 text-sm text-stone-500">
            Esta funcionalidade estará disponível em breve. Aguarde novidades!
          </p>
        </div>
      </main>
    </div>
  )
}
