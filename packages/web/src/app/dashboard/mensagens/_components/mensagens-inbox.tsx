"use client"

import { useState } from "react"
import { InboxSidebar } from "./inbox-sidebar"
import { ConversationPanel } from "./conversation-panel"

interface ObraInbox {
  obra_id: string
  obra_name: string
  unread_count: number
  last_message: {
    content: string | null
    message_type: string
    sender_type: string
    created_at: string
  } | null
  clientes: { name: string }[]
}

interface MensagensInboxProps {
  initialObras: ObraInbox[]
  adminName: string
}

export function MensagensInbox({ initialObras, adminName }: MensagensInboxProps) {
  const [obras] = useState<ObraInbox[]>(initialObras)
  const [selectedObraId, setSelectedObraId] = useState<string | null>(null)

  const selectedObra = obras.find((o) => o.obra_id === selectedObraId)

  function handleSelect(obraId: string) {
    setSelectedObraId(obraId)
  }

  function handleBack() {
    setSelectedObraId(null)
  }

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
          onSelect={handleSelect}
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
          adminName={adminName}
          onBack={handleBack}
        />
      </div>
    </div>
  )
}
