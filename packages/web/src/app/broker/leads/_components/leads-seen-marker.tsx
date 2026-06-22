"use client"

import { useEffect, useRef } from "react"
import { markLeadsSeen } from "../actions"

// Story 75-8 — componente invisível que marca "Meus Leads" como visto ao montar,
// zerando o badge de novos leads distribuídos. Mesma mecânica do AlertasSeenMarker.
export function LeadsSeenMarker() {
  const called = useRef(false)

  useEffect(() => {
    if (called.current) return
    called.current = true
    void markLeadsSeen()
  }, [])

  return null
}
