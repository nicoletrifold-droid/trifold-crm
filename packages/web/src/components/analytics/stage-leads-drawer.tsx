"use client"

// Story 75-341 (pedido do Marcos, 18/08) — "ao clicar sobre o funil em cada etapa,
// abrir a listagem referente àqueles dados".
//
// Um painel só, usado pelos DOIS cards que mostram os mesmos números (a régua do
// Pipeline e o Funil de Conversão). Se cada card tivesse a sua lista, elas
// divergiriam no primeiro ajuste — e o ponto do card único da Story 75-326 era
// justamente parar de comparar números que moram em lugares diferentes.

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { X, ExternalLink } from "lucide-react"

export interface StageLeadsAlvo {
  stageId: string
  /** "chegaram" = passaram por aqui no período · "agora" = estão aqui hoje. */
  modo: "chegaram" | "agora"
  /** Rótulo já exibido no card — o painel abre com ele antes da resposta chegar. */
  label: string
  /** Número que a pessoa clicou. Serve de conferência contra o total que volta. */
  esperado: number
}

interface LeadDaEtapa {
  id: string
  name: string | null
  phone: string | null
  source: string | null
  created_at: string
  etapa_atual: string | null
  etapa_atual_id: string | null
  corretor: string | null
}

interface Resposta {
  stage: { id: string; name: string; slug: string | null }
  modo: "chegaram" | "agora"
  total: number
  truncado: boolean
  leads: LeadDaEtapa[]
}

interface Props {
  alvo: StageLeadsAlvo
  /** Início/fim do período da tela, em ISO — os mesmos que os cards usaram. */
  from: string
  to: string
  /** Filtros ativos já serializados (`serializeAnalyticsFilters`). */
  filterQuery?: string
  rangeLabel: string
  onClose: () => void
}

const dataCurta = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" })

export function StageLeadsDrawer({ alvo, from, to, filterQuery, rangeLabel, onClose }: Props) {
  const [dados, setDados] = useState<Resposta | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const fecharRef = useRef<HTMLButtonElement>(null)

  // Esc fecha. Sem isso o painel só sai com mouse — e ele abre por clique num
  // gráfico, onde a mão já está no teclado tão frequentemente quanto no mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    fecharRef.current?.focus()
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  // 🔴 Sem `setDados(null)` aqui: resetar estado dentro do effect é render em
  // cascata (a regra de lint do React pega). Quem troca de alvo é o pai, e ele
  // passa `key` no drawer — então trocar de etapa REMONTA o componente e o estado
  // já nasce limpo. Ver `pipeline-ruler.tsx` / `conversion-funnel.tsx`.
  useEffect(() => {
    let cancelado = false

    const params = new URLSearchParams(filterQuery ?? "")
    params.set("from", from)
    params.set("to", to)
    params.set("stage", alvo.stageId)
    params.set("modo", alvo.modo)

    fetch(`/api/analytics/funnel-leads?${params.toString()}`)
      .then(async (r) => {
        const json = (await r.json()) as Resposta & { error?: string }
        if (!r.ok) throw new Error(json.error ?? "Falha ao carregar.")
        return json
      })
      .then((json) => {
        if (!cancelado) setDados(json)
      })
      .catch((e: unknown) => {
        if (!cancelado) setErro(e instanceof Error ? e.message : "Não foi possível carregar a lista.")
      })

    return () => {
      cancelado = true
    }
  }, [alvo.stageId, alvo.modo, from, to, filterQuery])

  const explicacao =
    alvo.modo === "chegaram"
      ? "Passaram por esta etapa no período — inclusive quem já avançou ou se perdeu depois."
      : "Estão nesta etapa hoje, entre as entradas do período."

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Leads da etapa ${alvo.label}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-t-2xl border border-stone-200 bg-white shadow-xl dark:border-stone-700 dark:bg-stone-900 sm:rounded-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-stone-100 px-5 py-4 dark:border-stone-800">
          <div>
            <h2 className="text-base font-semibold text-stone-900 dark:text-white">
              {alvo.label}{" "}
              <span className="text-sm font-normal text-stone-400">
                · {alvo.modo === "chegaram" ? "chegaram" : "agora"} · {rangeLabel}
              </span>
            </h2>
            <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">{explicacao}</p>
          </div>
          <button
            ref={fecharRef}
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {erro && <p className="py-6 text-center text-sm text-red-600 dark:text-red-400">{erro}</p>}

          {!erro && !dados && (
            <p className="py-6 text-center text-sm text-stone-500 dark:text-stone-400">
              Carregando {alvo.esperado} {alvo.esperado === 1 ? "lead" : "leads"}…
            </p>
          )}

          {dados && dados.leads.length === 0 && (
            <p className="py-6 text-center text-sm text-stone-500 dark:text-stone-400">
              Nenhum lead neste conjunto.
            </p>
          )}

          {dados && dados.leads.length > 0 && (
            <ul className="divide-y divide-stone-100 dark:divide-stone-800">
              {dados.leads.map((l) => (
                <li key={l.id} className="py-2.5">
                  <Link
                    href={`/dashboard/leads/${l.id}`}
                    className="group flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-stone-900 group-hover:text-orange-600 dark:text-stone-100 dark:group-hover:text-orange-300">
                        {l.name?.trim() || "sem nome"}
                      </p>
                      <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                        {l.phone || "sem telefone"}
                        {l.corretor ? ` · ${l.corretor}` : " · sem corretor"}
                        {` · entrou ${dataCurta(l.created_at)}`}
                      </p>
                    </div>
                    {/* No modo "chegaram", a etapa de HOJE é o que explica por que o
                        lead não aparece na coluna que a pessoa clicou. Foi essa a
                        dúvida do Marcos: 1 em Fechamento no funil e ninguém na
                        coluna Fechamento do Pipeline. */}
                    <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-stone-400 dark:text-stone-500">
                      {alvo.modo === "chegaram" && l.etapa_atual_id !== dados.stage.id && l.etapa_atual
                        ? `hoje: ${l.etapa_atual}`
                        : ""}
                      <ExternalLink className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {dados?.truncado && (
            <p className="border-t border-stone-100 py-3 text-center text-xs text-stone-500 dark:border-stone-800 dark:text-stone-400">
              Mostrando os {dados.leads.length} mais recentes de {dados.total}.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-stone-100 px-5 py-3 text-xs dark:border-stone-800">
          <span className="text-stone-500 dark:text-stone-400">
            {dados ? `${dados.total} ${dados.total === 1 ? "lead" : "leads"}` : `${alvo.esperado} no card`}
            {/* Divergência entre o card e a lista é sintoma de regra duplicada — e
                aparecer aqui é melhor do que ninguém notar. */}
            {dados && dados.total !== alvo.esperado ? ` · card marcava ${alvo.esperado}` : ""}
          </span>
          {dados?.stage.slug && (
            <Link
              href={`/dashboard/pipeline?stage=${dados.stage.slug}`}
              className="font-medium text-orange-600 hover:underline dark:text-orange-300"
            >
              Abrir no Pipeline
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
