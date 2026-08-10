import { QUALIFICACAO_COMERCIAL_LABELS } from "@web/lib/constants"

// Story 84-2 (Epic 84) — formato rounded-md + dot (padrão de @web/components/ui/source-badge),
// deliberadamente diferente do badge rounded-full da Temperatura, para os dois campos não
// serem confundidos visualmente.
const QUALIFICACAO_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  bom:      { bg: "bg-emerald-50 dark:bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  regular:  { bg: "bg-slate-100 dark:bg-slate-500/15",    text: "text-slate-700 dark:text-slate-300",     dot: "bg-slate-400" },
  ruim:     { bg: "bg-rose-50 dark:bg-rose-500/15",       text: "text-rose-700 dark:text-rose-300",       dot: "bg-rose-500" },
  invalido: { bg: "bg-fuchsia-50 dark:bg-fuchsia-500/15", text: "text-fuchsia-700 dark:text-fuchsia-300", dot: "bg-fuchsia-500" },
}

interface QualificacaoComercialBadgeProps {
  value: string | null
  size?: "xs" | "sm"
}

export function QualificacaoComercialBadge({ value, size = "sm" }: QualificacaoComercialBadgeProps) {
  if (!value || !QUALIFICACAO_STYLE[value]) return null

  const style = QUALIFICACAO_STYLE[value]
  const label = QUALIFICACAO_COMERCIAL_LABELS[value] ?? value
  const textSize = size === "xs" ? "text-[10px]" : "text-xs"
  const dotSize = size === "xs" ? "h-1.5 w-1.5" : "h-2 w-2"

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium ${textSize} ${style.bg} ${style.text}`}
    >
      <span className={`rounded-full ${dotSize} ${style.dot}`} />
      {label}
    </span>
  )
}
