import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { notifyClientes } from "@web/lib/notificacoes"

const ALLOWED_ROLES = ["admin", "supervisor"]

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
    })
    .select("id, content, created_at, sender_type, message_type, sender_display_name")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fire-and-forget: notificar clientes vinculados
  notifyClientes(obra_id, "nova_mensagem", obra.name).catch(() => {})

  return NextResponse.json({ mensagem }, { status: 201 })
}
