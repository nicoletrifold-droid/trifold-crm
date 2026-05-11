import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

const ALLOWED_ROLES = ["admin", "supervisor"]

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
  const fromDate = searchParams.get("from") ?? null
  const toDate = searchParams.get("to") ?? null
  const offset = (page - 1) * limit

  // Load all messages that have a client context (cliente_id NOT NULL)
  let msgQuery = supabase
    .from("obra_mensagens")
    .select("obra_id, cliente_id, content, message_type, sender_type, read_at, created_at")
    .eq("org_id", appUser.org_id)
    .not("cliente_id", "is", null)
    .order("created_at", { ascending: false })

  if (fromDate) msgQuery = msgQuery.gte("created_at", fromDate)
  if (toDate) msgQuery = msgQuery.lte("created_at", toDate + "T23:59:59.999Z")

  const { data: msgs, error } = await msgQuery

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Aggregate by (obra_id, cliente_id) — first message in DESC = most recent
  const conversaMap = new Map<string, ClienteConversa>()
  for (const msg of msgs ?? []) {
    const key = `${msg.obra_id}::${msg.cliente_id}`
    if (!conversaMap.has(key)) {
      conversaMap.set(key, {
        conversa_id: key,
        obra_id: msg.obra_id,
        obra_name: "",
        cliente_id: msg.cliente_id as string,
        cliente_name: "",
        unread_count: 0,
        last_message_at: msg.created_at,
        last_message: {
          content: msg.content,
          message_type: msg.message_type,
          sender_type: msg.sender_type,
          created_at: msg.created_at,
        },
      })
    }
    if (msg.sender_type === "cliente" && !msg.read_at) {
      conversaMap.get(key)!.unread_count++
    }
  }

  if (conversaMap.size === 0) {
    return NextResponse.json({ conversas: [], total: 0, page, limit, has_more: false })
  }

  const obraIds = [...new Set([...conversaMap.values()].map((c) => c.obra_id))]
  const clienteIds = [...new Set([...conversaMap.values()].map((c) => c.cliente_id))]

  // Resolve obra names
  const { data: obrasRaw } = await supabase
    .from("obras")
    .select("id, name")
    .in("id", obraIds)

  const obraNameMap = new Map<string, string>()
  for (const o of obrasRaw ?? []) obraNameMap.set(o.id, o.name)
  for (const c of conversaMap.values()) c.obra_name = obraNameMap.get(c.obra_id) ?? ""

  // Resolve client names
  const { data: usersRaw } = await supabase
    .from("users")
    .select("id, name")
    .in("id", clienteIds)

  const userNameMap = new Map<string, string>()
  for (const u of usersRaw ?? []) userNameMap.set(u.id, u.name ?? "")
  for (const c of conversaMap.values()) c.cliente_name = userNameMap.get(c.cliente_id) ?? ""

  // Build, filter and sort
  let conversas = [...conversaMap.values()]

  if (unreadOnly) conversas = conversas.filter((c) => c.unread_count > 0)

  if (q) {
    conversas = conversas.filter(
      (c) =>
        c.cliente_name.toLowerCase().includes(q) ||
        c.obra_name.toLowerCase().includes(q)
    )
  }

  conversas.sort(
    (a, b) =>
      new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
  )

  const total = conversas.length
  const paginated = conversas.slice(offset, offset + limit)
  const has_more = offset + limit < total

  return NextResponse.json({ conversas: paginated, total, page, limit, has_more })
}
