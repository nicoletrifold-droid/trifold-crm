"use client"

import { useEffect, useRef } from "react"

interface ChatScrollAreaProps {
  /**
   * Número de mensagens renderizadas. Usado como dependência do auto-scroll:
   * quando muda (nova mensagem após `router.refresh()`), o container rola
   * suavemente até o final.
   */
  messageCount: number
  className?: string
  children: React.ReactNode
}

/**
 * Story 63-6 — Wrapper client para a área rolável de mensagens do chat do
 * corretor. A página (`page.tsx`) é Server Component; este wrapper adiciona o
 * comportamento de auto-scroll sem precisar transformar a página inteira em
 * client.
 *
 * Rola APENAS o próprio container (`scrollTo` no elemento), nunca a janela —
 * evita que a página "pule" para o chat no carregamento inicial (gotcha da
 * story: não usar smooth-scroll confuso no primeiro render).
 */
export function ChatScrollArea({ messageCount, className, children }: ChatScrollAreaProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isFirstRender = useRef(true)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.scrollTo({
      top: el.scrollHeight,
      // Primeiro render: posiciona instantaneamente no final (sem animação
      // confusa). Atualizações (nova mensagem): rola suavemente.
      behavior: isFirstRender.current ? "auto" : "smooth",
    })
    isFirstRender.current = false
  }, [messageCount])

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  )
}
