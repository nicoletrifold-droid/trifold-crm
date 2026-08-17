"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { STATUS_LABELS, type LinhaDaBase, type StatusLinha } from "@web/lib/forms/response-list"

// Story 75-333 — a base de respostas. Completas, parciais e sem contato.
//
// A tela não decide nada: `montarLinhas` / `abandonoPorPergunta` (puros, em
// lib/forms/response-list.ts) já resolveram status, onde a pessoa parou e o
// ranking. Aqui só há desenho e navegação.

const BADGES: Record<StatusLinha, string> = {
  completa: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  nao_terminou: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  sem_contato: "bg-stone-200 text-stone-600 dark:bg-stone-700/50 dark:text-stone-300",
}

export function RespostasBase({
  linhas,
  abandono,
  formularios,
  filtroForm,
  filtroStatus,
  pagina,
  porPagina,
  total,
}: {
  linhas: LinhaDaBase[]
  abandono: { pergunta: string; total: number }[]
  formularios: { id: string; nome: string }[]
  filtroForm: string
  filtroStatus: string
  pagina: number
  porPagina: number
  total: number
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [aberta, setAberta] = useState<string | null>(null)

  function navegar(mudancas: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(mudancas)) {
      if (v) params.set(k, v)
      else params.delete(k)
    }
    // Trocar filtro volta para a primeira página — senão o usuário filtra e cai
    // numa página 4 que não existe mais no recorte novo.
    if (!("pagina" in mudancas)) params.delete("pagina")
    router.push(`/dashboard/campaigns/formularios?${params.toString()}`)
  }

  const ultimaPagina = Math.max(1, Math.ceil(total / porPagina))

  return (
    <div>
      {/* Onde as pessoas param — o dado que melhora o formulário. Se o contato
          está sendo pedido tarde, ele aparece aqui. */}
      {abandono.length > 0 && (
        <div className="mb-4 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
          <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
            Onde as pessoas param
          </h3>
          <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
            Nesta página. Muitos abandonos na mesma pergunta = o problema é a pergunta, não o
            anúncio.
          </p>
          <ul className="mt-3 space-y-1.5">
            {abandono.slice(0, 5).map((a) => (
              <li key={a.pergunta} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-stone-700 dark:text-stone-300">
                  {a.pergunta}
                </span>
                <span className="shrink-0 font-medium text-stone-900 dark:text-stone-100">
                  {a.total}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={filtroForm}
          onChange={(e) => navegar({ form: e.target.value })}
          className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
        >
          <option value="">Todos os formulários</option>
          {formularios.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </select>
        <select
          value={filtroStatus}
          onChange={(e) => navegar({ status: e.target.value })}
          className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
        >
          <option value="">Todos os status</option>
          <option value="completa">Completa</option>
          <option value="nao_terminou">Não terminou</option>
          <option value="sem_contato">Sem contato</option>
        </select>
        <span className="text-xs text-stone-500 dark:text-stone-400">
          {total} {total === 1 ? "resposta" : "respostas"}
        </span>
      </div>

      {linhas.length === 0 ? (
        <p className="rounded-xl border border-stone-200 bg-white p-6 text-center text-sm text-stone-500 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400">
          Nenhuma resposta neste recorte.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-800">
          <table className="min-w-full divide-y divide-stone-200 dark:divide-stone-800">
            <thead className="bg-stone-50 dark:bg-stone-900/60">
              <tr className="text-left text-xs uppercase tracking-wider text-stone-500 dark:text-stone-400">
                <th className="px-4 py-2.5">Quando</th>
                <th className="px-4 py-2.5">Contato</th>
                <th className="px-4 py-2.5">Formulário</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Parou em</th>
                <th className="px-4 py-2.5">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 bg-white dark:divide-stone-800 dark:bg-stone-900">
              {linhas.map((l) => (
                <>
                  <tr
                    key={l.id}
                    onClick={() => setAberta(aberta === l.id ? null : l.id)}
                    className="cursor-pointer text-sm hover:bg-stone-50 dark:hover:bg-stone-800/50"
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 text-stone-600 dark:text-stone-400">
                      {new Date(l.quando).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-2.5">
                      {l.telefone ? (
                        <>
                          <span className="text-stone-900 dark:text-stone-100">
                            {l.nome ?? "—"}
                          </span>
                          <span className="block text-xs text-stone-500 dark:text-stone-400">
                            {l.telefone}
                          </span>
                        </>
                      ) : (
                        <span className="text-stone-400 dark:text-stone-500">sem contato</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-stone-600 dark:text-stone-400">
                      {l.formNome}
                      {l.campanha ? (
                        <span className="block text-xs text-stone-400 dark:text-stone-500">
                          {l.campanha}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGES[l.status]}`}
                      >
                        {STATUS_LABELS[l.status]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-stone-600 dark:text-stone-400">
                      {l.parouEm ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-stone-900 dark:text-stone-100">
                      {l.score ?? "—"}
                    </td>
                  </tr>
                  {aberta === l.id && (
                    <tr key={`${l.id}-detalhe`} className="bg-stone-50 dark:bg-stone-950/40">
                      <td colSpan={6} className="px-4 py-3">
                        {l.respostas.length === 0 ? (
                          <p className="text-sm text-stone-500 dark:text-stone-400">
                            Nada preenchido ainda.
                          </p>
                        ) : (
                          <dl className="space-y-2">
                            {l.respostas.map((r) => (
                              <div key={r.perguntaId}>
                                <dt className="text-xs text-stone-500 dark:text-stone-400">
                                  {r.titulo}
                                </dt>
                                <dd className="text-sm text-stone-900 dark:text-stone-100">
                                  {r.resposta}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        )}
                        {l.leadId && (
                          <Link
                            href={`/dashboard/leads/${l.leadId}`}
                            className="mt-3 inline-block text-sm text-orange-600 hover:underline dark:text-orange-300"
                          >
                            Abrir o lead →
                          </Link>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ultimaPagina > 1 && (
        <div className="mt-3 flex items-center justify-between text-sm">
          <button
            type="button"
            disabled={pagina <= 1}
            onClick={() => navegar({ pagina: String(pagina - 1) })}
            className="rounded-lg border border-stone-300 px-3 py-1.5 disabled:opacity-40 dark:border-stone-700 dark:text-stone-200"
          >
            ← Anterior
          </button>
          <span className="text-stone-500 dark:text-stone-400">
            Página {pagina} de {ultimaPagina}
          </span>
          <button
            type="button"
            disabled={pagina >= ultimaPagina}
            onClick={() => navegar({ pagina: String(pagina + 1) })}
            className="rounded-lg border border-stone-300 px-3 py-1.5 disabled:opacity-40 dark:border-stone-700 dark:text-stone-200"
          >
            Próxima →
          </button>
        </div>
      )}
    </div>
  )
}
