import { redirect } from "next/navigation"
import Image from "next/image"
import { createClient } from "@web/lib/supabase/server"
import { logout } from "@web/app/login/actions"
import { FasesList } from "./_components/fases-list"
import { FotosGrid } from "./_components/fotos-grid"
import { MensagensList } from "./_components/mensagens-list"

const STATUS_LABEL: Record<string, string> = {
  em_andamento: "Em andamento",
  concluida: "Concluída",
  pausada: "Pausada",
}

const STATUS_BADGE: Record<string, string> = {
  em_andamento: "bg-amber-900/40 text-amber-400",
  concluida: "bg-green-900/40 text-green-400",
  pausada: "bg-stone-800 text-stone-400",
}

function formatDeliveryDate(date: string | null): string {
  if (!date) return "A definir"
  return new Date(date).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  })
}

export default async function ObraPage({
  params,
}: {
  params: Promise<{ obra_id: string }>
}) {
  const { obra_id } = await params
  const supabase = await createClient()

  // RLS ensures the cliente only sees their own obras
  const { data: obra } = await supabase
    .from("obras")
    .select(
      "id, name, description, progress_pct, status, expected_delivery_date, current_phase_id"
    )
    .eq("id", obra_id)
    .single()

  if (!obra) {
    redirect("/cliente/sem-obra")
  }

  const [fasesRes, fotosRes, mensagensRes] = await Promise.all([
    supabase
      .from("obra_fases")
      .select("id, name, status, progress_pct, order_index, start_date, end_date")
      .eq("obra_id", obra_id)
      .order("order_index"),
    supabase
      .from("obra_fotos")
      .select("id, storage_path, caption, taken_at, fase_id")
      .eq("obra_id", obra_id)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("obra_mensagens")
      .select("id, content, created_at, sender_type")
      .eq("obra_id", obra_id)
      .eq("sender_type", "equipe")
      .order("created_at", { ascending: false })
      .limit(5),
  ])

  const fases = fasesRes.data ?? []
  const fotos = fotosRes.data ?? []
  const mensagens = mensagensRes.data ?? []
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""

  const statusBadge = STATUS_BADGE[obra.status] ?? "bg-stone-800 text-stone-400"
  const statusLabel = STATUS_LABEL[obra.status] ?? obra.status

  return (
    <div className="min-h-screen bg-stone-950">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-stone-800 bg-stone-950/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Image
              src="/logo-trifold.webp"
              alt="Trifold"
              width={36}
              height={36}
              className="rounded-lg"
            />
            <div>
              <p className="text-xs text-stone-500">Acompanhamento</p>
              <p className="text-sm font-semibold text-white">{obra.name}</p>
            </div>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="text-sm text-stone-500 transition-colors hover:text-[#E8856A]"
            >
              Sair
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        {/* Visão Geral */}
        <section className="rounded-2xl border border-stone-800 bg-stone-900 p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">{obra.name}</h2>
              {obra.description && (
                <p className="mt-1 text-sm text-stone-400">{obra.description}</p>
              )}
            </div>
            <span
              className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium ${statusBadge}`}
            >
              {statusLabel}
            </span>
          </div>

          <div className="mb-4">
            <div className="mb-1.5 flex justify-between text-sm">
              <span className="text-stone-400">Progresso geral</span>
              <span className="font-medium text-white">{obra.progress_pct}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-stone-800">
              <div
                className="h-2 rounded-full bg-[#E8856A] transition-all"
                style={{ width: `${obra.progress_pct}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-sm text-stone-400">
            <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>
              Previsão de entrega:{" "}
              <span className="text-white">
                {formatDeliveryDate(obra.expected_delivery_date)}
              </span>
            </span>
          </div>
        </section>

        {/* Fases */}
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-stone-500">
            Fases da Obra
          </h3>
          <FasesList fases={fases} currentPhaseId={obra.current_phase_id} />
        </section>

        {/* Fotos Recentes */}
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-stone-500">
            Fotos Recentes
          </h3>
          <FotosGrid fotos={fotos} supabaseUrl={supabaseUrl} />
        </section>

        {/* Atualizações da Equipe */}
        <section className="pb-8">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-stone-500">
            Atualizações da Equipe
          </h3>
          <MensagensList mensagens={mensagens} />
        </section>
      </main>
    </div>
  )
}
