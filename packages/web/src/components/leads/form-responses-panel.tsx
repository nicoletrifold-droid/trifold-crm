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
  /**
   * Story 75-343 — a pergunta em que a pessoa travou. "Não terminou" diz que ela
   * parou; isto diz ONDE, que é o que a SDR precisa para retomar a conversa no
   * ponto certo em vez de recomeçar. Ausente em resposta completa.
   */
  parouEm?: string | null
  /** Story 75-332 — leitura da IA sobre as respostas abertas. Ausente = sem espaço vazio (AC7). */
  resumoIa?: string | null
}

export function FormResponsesPanel({
  formNome,
  respostas,
  score,
  preenchidoEm,
  parcial,
  parouEm,
  resumoIa,
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

      {/* Story 75-343 — onde a pessoa parou, logo abaixo do cabeçalho: é a
          primeira coisa a saber numa resposta abandonada, antes de ler o que ela
          respondeu. Mesma regra da coluna "Parou em" da tela de Formulários. */}
      {parcial && parouEm ? (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <span className="font-semibold">Parou em:</span> {parouEm}
        </p>
      ) : null}

      {/* Story 75-332 — o que a IA leu nas respostas abertas, ANTES das respostas
          cruas: é o que o corretor lê para abrir a conversa. Sem resumo (IA
          falhou ou formulário sem pergunta aberta) o bloco não renderiza. */}
      {resumoIa ? (
        <p className="mt-3 rounded-lg bg-orange-50 p-3 text-sm text-stone-700 dark:bg-orange-950/30 dark:text-stone-200">
          {resumoIa}
        </p>
      ) : null}

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
