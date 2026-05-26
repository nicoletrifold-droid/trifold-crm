import { redirect } from "next/navigation"
import { createClient } from "@web/lib/supabase/server"
import { FASE_STATUS_BADGE, FASE_STATUS_LABEL } from "@web/lib/status-badge"

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

interface Fase {
  id: string
  name: string
  description: string | null
  status: string
  progress_pct: number
  order_index: number
  start_date: string | null
  end_date: string | null
}

const GROUP_COLORS = [
  {
    border: "border-orange-500/40",
    header: "bg-orange-900/20",
    headerText: "text-orange-400",
    bars: ["bg-orange-500", "bg-orange-400", "bg-orange-600", "bg-orange-300"],
  },
  {
    border: "border-blue-500/40",
    header: "bg-blue-900/20",
    headerText: "text-blue-400",
    bars: ["bg-blue-500", "bg-blue-400", "bg-blue-600", "bg-blue-300"],
  },
  {
    border: "border-emerald-500/40",
    header: "bg-emerald-900/20",
    headerText: "text-emerald-400",
    bars: ["bg-emerald-500", "bg-emerald-400", "bg-emerald-600", "bg-emerald-300"],
  },
  {
    border: "border-purple-500/40",
    header: "bg-purple-900/20",
    headerText: "text-purple-400",
    bars: ["bg-purple-500", "bg-purple-400", "bg-purple-600", "bg-purple-300"],
  },
  {
    border: "border-teal-500/40",
    header: "bg-teal-900/20",
    headerText: "text-teal-400",
    bars: ["bg-teal-500", "bg-teal-400", "bg-teal-600", "bg-teal-300"],
  },
  {
    border: "border-rose-500/40",
    header: "bg-rose-900/20",
    headerText: "text-rose-400",
    bars: ["bg-rose-500", "bg-rose-400", "bg-rose-600", "bg-rose-300"],
  },
  {
    border: "border-indigo-500/40",
    header: "bg-indigo-900/20",
    headerText: "text-indigo-400",
    bars: ["bg-indigo-500", "bg-indigo-400", "bg-indigo-600", "bg-indigo-300"],
  },
  {
    border: "border-amber-500/40",
    header: "bg-amber-900/20",
    headerText: "text-amber-400",
    bars: ["bg-amber-500", "bg-amber-400", "bg-amber-600", "bg-amber-300"],
  },
] as const

function buildFaseGroups(fases: Fase[]): [string, Fase[]][] {
  const sorted = [...fases].sort((a, b) => {
    const aConc = a.status === "concluida"
    const bConc = b.status === "concluida"
    if (aConc !== bConc) return aConc ? 1 : -1
    if (!a.start_date && !b.start_date) return a.order_index - b.order_index
    if (!a.start_date) return 1
    if (!b.start_date) return -1
    return new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
  })
  const groups: [string, Fase[]][] = []
  const idx = new Map<string, number>()
  for (const fase of sorted) {
    if (!idx.has(fase.name)) {
      idx.set(fase.name, groups.length)
      groups.push([fase.name, []])
    }
    groups[idx.get(fase.name)!]![1].push(fase)
  }
  return groups
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

  const allFases = fases ?? []
  const groups = buildFaseGroups(allFases)

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
          <div className="space-y-3">
            {groups.map(([groupName, groupFases], groupIdx) => {
              const color = GROUP_COLORS[groupIdx % GROUP_COLORS.length]!
              return (
                <div
                  key={groupName}
                  className={`overflow-hidden rounded-xl border ${color.border}`}
                >
                  <div
                    className={`flex items-center justify-between px-4 py-2.5 ${color.header}`}
                  >
                    <span className={`text-sm font-semibold ${color.headerText}`}>
                      {groupName}
                    </span>
                    {groupFases.length > 1 && (
                      <span className="text-xs text-stone-500">
                        {groupFases.length} etapas
                      </span>
                    )}
                  </div>

                  <div className="divide-y divide-stone-800 bg-stone-900">
                    {groupFases.map((fase, subIdx) => {
                      const barColor = color.bars[subIdx % color.bars.length]
                      const badgeClass =
                        FASE_STATUS_BADGE[fase.status] ?? FASE_STATUS_BADGE.pendente
                      const label = FASE_STATUS_LABEL[fase.status] ?? fase.status

                      return (
                        <div key={fase.id} className="p-4">
                          <div className="mb-3 flex items-start justify-between gap-2">
                            {fase.description ? (
                              <p className="text-sm text-white/80">
                                {fase.description}
                              </p>
                            ) : (
                              <p className="text-sm italic text-stone-600">
                                Sem etapa
                              </p>
                            )}
                            <span
                              className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide ${badgeClass}`}
                            >
                              {label}
                            </span>
                          </div>

                          {/* Progress bar */}
                          <div className="mb-3">
                            <div className="mb-1 flex items-center justify-between text-xs">
                              <span className="text-stone-500">Progresso</span>
                              <span
                                className={`font-semibold ${color.headerText}`}
                              >
                                {fase.progress_pct ?? 0}%
                              </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-stone-800">
                              <div
                                className={`h-1.5 rounded-full ${barColor} transition-all duration-700`}
                                style={{ width: `${fase.progress_pct ?? 0}%` }}
                              />
                            </div>
                          </div>

                          {/* Dates */}
                          <div className="flex gap-6 text-xs text-stone-500">
                            <div>
                              <p className="font-medium text-white/60">
                                {formatDate(fase.start_date)}
                              </p>
                              <p>Início</p>
                            </div>
                            <div>
                              <p className="font-medium text-white/60">
                                {formatDate(fase.end_date)}
                              </p>
                              <p>
                                {fase.status === "concluida"
                                  ? "Conclusão"
                                  : "Previsão"}
                              </p>
                            </div>
                          </div>
                        </div>
                      )
                    })}
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
