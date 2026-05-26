import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

const ALLOWED_ROLES = ["admin", "supervisor", "obras"]

const PAGE_LIMIT_DEFAULT = 30
const PAGE_LIMIT_MAX = 100

export interface ClienteConversa {
  conversa_id: string // `${obra_id}::${cliente_id}`
  obra_id: string
  obra_name: string
  cliente_id: string
  cliente_name: string
  unread_count: number
  last_message_at: string
  last_message: {
    content: string | null
    message_type: string
    sender_type: string
    created_at: string
  } | null
}

// Shape de retorno da RPC `get_admin_mensagens_paginated` (FASE 1 — migration 039).
// bigint columns chegam como string no driver — Number() cast obrigatório no map.
interface AdminMensagensRpcRow {
  obra_id: string
  obra_name: string | null
  cliente_id: string
  cliente_name: string | null
  unread_count: number | string
  last_message_at: string
  last_message_content: string | null
  last_message_type: string | null
  last_message_sender_type: string | null
  total_count: number | string
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!ALLOWED_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"))
  const limit = Math.min(PAGE_LIMIT_MAX, Math.max(1, parseInt(searchParams.get("limit") ?? String(PAGE_LIMIT_DEFAULT))))
  const q = (searchParams.get("q") ?? "").trim()
  const unreadOnly = searchParams.get("unread_only") === "true"
  const fromDate = searchParams.get("from")
  const toDate = searchParams.get("to")
  const offset = (page - 1) * limit

  // Story 30.9: paginação real via RPC `get_admin_mensagens_paginated` (migration 039).
  // Elimina agregação JS + slice — GROUP BY/DISTINCT ON/LIMIT/OFFSET resolvidos no Postgres.
  const { data, error } = await supabase.rpc("get_admin_mensagens_paginated", {
    p_org_id: appUser.org_id,
    p_offset: offset,
    p_limit: limit,
    p_q: q || null,
    p_unread_only: unreadOnly,
    p_from_date: fromDate || null,
    // route.ts legado expandia `toDate` para fim do dia (`+ "T23:59:59.999Z"`).
    // Como o param `from` aparenta vir como `YYYY-MM-DD`, preservamos esse comportamento aqui.
    p_to_date: toDate ? `${toDate}T23:59:59.999Z` : null,
  })

  if (error) {
    console.error("[ADMIN_MENSAGENS] RPC get_admin_mensagens_paginated failed", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as AdminMensagensRpcRow[]

  const conversas: ClienteConversa[] = rows.map((row) => ({
    conversa_id: `${row.obra_id}::${row.cliente_id}`,
    obra_id: row.obra_id,
    obra_name: row.obra_name ?? "",
    cliente_id: row.cliente_id,
    cliente_name: row.cliente_name ?? "",
    unread_count: Number(row.unread_count),
    last_message_at: row.last_message_at,
    last_message:
      row.last_message_content != null ||
      row.last_message_type != null ||
      row.last_message_sender_type != null
        ? {
            content: row.last_message_content,
            message_type: row.last_message_type ?? "",
            sender_type: row.last_message_sender_type ?? "",
            created_at: row.last_message_at,
          }
        : null,
  }))

  // total_count vem replicado em cada linha (COUNT(*) OVER()); se rows vazias, total = 0.
  const total = rows.length > 0 ? Number(rows[0]!.total_count) : 0
  const has_more = offset + conversas.length < total

  return NextResponse.json({ conversas, total, page, limit, has_more })
}
