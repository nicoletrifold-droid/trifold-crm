"use client"

import { useEffect, useState } from "react"
import { QUALIFICACAO_COMERCIAL_LABELS } from "@web/lib/constants"

interface HistoricoItem {
  id: string
  user_name: string
  created_at: string
  old_value: string | null
  new_value: string | null
}

function formatValue(value: string | null): string {
  if (!value) return "Não definido"
  return QUALIFICACAO_COMERCIAL_LABELS[value] ?? value
}

/**
 * Story 84-2 (Epic 84) — histórico de mudanças da Qualificação Comercial.
 * Busca de `GET /api/leads/[id]/qualificacao-historico` (gate `leads.qualificacao` em
 * código; sem esse acesso a rota devolve 403 e esta seção some silenciosamente).
 */
export function QualificacaoHistorico({ leadId }: { leadId: string }) {
  const [items, setItems] = useState<HistoricoItem[] | null>(null)
  const [forbidden, setForbidden] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/leads/${leadId}/qualificacao-historico`)
      .then((res) => {
        if (res.status === 403) throw new Error("forbidden")
        if (!res.ok) throw new Error("error")
        return res.json() as Promise<{ historico: HistoricoItem[] }>
      })
      .then((json) => {
        if (!cancelled) setItems(json.historico)
      })
      .catch(() => {
        if (!cancelled) setForbidden(true)
      })
    return () => {
      cancelled = true
    }
  }, [leadId])

  if (forbidden) return null

  if (!items) {
    return <p className="text-xs text-stone-400 dark:text-stone-500">Carregando histórico…</p>
  }

  if (items.length === 0) {
    return <p className="text-xs text-stone-400 dark:text-stone-500">Nenhuma mudança registrada ainda.</p>
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id} className="text-xs text-stone-600 dark:text-stone-300">
          <span className="font-semibold">{item.user_name}</span>{" "}
          alterou de <span className="font-medium">{formatValue(item.old_value)}</span>{" "}
          para <span className="font-medium">{formatValue(item.new_value)}</span>
          <span className="ml-1 text-stone-400 dark:text-stone-500">
            ·{" "}
            {new Date(item.created_at).toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      ))}
    </div>
  )
}
