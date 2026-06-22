"use client"

import { useEffect, useState } from "react"
import type { ProvenanceStatus } from "@web/lib/agent/context-builder"

// 5 min — alinhado ao TTL de cache do context-builder (Story 76-3 AC6).
const POLL_INTERVAL_MS = 5 * 60 * 1000

/**
 * useProvenanceStatus — consulta `GET /api/agent/context-meta` ao montar (quando
 * `enabled`) e a cada 5 minutos, expondo o estado de staleness/erro de sync dos
 * dados Meta Ads para a UI do chat (Story 76-3 AC1/AC6).
 *
 * Fail-safe: erro de rede/endpoint não derruba a UI nem mostra aviso falso —
 * o estado anterior é mantido (ou `null`, que oculta o banner).
 *
 * O `setInterval` é limpo no cleanup do effect; uma flag `cancelled` evita
 * `setState` após desmontagem ou após `enabled` virar false.
 *
 * @param enabled Só consulta quando true (ex.: painel de chat aberto). Default true.
 * @returns Status de proveniência, ou `null` enquanto não houver dado/aviso.
 */
export function useProvenanceStatus(enabled = true): ProvenanceStatus | null {
  const [status, setStatus] = useState<ProvenanceStatus | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    async function fetchStatus() {
      try {
        const res = await fetch("/api/agent/context-meta")
        if (!res.ok) return
        const data = (await res.json()) as ProvenanceStatus
        if (!cancelled) setStatus(data)
      } catch {
        // fail-safe: mantém o estado anterior, sem aviso falso
      }
    }

    void fetchStatus()
    const interval = setInterval(() => void fetchStatus(), POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [enabled])

  return status
}
