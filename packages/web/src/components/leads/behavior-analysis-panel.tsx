"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { BehaviorAnalysisResult } from "@trifold/ai"

/**
 * Story 82-2 (Epic 82) — Painel "Análise IA" do lead.
 * Compartilhado entre /dashboard (light/dark via `dark:`) e /broker (sempre
 * dark hardcoded) — o prop `theme` seleciona o conjunto de classes.
 *
 * Regra de produto: a sugestão de estágio é OPINIÃO — o painel nunca oferece
 * ação de mover etapa.
 */

export type BehaviorAnalysisData = BehaviorAnalysisResult & {
  _meta?: {
    model?: string
    version?: number
    event_count?: number
    last_event_at?: string | null
  }
}

interface Props {
  leadId: string
  analysis: BehaviorAnalysisData | null
  analyzedAt: string | null
  currentStage: string | null
  /** timestamp da atividade mais recente do lead (staleness) */
  lastActivityAt: string | null
  /** resumo da conversa (leads.ai_summary) — contexto no topo */
  aiSummary: string | null
  theme?: "auto" | "dark"
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function BehaviorAnalysisPanel({
  leadId,
  analysis,
  analyzedAt,
  currentStage,
  lastActivityAt,
  aiSummary,
  theme = "auto",
}: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const router = useRouter()

  const dark = theme === "dark"
  const c = {
    card: dark
      ? "rounded-lg bg-stone-900 p-6 ring-1 ring-stone-800"
      : "rounded-lg bg-white p-6 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800",
    title: dark ? "text-stone-100" : "text-gray-900 dark:text-stone-100",
    text: dark ? "text-stone-300" : "text-gray-700 dark:text-stone-300",
    muted: dark ? "text-stone-500" : "text-gray-400 dark:text-stone-500",
    label: dark ? "text-stone-400" : "text-gray-500 dark:text-stone-400",
    section: dark ? "border-stone-800" : "border-gray-100 dark:border-stone-800",
    chip: dark
      ? "bg-stone-800 text-stone-200"
      : "bg-gray-100 text-gray-700 dark:bg-stone-800 dark:text-stone-200",
  }

  const isStale =
    analyzedAt != null &&
    lastActivityAt != null &&
    new Date(lastActivityAt).getTime() > new Date(analyzedAt).getTime()

  async function handleGenerate() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/leads/${leadId}/behavior-analysis`, { method: "POST" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || "Erro ao gerar a análise")
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={c.card}>
      <div className="flex items-center justify-between gap-4">
        <h2 className={`text-lg font-semibold ${c.title}`}>Análise IA</h2>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
        >
          {loading
            ? "Analisando..."
            : analysis
              ? "Analisar novamente"
              : "Analisar comportamento"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}

      {/* Resumo da conversa (contexto — mantido pelo cron de enriquecimento) */}
      {aiSummary && (
        <div className={`mt-4 border-b pb-4 ${c.section}`}>
          <button
            onClick={() => setSummaryOpen((v) => !v)}
            className={`text-sm font-medium ${c.label} hover:underline`}
          >
            {summaryOpen ? "▾" : "▸"} Resumo da conversa
          </button>
          {summaryOpen && (
            <p className={`mt-2 whitespace-pre-wrap text-sm ${c.text}`}>{aiSummary}</p>
          )}
        </div>
      )}

      {!analysis ? (
        <div className="mt-6">
          <p className={`text-sm ${c.muted}`}>
            Nenhuma análise gerada ainda. A IA cruza conversas, observações, notas do
            histórico de contatos, tarefas, visitas e feedbacks para sugerir o estágio real
            do lead e como abordá-lo. Clique em &quot;Analisar comportamento&quot;.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          {isStale && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-300">
              Houve movimentação neste lead depois desta análise — gere novamente para
              considerar os eventos recentes.
            </div>
          )}

          {/* Estágio real × etapa do funil — sugestão, nunca ação */}
          <div className={`rounded-md border p-4 ${c.section}`}>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded px-2 py-0.5 ${c.chip}`}>
                Etapa no funil: {currentStage ?? "—"}
              </span>
              <span className="rounded bg-orange-600/10 px-2 py-0.5 font-medium text-orange-600 dark:text-orange-300">
                Leitura da IA (sugestão)
              </span>
            </div>
            <p className={`mt-2 text-sm font-medium ${c.title}`}>{analysis.estagio_real}</p>
            <p className={`mt-1 text-sm ${c.text}`}>
              <span className={c.label}>Temperatura: </span>
              {analysis.temperatura}
            </p>
          </div>

          <Section title="Próxima ação" c={c} highlight>
            <p className={`text-sm font-medium ${c.title}`}>{analysis.proxima_acao}</p>
          </Section>

          <Section title="Como abordar" c={c}>
            <p className={`text-sm ${c.text}`}>{analysis.como_abordar}</p>
          </Section>

          {analysis.sinais.length > 0 && (
            <Section title="Sinais observados" c={c}>
              <ul className={`list-disc space-y-1 pl-5 text-sm ${c.text}`}>
                {analysis.sinais.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </Section>
          )}

          {analysis.objecoes.length > 0 && (
            <Section title="Objeções (ditas e prováveis)" c={c}>
              <ul className={`list-disc space-y-1 pl-5 text-sm ${c.text}`}>
                {analysis.objecoes.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Contexto" c={c}>
            <p className={`text-sm ${c.text}`}>{analysis.resumo}</p>
          </Section>

          {analysis.dados_faltando.length > 0 && (
            <div className="rounded-md border border-orange-500/40 bg-orange-500/5 p-4">
              <h3 className="text-sm font-semibold text-orange-600 dark:text-orange-300">
                Registre para melhorar a análise
              </h3>
              <ul className={`mt-2 list-disc space-y-1 pl-5 text-sm ${c.text}`}>
                {analysis.dados_faltando.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}

          {analyzedAt && (
            <p className={`text-xs ${c.muted}`}>
              Análise gerada em {formatDateTime(analyzedAt)}
              {analysis._meta?.event_count != null &&
                ` · ${analysis._meta.event_count} eventos considerados`}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Section({
  title,
  children,
  c,
  highlight = false,
}: {
  title: string
  children: React.ReactNode
  c: Record<string, string>
  highlight?: boolean
}) {
  return (
    <div className={highlight ? "rounded-md bg-orange-600/10 p-4" : ""}>
      <h3
        className={`text-xs font-semibold uppercase tracking-wide ${
          highlight ? "text-orange-600 dark:text-orange-300" : c.label
        }`}
      >
        {title}
      </h3>
      <div className="mt-1">{children}</div>
    </div>
  )
}
