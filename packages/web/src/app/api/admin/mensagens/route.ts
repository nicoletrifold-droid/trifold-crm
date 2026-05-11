import { NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

const ALLOWED_ROLES = ["admin", "supervisor"]

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

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!ALLOWED_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data: msgs, error } = await supabase
    .from("obra_mensagens")
    .select("obra_id, content, message_type, sender_type, read_at, created_at, obras(name)")
    .eq("org_id", appUser.org_id)
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const obraMap = new Map<string, ObraInbox>()
  for (const msg of msgs ?? []) {
    const obraName = (msg.obras as { name: string }[] | null)?.[0]?.name ?? "Obra"
    if (!obraMap.has(msg.obra_id)) {
      obraMap.set(msg.obra_id, {
        obra_id: msg.obra_id,
        obra_name: obraName,
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
  if (obraIds.length > 0) {
    const { data: clientesRaw } = await supabase
      .from("cliente_obras")
      .select("obra_id, users(id, name)")
      .in("obra_id", obraIds)

    for (const row of clientesRaw ?? []) {
      const u = Array.isArray(row.users) ? row.users[0] : row.users
      if (u) obraMap.get(row.obra_id)?.clientes.push({ name: u.name as string })
    }
  }

  const obras = [...obraMap.values()]

  return NextResponse.json({ obras })
}
