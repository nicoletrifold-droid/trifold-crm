"use client"

/**
 * Story 900-57 · AC1 — as 6 abas da casca da empresa.
 *
 * É client component por UM motivo só: `usePathname()`. Saber "onde estou" é metade do que esta
 * story entrega — o diagnóstico do dono do produto começa exatamente em "não existe 'onde estou'
 * porque só existe um lugar onde estar" (`console-plataforma.md` §0). Uma nav sem aba ativa
 * repetiria o defeito num nível abaixo.
 *
 * As 6 abas existem desde o primeiro dia, inclusive as que só mostram "fundação ausente": a
 * forma final da casca fica visível, e ninguém desenha uma solução para a aba que falta sem
 * perceber que ela já tem lugar.
 */

import Link from "next/link"
import { usePathname } from "next/navigation"

const ABAS: ReadonlyArray<{ rotulo: string; sufixo: string }> = [
  { rotulo: "Resumo", sufixo: "" },
  { rotulo: "Plano", sufixo: "/plano" },
  { rotulo: "Uso", sufixo: "/uso" },
  { rotulo: "Integrações", sufixo: "/integracoes" },
  { rotulo: "Usuários", sufixo: "/usuarios" },
  { rotulo: "Trilha", sufixo: "/trilha" },
]

export function AbasDaEmpresa({ orgId }: { orgId: string }) {
  const pathname = usePathname()
  const base = `/platform/orgs/${orgId}`

  return (
    <nav aria-label="Seções da empresa" className="flex flex-wrap gap-1 border-b border-slate-800">
      {ABAS.map((aba) => {
        const href = `${base}${aba.sufixo}`
        // Comparação EXATA, não `startsWith`: com prefixo, o Resumo (`base`) ficaria marcado como
        // ativo em todas as abas ao mesmo tempo, porque é prefixo de todas elas.
        const ativa = pathname === href
        return (
          <Link
            key={aba.rotulo}
            href={href}
            aria-current={ativa ? "page" : undefined}
            className={
              ativa
                ? "-mb-px border-b-2 border-amber-500 px-3 py-2 text-sm font-semibold text-slate-100"
                : "-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-slate-400 hover:text-slate-200"
            }
          >
            {aba.rotulo}
          </Link>
        )
      })}
    </nav>
  )
}
