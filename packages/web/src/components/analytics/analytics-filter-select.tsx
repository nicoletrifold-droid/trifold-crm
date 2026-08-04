"use client"

import { useRouter } from "next/navigation"

// Story 75-272 — um <select> de filtro do Analytics.
//
// A página é server component e os filtros vivem na URL, então o único pedaço
// que precisa ser client é a navegação no `onChange`. Detalhe que define o
// desenho: **função não atravessa a fronteira server → client**, logo o pai não
// pode passar um `hrefFor(valor)`. O `value` de cada <option> É o href — o
// onChange só empurra o que já veio pronto. Zero lógica de URL aqui dentro.

export interface FilterSelectOption {
  /** Href completo já montado por buildAnalyticsHref no server. */
  href: string
  /** Rótulo com a contagem, ex.: "Casado (31)". */
  label: string
  selected: boolean
}

export function AnalyticsFilterSelect({
  title,
  allHref,
  options,
  hasSelection,
  coverageNote,
}: {
  title: string
  /** Href da opção "Todos" (remove esta dimensão da URL). */
  allHref: string
  options: FilterSelectOption[]
  hasSelection: boolean
  /**
   * Aviso de cobertura, ex.: "31 de 1.657 com o dado". Existe porque os campos
   * de perfil estão preenchidos em 1-2% da base: sem isto, o número pequeno
   * parece defeito do analytics em vez de dado ausente (AC5).
   */
  coverageNote?: string
}) {
  const router = useRouter()
  const selecionada = options.find((o) => o.selected)

  return (
    <label className="flex min-w-[9rem] flex-col gap-1">
      <span className="text-xs font-medium text-stone-500 dark:text-stone-400">
        {title}
        {coverageNote && (
          <span className="ml-1 font-normal text-stone-400 dark:text-stone-500">· {coverageNote}</span>
        )}
      </span>
      <select
        value={selecionada?.href ?? allHref}
        onChange={(e) => router.push(e.target.value)}
        aria-label={title}
        className={`rounded border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500 dark:bg-stone-800 dark:text-stone-100 ${
          hasSelection
            ? "border-orange-400 bg-orange-50 text-stone-900 dark:border-orange-500/50 dark:bg-orange-500/10"
            : "border-stone-200 bg-white text-stone-700 dark:border-stone-700"
        }`}
      >
        <option value={allHref}>Todos</option>
        {options.map((o) => (
          <option key={o.href} value={o.href}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
