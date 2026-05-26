import { redirect } from "next/navigation"
import { createClient } from "@web/lib/supabase/server"
import { ServicosSection } from "../_components/servicos-section"

interface PageProps {
  params: Promise<{ obra_id: string }>
}

export default async function FinanceiroPage({ params }: PageProps) {
  const { obra_id } = await params
  const supabase = await createClient()

  const { data: obra } = await supabase
    .from("obras")
    .select("id, name")
    .eq("id", obra_id)
    .single()

  if (!obra) redirect("/cliente/sem-obra")

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
        <ServicosSection />
      </main>
    </div>
  )
}
