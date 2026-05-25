interface Fase {
  id: string
  name: string
  status: string
  progress_pct: number
  order_index: number
  start_date: string | null
  end_date: string | null
}

interface FasesListProps {
  fases: Fase[]
  currentPhaseId: string | null
}

const STATUS_CONFIG: Record<string, { label: string; badge: string; bar: string }> = {
  pendente: {
    label: "Pendente",
    badge: "bg-stone-800 text-stone-400",
    bar: "bg-stone-700",
  },
  em_andamento: {
    label: "Em andamento",
    badge: "bg-amber-900/40 text-amber-400",
    bar: "bg-amber-500",
  },
  concluida: {
    label: "Concluída",
    badge: "bg-green-900/40 text-green-400",
    bar: "bg-green-500",
  },
}

export function FasesList({ fases, currentPhaseId }: FasesListProps) {
  if (fases.length === 0) {
    return (
      <p className="text-sm text-stone-500">Nenhuma fase cadastrada ainda.</p>
    )
  }

  return (
    <ul className="space-y-3">
      {fases.map((fase) => {
        const cfg = STATUS_CONFIG[fase.status] ?? STATUS_CONFIG.pendente!
        const isCurrent = fase.id === currentPhaseId

        return (
          <li
            key={fase.id}
            className={`rounded-xl border p-4 ${
              isCurrent
                ? "border-[#F27A5E]/50 bg-stone-900"
                : "border-stone-800 bg-stone-900/60"
            }`}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {isCurrent && (
                  <span className="h-2 w-2 flex-shrink-0 rounded-full bg-[#F27A5E]" />
                )}
                <span className="text-sm font-medium text-white">{fase.name}</span>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.badge}`}
              >
                {cfg.label}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-stone-800">
              <div
                className={`h-1.5 rounded-full transition-all ${cfg.bar}`}
                style={{ width: `${fase.progress_pct}%` }}
              />
            </div>
            <p className="mt-1 text-right text-xs text-stone-500">
              {fase.progress_pct}%
            </p>
          </li>
        )
      })}
    </ul>
  )
}
