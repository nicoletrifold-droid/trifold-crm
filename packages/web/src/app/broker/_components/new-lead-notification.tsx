"use client"

import { useEffect, useRef, useState } from "react"
import { createClient } from "@web/lib/supabase/client"
import Link from "next/link"
import { X, UserPlus } from "lucide-react"

interface Lead {
  id: string
  name: string | null
  phone: string | null
}

interface Props {
  userId: string
  orgId: string
}

export function NewLeadNotification({ userId, orgId }: Props) {
  const [lead, setLead] = useState<Lead | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel(`broker-leads-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "leads",
          filter: `org_id=eq.${orgId}`,
        },
        (payload) => {
          const row = payload.new as { id: string; name: string | null; phone: string | null; assigned_broker_id: string | null }
          if (row.assigned_broker_id !== userId) return

          setLead({ id: row.id, name: row.name, phone: row.phone })

          if (typeof navigator !== "undefined" && "vibrate" in navigator) {
            navigator.vibrate([200, 100, 200])
          }

          if (timerRef.current) clearTimeout(timerRef.current)
          timerRef.current = setTimeout(() => setLead(null), 8000)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [userId, orgId])

  function dismiss() {
    if (timerRef.current) clearTimeout(timerRef.current)
    setLead(null)
  }

  if (!lead) return null

  return (
    <div className="fixed bottom-20 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 lg:bottom-6 lg:left-auto lg:right-6 lg:translate-x-0">
      <div className="flex items-start gap-3 rounded-2xl bg-orange-600 px-4 py-3.5 shadow-2xl">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/20">
          <UserPlus className="h-4 w-4 text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-100">
            Novo lead atribuído
          </p>
          <p className="mt-0.5 truncate text-sm font-bold text-white">
            {lead.name ?? "Lead sem nome"}
          </p>
          {lead.phone && (
            <p className="text-xs text-orange-100">{lead.phone}</p>
          )}
          <Link
            href={`/broker/leads/${lead.id}`}
            onClick={dismiss}
            className="mt-2 inline-block rounded-lg bg-white/20 px-3 py-1 text-xs font-semibold text-white active:bg-white/30"
          >
            Ver lead →
          </Link>
        </div>

        <button
          onClick={dismiss}
          className="shrink-0 rounded-lg p-1 text-white/80 hover:bg-white/20 active:bg-white/30"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
