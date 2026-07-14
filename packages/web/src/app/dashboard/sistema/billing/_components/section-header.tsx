import { type LucideIcon } from "lucide-react"

// Story 78-9 — cabeçalho de seção do Painel de Saúde & Billing. Extraído de page.tsx pela
// Story 78-15 para reuso sem ciclo de import (page.tsx ⇄ fixed-subscriptions.tsx): a prop `meta`
// (texto à direita do título) é onde o total mensal de assinaturas fixas é exibido (78-15 AC6).
export function SectionHeader({
  icon: Icon,
  title,
  meta,
}: {
  icon: LucideIcon
  title: string
  meta?: string
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Icon className="h-4 w-4 text-orange-600" />
      <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
        {title}
      </h2>
      {meta && <div className="ml-auto text-xs text-stone-400 dark:text-stone-500">{meta}</div>}
    </div>
  )
}
