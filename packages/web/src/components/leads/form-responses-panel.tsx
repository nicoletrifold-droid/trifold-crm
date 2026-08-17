import type { RespostaLegivel } from "@web/lib/forms/format-response"

// Story 75-330 (Epic 89) — AC9: o que o lead respondeu no formulário, na ficha.
// Painel compartilhado entre /broker e /dashboard, mesmo padrão do
// BehaviorAnalysisPanel. Apresentação pura: quem busca e formata é a página +
// lib/forms/format-response.ts.
//
// Convenção de tema: /dashboard e /broker suportam claro E escuro (dark:).

export interface FormResponsesPanelProps {
  formNome: string
  respostas: RespostaLegivel[]
  score: number | null
  preenchidoEm: string | null
  /** Resposta parcial = a pessoa abandonou no meio. Isso é informação de venda. */
  parcial: boolean
}

export function FormResponsesPanel({
  formNome,
  respostas,
  score,
  preenchidoEm,
  parcial,
}: FormResponsesPanelProps) {
  if (respostas.length === 0) return null

  const quando = preenchidoEm
    ? new Date(preenchidoEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
    : null

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
            Formulário de qualificação
          </h3>
          <p className="mt-0.5 truncate text-xs text-stone-500 dark:text-stone-400">
            {formNome}
            {quando ? ` · ${quando}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {parcial && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              Não terminou
            </span>
          )}
          {score !== null && (
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700 dark:bg-stone-800 dark:text-stone-300">
              Score {score}
            </span>
          )}
        </div>
      </div>

      <dl className="mt-3 space-y-2.5">
        {respostas.map((r) => (
          <div key={r.perguntaId}>
            <dt className="text-xs text-stone-500 dark:text-stone-400">{r.titulo}</dt>
            <dd className="text-sm text-stone-900 dark:text-stone-100">{r.resposta}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
