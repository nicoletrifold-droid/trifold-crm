"use client"

import { useEffect, useRef } from "react"
import { markChamadosResponsesSeen } from "../actions"

export function ChamadosSeenMarker() {
  const called = useRef(false)

  useEffect(() => {
    if (called.current) return
    called.current = true
    void markChamadosResponsesSeen()
  }, [])

  return null
}
