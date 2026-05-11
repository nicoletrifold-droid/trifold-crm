"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { InboxSidebar } from "./inbox-sidebar"
import { ConversationPanel } from "./conversation-panel"
import type { ClienteConversa } from "@web/app/api/admin/mensagens/route"

export interface MensagensFilters {
  q: string
  unread_only: boolean
}

interface MensagensInboxProps {
  initialConversas: ClienteConversa[]
  initialTotal: number
  adminName: string
}

const LIMIT = 30

export function MensagensInbox({
  initialConversas,
  initialTotal,
  adminName,
}: MensagensInboxProps) {
  const [conversas, setConversas] = useState<ClienteConversa[]>(initialConversas)
  const [total, setTotal] = useState(initialTotal)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [selectedConversa, setSelectedConversa] = useState<ClienteConversa | null>(null)
  const [filters, setFilters] = useState<MensagensFilters>({
    q: "",
    unread_only: false,
  })

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedQ, setDebouncedQ] = useState("")

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQ(filters.q), 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [filters.q])

  const fetchConversas = useCallback(
    async (targetPage: number) => {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          page: String(targetPage),
          limit: String(LIMIT),
        })
        if (debouncedQ) params.set("q", debouncedQ)
        if (filters.unread_only) params.set("unread_only", "true")

        const res = await fetch(`/api/admin/mensagens?${params}`)
        if (!res.ok) return
        const data = await res.json()
        setConversas(data.conversas ?? [])
        setTotal(data.total ?? 0)
      } finally {
        setLoading(false)
      }
    },
    [debouncedQ, filters.unread_only]
  )

  useEffect(() => {
    setPage(1)
    fetchConversas(1)
  }, [fetchConversas])

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  function handlePageChange(next: number) {
    if (next < 1 || next > totalPages) return
    setPage(next)
    fetchConversas(next)
  }

  function handleSelect(conversa: ClienteConversa) {
    setSelectedConversa(conversa)
  }

  function handleBack() {
    setSelectedConversa(null)
  }

  return (
    <div className="flex h-[calc(100vh-12rem)] overflow-hidden rounded-lg border border-gray-200 bg-white">
      {/* Sidebar */}
      <div
        className={`w-80 flex-shrink-0 border-r border-gray-200 ${
          selectedConversa ? "hidden lg:flex" : "flex"
        } flex-col`}
      >
        <InboxSidebar
          conversas={conversas}
          selectedConversaId={selectedConversa?.conversa_id ?? null}
          loading={loading}
          filters={filters}
          page={page}
          totalPages={totalPages}
          total={total}
          onSelect={handleSelect}
          onFiltersChange={setFilters}
          onPageChange={handlePageChange}
        />
      </div>

      {/* Painel de conversa */}
      <div
        className={`flex-1 flex-col ${
          !selectedConversa ? "hidden lg:flex" : "flex"
        }`}
      >
        <ConversationPanel
          obraId={selectedConversa?.obra_id ?? null}
          obraName={selectedConversa?.obra_name}
          clienteId={selectedConversa?.cliente_id ?? null}
          clienteName={selectedConversa?.cliente_name}
          adminName={adminName}
          onBack={handleBack}
        />
      </div>
    </div>
  )
}
