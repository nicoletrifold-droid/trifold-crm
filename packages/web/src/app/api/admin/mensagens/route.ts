import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

const ALLOWED_ROLES = ["admin", "supervisor"]

const PAGE_LIMIT_DEFAULT = 20
const PAGE_LIMIT_MAX = 50

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
  const q = (searchParams.get("q") ?? "").trim().toLowerCase()
  const unreadOnly = searchParams.get("unread_only") === "true"
  const obraId = searchParams.get("obra_id") ?? null
  const fromDate = searchParams.get("from") ?? null
  const toDate = searchParams.get("to") ?? null
  const offset = (page - 1) * limit

  // Load message metadata for the org (lightweight: only aggregation fields)
  let msgQuery = supabase
    .from("obra_mensagens")
    .select("obra_id, sender_type, read_at, created_at, content, message_type")
    .eq("org_id", appUser.org_id)
    .order("created_at", { ascending: false })

  if (obraId) msgQuery = msgQuery.eq("obra_id", obraId)
  if (fromDate) msgQuery = msgQuery.gte("created_at", fromDate)
  if (toDate) msgQuery = msgQuery.lte("created_at", toDate + "T23:59:59.999Z")

  const { data: msgs, error } = await msgQuery

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Aggregate by obra (first message in DESC order = most recent per obra)
  const obraMap = new Map<string, ObraInbox>()
  for (const msg of msgs ?? []) {
    if (!obraMap.has(msg.obra_id)) {
      obraMap.set(msg.obra_id, {
        obra_id: msg.obra_id,
        obra_name: "",
        last_message_at: msg.created_at,
        unread_count: 0,
        last_message: {
          content: msg.content,
          message_type: msg.message_type,
          sender_type: msg.sender_type,
          created_at: msg.created_at,
        },
        clientes: [],
      })
    }
    if (msg.sender_type === "cliente" && !msg.read_at) {
      obraMap.get(msg.obra_id)!.unread_count++
    }
  }

  const obraIds = [...obraMap.keys()]

  if (obraIds.length === 0) {
    return NextResponse.json({ obras: [], total: 0, page, limit, has_more: false })
  }

  // Resolve obra names
  const { data: obrasRaw } = await supabase
    .from("obras")
    .select("id, name")
    .in("id", obraIds)

  for (const o of obrasRaw ?? []) {
    const entry = obraMap.get(o.id)
    if (entry) entry.obra_name = o.name
  }

  // Resolve clientes
  const { data: clientesRaw } = await supabase
    .from("cliente_obras")
    .select("obra_id, users(id, name)")
    .in("obra_id", obraIds)

  for (const row of clientesRaw ?? []) {
    const u = Array.isArray(row.users) ? row.users[0] : row.users
    if (u) obraMap.get(row.obra_id)?.clientes.push({ id: u.id as string, name: u.name as string })
  }

  // Build and filter list
  let obras = [...obraMap.values()]

  if (unreadOnly) {
    obras = obras.filter((o) => o.unread_count > 0)
  }

  if (q) {
    obras = obras.filter(
      (o) =>
        o.obra_name.toLowerCase().includes(q) ||
        o.clientes.some((c) => c.name.toLowerCase().includes(q))
    )
  }

  // Sort by most recent message
  obras.sort(
    (a, b) =>
      new Date(b.last_message_at).getTime() -
      new Date(a.last_message_at).getTime()
  )

  const total = obras.length
  const paginated = obras.slice(offset, offset + limit)
  const has_more = offset + limit < total

  return NextResponse.json({ obras: paginated, total, page, limit, has_more })
}
