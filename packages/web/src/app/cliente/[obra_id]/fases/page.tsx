import { redirect } from "next/navigation"
import { createClient } from "@web/lib/supabase/server"

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  const d = new Date(dateStr)
  const day = d.getUTCDate().toString().padStart(2, "0")
  const rawMonth = d.toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" })
  const month =
    rawMonth.replace(".", "").charAt(0).toUpperCase() +
    rawMonth.replace(".", "").slice(1)
  const year = d.getUTCFullYear()
  return `${day}/${month}/${year}`
}

const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluida: "Concluída",
}

const STATUS_BADGE: Record<string, string> = {
  pendente: "bg-stone-800 text-stone-400",
  em_andamento: "bg-[#F27A5E]/20 text-[#F27A5E]",
  concluida: "bg-green-900/40 text-green-400",
}

const DOT_COLOR: Record<string, string> = {
  pendente: "bg-stone-600",
  em_andamento: "bg-[#F27A5E]",
  concluida: "bg-green-500",
}

export default async function FasesPage({
  params,
}: {
  params: Promise<{ obra_id: string }>
}) {
  const { obra_id } = await params
  const supabase = await createClient()

  const { data: obra } = await supabase
    .from("obras")
    .select("id, name, progress_pct")
    .eq("id", obra_id)
    .single()

  if (!obra) redirect("/cliente/sem-obra")

  const { data: fases } = await supabase
    .from("obra_fases")
    .select(
      "id, name, description, status, progress_pct, order_index, start_date, end_date"
    )
    .eq("obra_id", obra_id)
    .order("order_index")

  const allFases = fases ?? []

  return (
    <div className="min-h-screen bg-stone-950">
      {/* Mobile header */}
      <header className="sticky top-0 z-10 border-b border-stone-800 bg-stone-950/90 backdrop-blur-sm lg:hidden">
        <div className="mx-auto max-w-2xl px-4 py-4">
          <p className="text-xs text-stone-500">Fases da Obra</p>
          <p className="text-sm font-semibold text-white">{obra.name}</p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 lg:py-8">
        {/* Cronograma card */}
        <div className="mb-6 rounded-2xl border border-stone-800 bg-stone-900 p-5">
          <h2 className="mb-3 text-base font-semibold text-white">
            Cronograma da obra
          </h2>
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="text-white/60">Progresso geral</span>
            <span className="font-semibold text-[#F27A5E]">
              {obra.progress_pct}%
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-stone-800">
            <div
              className="h-2 rounded-full bg-[#F27A5E] transition-all"
              style={{ width: `${obra.progress_pct}%` }}
            />
          </div>
        </div>

        {/* Phases list */}
        {allFases.length === 0 ? (
          <p className="text-sm text-stone-500">Nenhuma fase cadastrada ainda.</p>
        ) : (
          <div className="relative space-y-3 pl-6">
            {/* Vertical line */}
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-stone-700" />

            {allFases.map((fase, idx) => {
              const dotColor = DOT_COLOR[fase.status] ?? DOT_COLOR.pendente
              const badgeClass = STATUS_BADGE[fase.status] ?? STATUS_BADGE.pendente
              const label = STATUS_LABEL[fase.status] ?? fase.status

              return (
                <div key={fase.id} className="relative">
                  {/* Dot */}
                  {fase.status === "concluida" ? (
                    <span className="absolute -left-6 top-[18px] z-10 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-green-500">
                      <svg className="h-2 w-2 text-white" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                      </svg>
                    </span>
                  ) : (
                    <span
                      className={`absolute -left-6 top-[18px] z-10 block h-3.5 w-3.5 rounded-full ${dotColor}`}
                    />
                  )}

                  {/* Card */}
                  <div className={`rounded-xl border bg-stone-900 p-4 ${
                    fase.status === "em_andamento"
                      ? "border-[#F27A5E] ring-1 ring-[#F27A5E]/25"
                      : "border-stone-800"
                  }`}>
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-white">
                        {idx + 1}. {fase.name}
                      </h3>
                      <span
                        className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide ${badgeClass}`}
                      >
                        {label}
                      </span>
                    </div>
                    {fase.description && (
                      <p className="mb-3 text-[13px] leading-relaxed text-white/70">
                        {fase.description}
                      </p>
                    )}
                    <div className="flex gap-6 text-xs text-white/40">
                      <div>
                        <p className="font-medium text-white">
                          {formatDate(fase.start_date)}
                        </p>
                        <p>Início</p>
                      </div>
                      <div>
                        <p className="font-medium text-white">
                          {formatDate(fase.end_date)}
                        </p>
                        <p>{fase.status === "concluida" ? "Conclusão" : "Previsão"}</p>
                      </div>
                    </div>

                    {/* Barra de progresso — apenas fase em andamento */}
                    {fase.status === "em_andamento" && (
                      <div className="mt-4 border-t border-stone-800/60 pt-3">
                        <div className="mb-1.5 flex items-center justify-between text-xs">
                          <span className="text-white/50">Progresso da etapa</span>
                          <span className="font-semibold text-[#F27A5E]">
                            {fase.progress_pct ?? 0}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-stone-800">
                          <div
                            className="h-1.5 rounded-full bg-[#F27A5E] transition-all duration-700"
                            style={{ width: `${fase.progress_pct ?? 0}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
