"use client"

// Story 75-341 — a régua do Pipeline passou a ABRIR a lista de cada número.
//
// Antes o card inteiro era um `<Link>` para `/dashboard/pipeline?stage=…`, que é
// outra coisa: o Pipeline mostra o quadro de HOJE, sem recorte de período nem os
// filtros da tela. Quem clicava em "chegaram" no período de 30 dias caía num
// quadro que não tinha como reproduzir aquele número. Agora cada número abre
// exatamente o seu conjunto, e o link para o Pipeline continua disponível dentro
// do painel.

import { useState } from "react"
import type { PipelineRow } from "@web/lib/analytics/funnel-reached"
import { StageLeadsDrawer, type StageLeadsAlvo } from "./stage-leads-drawer"

interface Props {
  rows: PipelineRow[]
  /** Entradas do período — a linha "agora" fecha esse total. */
  base: number
  from: string
  to: string
  filterQuery?: string
  rangeLabel: string
}

export function PipelineRuler({ rows, base, from, to, filterQuery, rangeLabel }: Props) {
  const [alvo, setAlvo] = useState<StageLeadsAlvo | null>(null)

  const abrir = (row: PipelineRow, modo: "chegaram" | "agora", valor: number) => {
    if (valor <= 0) return // etapa vazia não abre painel vazio
    setAlvo({ stageId: row.id, modo, label: row.name, esperado: valor })
  }

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
      <h2 className="text-base font-semibold text-gray-900 dark:text-stone-100">
        Pipeline{" "}
        <span className="text-xs font-normal text-stone-400">
          · {rangeLabel} · {base} entradas no período
        </span>
      </h2>
      <p className="mb-3 text-xs text-stone-500 dark:text-stone-400">
        <strong className="font-semibold">agora</strong> = onde o lead está hoje (cada lead conta uma
        vez, a linha fecha as {base} entradas) · <strong className="font-semibold">chegaram</strong> =
        passaram por aqui (o mesmo lead entra em várias etapas, então esta linha não soma) ·{" "}
        <span className="text-stone-400">clique num número para ver os leads</span>
      </p>
      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-1.5">
          {rows.map((stage) => (
            <div
              key={stage.id}
              className="flex-1 rounded-md px-2.5 py-2 text-center"
              style={{ backgroundColor: `${stage.color}15` }}
            >
              <p className="whitespace-nowrap text-[11px] font-medium" style={{ color: stage.color }}>
                {stage.name}
              </p>
              <button
                type="button"
                onClick={() => abrir(stage, "agora", stage.agora)}
                disabled={stage.agora <= 0}
                aria-label={`Ver os ${stage.agora} leads que estão em ${stage.name} agora`}
                className="mt-0.5 block w-full rounded text-base font-bold tabular-nums text-gray-900 enabled:hover:underline disabled:cursor-default dark:text-stone-100"
              >
                {stage.agora}
              </button>
              <button
                type="button"
                onClick={() => abrir(stage, "chegaram", stage.chegaram)}
                disabled={stage.chegaram <= 0}
                aria-label={`Ver os ${stage.chegaram} leads que chegaram a ${stage.name}`}
                className="block w-full rounded text-[11px] font-semibold tabular-nums text-stone-500 enabled:hover:underline disabled:cursor-default dark:text-stone-400"
              >
                {stage.chegaram} <span className="font-normal">chegaram</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {alvo && (
        <StageLeadsDrawer
          key={`${alvo.stageId}-${alvo.modo}`}
          alvo={alvo}
          from={from}
          to={to}
          filterQuery={filterQuery}
          rangeLabel={rangeLabel}
          onClose={() => setAlvo(null)}
        />
      )}
    </div>
  )
}
