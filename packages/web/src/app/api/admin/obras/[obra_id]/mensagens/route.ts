import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { notifyClientes } from "@web/lib/notificacoes"

const ALLOWED_ROLES = ["admin", "supervisor", "broker"]

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ obra_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!ALLOWED_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { obra_id } = await params

  const { data: obra } = await supabase
    .from("obras")
    .select("id")
    .eq("id", obra_id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!obra) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const { searchParams } = new URL(req.url)
  const clienteId = searchParams.get("cliente_id") ?? null

  let query = supabase
    .from("obra_mensagens")
    .select(
      "id, content, message_type, storage_path, sender_type, created_at, sender_display_name, cliente_id"
    )
    .eq("obra_id", obra_id)
    .order("created_at", { ascending: true })

  if (clienteId) {
    query = query.eq("cliente_id", clienteId)
  }

  const { data: mensagens, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const canSeeSenderName = ["admin", "supervisor", "obras"].includes(appUser.role)
  const result = (mensagens ?? []).map((m) => ({
    ...m,
    sender_display_name: canSeeSenderName ? m.sender_display_name : null,
  }))

  return NextResponse.json({ mensagens: result })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ obra_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!ALLOWED_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { obra_id } = await params

  const { data: obra } = await supabase
    .from("obras")
    .select("id, name, org_id")
    .eq("id", obra_id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!obra) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const body = await req.json()
  const content = typeof body.content === "string" ? body.content.trim() : ""
  const clienteId = typeof body.cliente_id === "string" ? body.cliente_id.trim() : null

  if (!content) {
    return NextResponse.json(
      { error: "Mensagem não pode ser vazia" },
      { status: 400 }
    )
  }
  if (content.length > 2000) {
    return NextResponse.json(
      { error: "Mensagem excede 2000 caracteres" },
      { status: 400 }
    )
  }
  if (!clienteId) {
    return NextResponse.json(
      { error: "cliente_id é obrigatório" },
      { status: 400 }
    )
  }

  // Validar que clienteId é um usuário válido na org
  const { data: clienteUser } = await supabase
    .from("users")
    .select("id")
    .eq("id", clienteId)
    .eq("org_id", obra.org_id)
    .single()

  if (!clienteUser) {
    return NextResponse.json(
      { error: "Cliente não encontrado nesta organização" },
      { status: 400 }
    )
  }

  // Garantir vínculo cliente↔obra (upsert defensivo — restaura acesso ao portal se perdido)
  await supabase
    .from("cliente_obras")
    .upsert(
      { user_id: clienteId, obra_id, is_primary: true },
      { onConflict: "user_id,obra_id", ignoreDuplicates: true }
    )

  const { data: mensagem, error } = await supabase
    .from("obra_mensagens")
    .insert({
      obra_id,
      org_id: obra.org_id,
      sender_id: appUser.id,
      sender_type: "equipe",
      message_type: "text",
      content,
      sender_display_name: appUser.name,
      cliente_id: clienteId,
    })
    .select("id, content, created_at, sender_type, message_type, sender_display_name, cliente_id")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fire-and-forget: notificar clientes vinculados
  notifyClientes(obra_id, "nova_mensagem", obra.name).catch(() => {})

  return NextResponse.json({ mensagem }, { status: 201 })
}
