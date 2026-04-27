import { SOURCE_LABELS_SHORT } from "@web/lib/constants"

const SOURCE_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  meta_ads:              { bg: "bg-blue-50",    text: "text-blue-700",    dot: "bg-blue-400" },
  whatsapp_click_to_ad:  { bg: "bg-green-50",   text: "text-green-700",   dot: "bg-green-400" },
  whatsapp_organic:      { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-400" },
  website:               { bg: "bg-indigo-50",  text: "text-indigo-700",  dot: "bg-indigo-400" },
  referral:              { bg: "bg-yellow-50",  text: "text-yellow-700",  dot: "bg-yellow-400" },
  walk_in:               { bg: "bg-orange-50",  text: "text-orange-700",  dot: "bg-orange-400" },
  telegram:              { bg: "bg-cyan-50",    text: "text-cyan-700",    dot: "bg-cyan-400" },
}

const FALLBACK_STYLE = { bg: "bg-stone-50", text: "text-stone-500", dot: "bg-stone-300" }

interface SourceBadgeProps {
  source: string | null
  size?: "xs" | "sm"
}

export function SourceBadge({ source, size = "sm" }: SourceBadgeProps) {
  const style = (source && SOURCE_STYLE[source]) ? SOURCE_STYLE[source] : FALLBACK_STYLE
  const label = (source && SOURCE_LABELS_SHORT[source]) ? SOURCE_LABELS_SHORT[source] : "Outro"
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
