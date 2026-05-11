import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

const MAX_CONTENT_LENGTH = 2000

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ obra_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const { obra_id } = await params

  let body: { content?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const content =
    typeof body.content === "string" ? body.content.trim() : ""

  if (!content) {
    return NextResponse.json(
      { error: "Mensagem não pode estar vazia" },
      { status: 400 }
    )
  }

  if (content.length > MAX_CONTENT_LENGTH) {
    return NextResponse.json(
      { error: `Mensagem muito longa (máx. ${MAX_CONTENT_LENGTH} caracteres)` },
      { status: 400 }
    )
  }

  // RLS "obra_mensagens_insert_cliente" exige:
  // - obra_id IN cliente_obra_ids()
  // - sender_id = public_user_id() (users.id do cliente autenticado)
  // - sender_type = 'cliente'
  const { data: mensagem, error } = await supabase
    .from("obra_mensagens")
    .insert({
      obra_id,
      org_id: appUser.org_id,
      sender_id: appUser.id,
      sender_type: "cliente",
      content,
      message_type: "text",
      cliente_id: appUser.id,
    })
    .select("id, content, created_at, sender_type, message_type, cliente_id")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ mensagem }, { status: 201 })
}
