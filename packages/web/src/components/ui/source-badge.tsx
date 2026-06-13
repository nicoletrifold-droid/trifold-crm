import { SOURCE_LABELS_SHORT } from "@web/lib/constants"

const SOURCE_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  meta_ads:              { bg: "bg-blue-50 dark:bg-blue-500/15",       text: "text-blue-700 dark:text-blue-300",       dot: "bg-blue-400" },
  whatsapp_click_to_ad:  { bg: "bg-green-50 dark:bg-green-500/15",     text: "text-green-700 dark:text-green-300",     dot: "bg-green-400" },
  whatsapp_organic:      { bg: "bg-emerald-50 dark:bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-400" },
  website:               { bg: "bg-indigo-50 dark:bg-indigo-500/15",   text: "text-indigo-700 dark:text-indigo-300",   dot: "bg-indigo-400" },
  referral:              { bg: "bg-yellow-50 dark:bg-yellow-500/15",   text: "text-yellow-700 dark:text-yellow-300",   dot: "bg-yellow-400" },
  walk_in:               { bg: "bg-orange-50 dark:bg-orange-500/15",   text: "text-orange-700 dark:text-orange-300",   dot: "bg-orange-400" },
  telegram:              { bg: "bg-cyan-50 dark:bg-cyan-500/15",       text: "text-cyan-700 dark:text-cyan-300",       dot: "bg-cyan-400" },
}

const FALLBACK_STYLE = { bg: "bg-stone-50 dark:bg-stone-800", text: "text-stone-500 dark:text-stone-400", dot: "bg-stone-300 dark:bg-stone-600" }

interface SourceBadgeProps {
  source: string | null
  label?: string
  size?: "xs" | "sm"
}

export function SourceBadge({ source, label: labelOverride, size = "sm" }: SourceBadgeProps) {
  const style = (source && SOURCE_STYLE[source]) ? SOURCE_STYLE[source] : FALLBACK_STYLE
  const defaultLabel = (source && SOURCE_LABELS_SHORT[source]) ? SOURCE_LABELS_SHORT[source] : "Outro"
  const label = labelOverride ?? defaultLabel
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
