"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

// Story 75-333 (Epic 89) — a barra de abas de Campanhas, UMA vez.
//
// Antes desta story ela estava copiada em três arquivos: `campaigns/page.tsx`,
// `meta/campaigns-meta-client.tsx` e `agente/agente-client.tsx`. Somar uma aba
// exigia editar os três, e esquecer um produzia uma barra que PERDE a aba
// conforme a tela em que você está — falha silenciosa, descoberta por acidente.
//
// A aba ativa vem do `usePathname` em vez de uma prop por cópia: era o outro
// motivo para o componente não poder ser compartilhado antes.

const ABA_BASE = "px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors"
const ABA_ATIVA = "border-orange-600 text-orange-600 dark:text-orange-300"
const ABA_INATIVA =
  "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-stone-400 dark:hover:text-stone-200 dark:hover:border-stone-700"

interface Aba {
  href: string
  label: string
  /** false esconde a aba (capability do usuário). */
  visivel?: boolean
}

export function CampaignsTabs({
  showAgente,
  showFormularios,
}: {
  /** Story 75-219/75-301 — aba da Lídia segue a capability do marketingGuard. */
  showAgente: boolean
  /** Story 75-333 — aba de Formulários segue o módulo `campanhas`. */
  showFormularios: boolean
}) {
  const pathname = usePathname()

  const abas: Aba[] = [
    { href: "/dashboard/campaigns", label: "CRM" },
    { href: "/dashboard/campaigns/meta", label: "Meta Ads" },
    { href: "/dashboard/campaigns/formularios", label: "Formulários", visivel: showFormularios },
    { href: "/dashboard/campaigns/agente", label: "Lídia", visivel: showAgente },
  ]

  return (
    <div className="mb-4 flex overflow-x-auto border-b border-gray-200 dark:border-stone-800">
      {abas
        .filter((a) => a.visivel !== false)
        .map((a) => {
          // "/dashboard/campaigns" é prefixo de todas as outras — a aba CRM só
          // é ativa no caminho exato, senão ficariam duas acesas.
          const ativa = a.href === "/dashboard/campaigns" ? pathname === a.href : pathname.startsWith(a.href)
          return (
            <Link key={a.href} href={a.href} className={`${ABA_BASE} ${ativa ? ABA_ATIVA : ABA_INATIVA}`}>
              {a.label}
            </Link>
          )
        })}
    </div>
  )
}
