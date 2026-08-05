"use client"

import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { useCallback } from "react"

import { CALOR_LABELS, CALOR_VALUES, parseCalor } from "@web/lib/leads/calor"
import { QUALIFICACAO_LABELS, QUALIFICACAO_VALUES, parseQualificacao } from "@web/lib/leads/qualificacao"

interface Stage { id: string; name: string; color: string | null }
interface Property { id: string; name: string }
interface Broker { id: string; name: string }
interface Source { value: string; label: string }

interface LeadFiltersProps {
  stages: Stage[]
  properties: Property[]
  brokers?: Broker[]
  /** Opções do filtro de Origem — só renderiza o dropdown quando passado. */
  sources?: Source[]
  /** Adiciona a opção "Sem corretor" no filtro de Corretor (Conversas). */
  includeUnassigned?: boolean
  /** Mostra o filtro "Atendimento" (Nicole IA / Humano) — usado nas Conversas. */
  showAtendimento?: boolean
  /** Story 75-236 — filtro de temperatura (Calor do Lead), opt-in: só a tela de Leads. */
  showCalor?: boolean
  /** Story 84-2 (Epic 84) — filtro de Qualificação Comercial, opt-in: combinável com showCalor. */
  showQualificacao?: boolean
  stageParam?: string
  propertyParam?: string
  daysParam?: string
  brokerParam?: string
  sourceParam?: string
  iaParam?: string
  calorParam?: string
  qualificacaoParam?: string
  /** Mostra os campos de período de captura (De/Até) — usado na tela de Leads (Story 75-94). */
  showDateRange?: boolean
  dateFromParam?: string
  dateToParam?: string
}

export function LeadFilters({
  stages,
  properties,
  brokers,
  sources,
  includeUnassigned = false,
  showAtendimento = false,
  showCalor = false,
  showQualificacao = false,
  stageParam = "stage",
  propertyParam = "property",
  daysParam = "days",
  brokerParam = "broker_id",
  sourceParam = "source",
  iaParam = "ia",
  calorParam = "calor",
  qualificacaoParam = "qualificacao",
  showDateRange = false,
  dateFromParam = "date_from",
  dateToParam = "date_to",
}: LeadFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const activeStage = searchParams.get(stageParam) ?? ""
  const activeProperty = searchParams.get(propertyParam) ?? ""
  const activeDays = searchParams.get(daysParam) ?? ""
  const activeBroker = searchParams.get(brokerParam) ?? ""
  const activeSource = searchParams.get(sourceParam) ?? ""
  const activeIa = searchParams.get(iaParam) ?? ""
  // Valor fora da whitelist (URL forjada) cai em "Todos" — o select nunca fica
  // em branco mostrando um filtro que o servidor ignorou (QA 75-236).
  const activeCalor = parseCalor(searchParams.get(calorParam)) ?? ""
  const activeQualificacao = parseQualificacao(searchParams.get(qualificacaoParam)) ?? ""
  const activeDateFrom = searchParams.get(dateFromParam) ?? ""
  const activeDateTo = searchParams.get(dateToParam) ?? ""

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) params.set(key, value)
      else params.delete(key)
      params.delete("page")
      router.push(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams]
  )

  const selectClass =
    "h-8 rounded-lg border border-gray-300 bg-white px-2.5 py-0 text-xs text-gray-700 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:focus:border-orange-500 dark:focus:ring-orange-500"

  const hasFilters = activeStage || activeProperty || activeDays || activeBroker || activeSource || activeIa || activeCalor || activeQualificacao || activeDateFrom || activeDateTo

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Etapa */}
      <select value={activeStage} onChange={(e) => setParam(stageParam, e.target.value)} className={selectClass}>
        <option value="">Etapa: Todas</option>
        {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>

      {/* Empreendimento */}
      {properties.length > 0 && (
        <select value={activeProperty} onChange={(e) => setParam(propertyParam, e.target.value)} className={selectClass}>
          <option value="">Empreendimento: Todos</option>
          {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}

      {/* Corretor — só aparece quando passado via prop (admin/supervisor/gerente-comercial) */}
      {brokers && brokers.length > 0 && (
        <select value={activeBroker} onChange={(e) => setParam(brokerParam, e.target.value)} className={selectClass}>
          <option value="">Corretor: Todos</option>
          {includeUnassigned && <option value="none">Sem corretor</option>}
          {brokers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      )}

      {/* Origem — só aparece quando passado via prop (tela de Leads) */}
      {sources && sources.length > 0 && (
        <select value={activeSource} onChange={(e) => setParam(sourceParam, e.target.value)} className={selectClass}>
          <option value="">Origem: Todas</option>
          {sources.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      )}

      {/* Calor do Lead (percepção do corretor) — Story 75-236, opt-in.
          Valores espelham o enum interest_level; "none" = ainda não definido. */}
      {showCalor && (
        <select value={activeCalor} onChange={(e) => setParam(calorParam, e.target.value)} className={selectClass}>
          <option value="">Calor: Todos</option>
          {CALOR_VALUES.map((v) => <option key={v} value={v}>{CALOR_LABELS[v]}</option>)}
        </select>
      )}

      {/* Qualificação Comercial — Story 84-2 (Epic 84), opt-in, combinável com o Calor acima.
          Valores espelham o enum qualificacao_comercial; "none" = ainda não avaliado. */}
      {showQualificacao && (
        <select value={activeQualificacao} onChange={(e) => setParam(qualificacaoParam, e.target.value)} className={selectClass}>
          <option value="">Qualificação: Todas</option>
          {QUALIFICACAO_VALUES.map((v) => <option key={v} value={v}>{QUALIFICACAO_LABELS[v]}</option>)}
        </select>
      )}

      {/* Atendimento (Nicole IA / Humano) — só aparece quando habilitado (Conversas) */}
      {showAtendimento && (
        <select value={activeIa} onChange={(e) => setParam(iaParam, e.target.value)} className={selectClass}>
          <option value="">Atendimento: Todos</option>
          <option value="ia">Apenas IA</option>
          <option value="humano_ia">Humano + IA</option>
          <option value="humano">Humano</option>
        </select>
      )}

      {/* Sem contato */}
      <select value={activeDays} onChange={(e) => setParam(daysParam, e.target.value)} className={selectClass}>
        <option value="">Sem contato: Qualquer</option>
        <option value="3">Parado 3+ dias</option>
        <option value="7">Parado 7+ dias</option>
        <option value="30">Parado 30+ dias</option>
      </select>

      {/* Período de captura (De/Até) — Story 75-94, opt-in */}
      {showDateRange && (
        <>
          <label className="flex items-center gap-1 text-xs text-stone-500 dark:text-stone-400">
            Captura de
            <input
              type="date"
              value={activeDateFrom}
              max={activeDateTo || undefined}
              onChange={(e) => setParam(dateFromParam, e.target.value)}
              className={selectClass}
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-stone-500 dark:text-stone-400">
            até
            <input
              type="date"
              value={activeDateTo}
              min={activeDateFrom || undefined}
              onChange={(e) => setParam(dateToParam, e.target.value)}
              className={selectClass}
            />
          </label>
        </>
      )}

      {/* Limpar */}
      {hasFilters && (
        <button
          onClick={() => {
            const params = new URLSearchParams(searchParams.toString())
            params.delete(stageParam)
            params.delete(propertyParam)
            params.delete(daysParam)
            params.delete(brokerParam)
            params.delete(sourceParam)
            params.delete(iaParam)
            params.delete(calorParam)
            params.delete(qualificacaoParam)
            params.delete(dateFromParam)
            params.delete(dateToParam)
            params.delete("page")
            router.push(`${pathname}?${params.toString()}`)
          }}
          className="text-xs text-stone-500 hover:text-orange-400 underline underline-offset-2"
        >
          Limpar
        </button>
      )}
    </div>
  )
}
