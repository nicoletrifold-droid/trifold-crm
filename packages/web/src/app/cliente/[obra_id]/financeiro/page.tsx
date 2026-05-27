import Link from "next/link"
import { redirect } from "next/navigation"
import { createClient } from "@web/lib/supabase/server"
import { FileText, BarChart3, Receipt } from "lucide-react"

interface PageProps {
  params: Promise<{ obra_id: string }>
}

export default async function FinanceiroPage({ params }: PageProps) {
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
          <p className="text-xs text-stone-500">Financeiro</p>
          <p className="text-sm font-semibold text-white">{obra.name}</p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 lg:py-8">
        <h1 className="mb-6 text-xl font-bold text-white lg:text-2xl">Financeiro</h1>

        <div className="rounded-2xl border border-stone-800 bg-stone-900 p-5">
          <h3 className="mb-4 text-sm font-semibold text-white">Serviços</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Link
              href={`/cliente/${obra_id}/financeiro/boleto`}
              className="flex flex-col items-center gap-2 rounded-xl border border-stone-700 bg-stone-800/50 px-4 py-5 text-stone-400 transition-colors hover:border-stone-600 hover:bg-stone-800 hover:text-white"
            >
              <FileText className="h-6 w-6" />
              <span className="text-sm font-medium">Boleto</span>
            </Link>

            <Link
              href={`/cliente/${obra_id}/financeiro/extrato`}
              className="flex flex-col items-center gap-2 rounded-xl border border-stone-700 bg-stone-800/50 px-4 py-5 text-stone-400 transition-colors hover:border-stone-600 hover:bg-stone-800 hover:text-white"
            >
              <BarChart3 className="h-6 w-6" />
              <span className="text-sm font-medium">Extrato</span>
            </Link>

            <Link
              href={`/cliente/${obra_id}/financeiro/informe`}
              className="flex flex-col items-center gap-2 rounded-xl border border-stone-700 bg-stone-800/50 px-4 py-5 text-stone-400 transition-colors hover:border-stone-600 hover:bg-stone-800 hover:text-white"
            >
              <Receipt className="h-6 w-6" />
              <span className="text-sm font-medium">Informe de Rendimentos</span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
