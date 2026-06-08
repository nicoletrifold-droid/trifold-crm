"use client"

import { useEffect, useRef } from "react"
import { markAlertasSeen } from "../actions"

// Componente invisível que marca alertas como vistos ao montar.
// O DB é atualizado antes do usuário navegar para outro módulo,
// garantindo que o layout vai ler seen_at correto na próxima rota.
export function AlertasSeenMarker() {
  const called = useRef(false)

  useEffect(() => {
    if (called.current) return
    called.current = true
    void markAlertasSeen()
  }, [])

  return null
}
