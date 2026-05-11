"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { InboxSidebar } from "./inbox-sidebar"
import { ConversationPanel } from "./conversation-panel"

interface ObraInbox {
  obra_id: string
  obra_name: string
  last_message_at: string
  unread_count: number
  last_message: {
    content: string | null
    message_type: string
    sender_type: string
    created_at: string
  } | null
  clientes: { id: string; name: string }[]
}

export interface MensagensFilters {
  q: string
  unread_only: boolean
  from: string
  to: string
}

interface MensagensInboxProps {
  initialObras: ObraInbox[]
  initialTotal: number
  adminName: string
}

const LIMIT = 20

export function MensagensInbox({
  initialObras,
  initialTotal,
  adminName,
}: MensagensInboxProps) {
  const [obras, setObras] = useState<ObraInbox[]>(initialObras)
  const [total, setTotal] = useState(initialTotal)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [selectedObraId, setSelectedObraId] = useState<string | null>(null)
  const [filters, setFilters] = useState<MensagensFilters>({
    q: "",
    unread_only: false,
    from: "",
    to: "",
  })

  // Debounce search text to avoid a fetch on every keystroke
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedQ, setDebouncedQ] = useState("")

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQ(filters.q), 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [filters.q])

  const fetchObras = useCallback(
    async (targetPage: number) => {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          page: String(targetPage),
          limit: String(LIMIT),
        })
        if (debouncedQ) params.set("q", debouncedQ)
        if (filters.unread_only) params.set("unread_only", "true")
        if (filters.from) params.set("from", filters.from)
        if (filters.to) params.set("to", filters.to)

        const res = await fetch(`/api/admin/mensagens?${params}`)
        if (!res.ok) return
        const data = await res.json()
        setObras(data.obras ?? [])
        setTotal(data.total ?? 0)
      } finally {
        setLoading(false)
      }
    },
    [debouncedQ, filters.unread_only, filters.from, filters.to]
  )

  // Re-fetch when filters change (reset to page 1)
  useEffect(() => {
    setPage(1)
    fetchObras(1)
  }, [fetchObras])

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  function handlePageChange(next: number) {
    if (next < 1 || next > totalPages) return
    setPage(next)
    fetchObras(next)
  }

  function handleSelect(obraId: string) {
    setSelectedObraId(obraId)
  }

  function handleBack() {
    setSelectedObraId(null)
  }

  const selectedObra = obras.find((o) => o.obra_id === selectedObraId)

  return (
    <div className="flex h-[calc(100vh-12rem)] overflow-hidden rounded-lg border border-gray-200 bg-white">
      {/* Sidebar — hidden on mobile when obra is selected */}
      <div
        className={`w-80 flex-shrink-0 border-r border-gray-200 ${
          selectedObraId ? "hidden lg:flex" : "flex"
        } flex-col`}
      >
        <InboxSidebar
          obras={obras}
          selectedObraId={selectedObraId}
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

      {/* Main panel — hidden on mobile when nothing selected */}
      <div
        className={`flex-1 flex-col ${
          !selectedObraId ? "hidden lg:flex" : "flex"
        }`}
      >
        <ConversationPanel
          obraId={selectedObraId}
          obraName={selectedObra?.obra_name}
          clientes={selectedObra?.clientes ?? []}
          adminName={adminName}
          onBack={handleBack}
        />
      </div>
    </div>
  )
}
