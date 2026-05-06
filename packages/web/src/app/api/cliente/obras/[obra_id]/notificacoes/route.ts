import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

const DEFAULT_PREFS = {
  email_enabled: true,
  whatsapp_enabled: false,
  push_enabled: false,
  notify_nova_foto: true,
  notify_novo_documento: true,
  notify_nova_mensagem: true,
  notify_progresso: true,
}

const PREF_BOOL_FIELDS = [
  "email_enabled",
  "whatsapp_enabled",
  "push_enabled",
  "notify_nova_foto",
  "notify_novo_documento",
  "notify_nova_mensagem",
  "notify_progresso",
] as const

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ obra_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const { obra_id } = await params

  const { data: vinculo } = await supabase
    .from("cliente_obras")
    .select("obra_id")
    .eq("obra_id", obra_id)
    .eq("user_id", appUser.id)
    .single()

  if (!vinculo) {
    return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 })
  }

  const { data: prefs } = await supabase
    .from("obra_notificacao_prefs")
    .select(
      "email_enabled, whatsapp_enabled, push_enabled, notify_nova_foto, notify_novo_documento, notify_nova_mensagem, notify_progresso"
    )
    .eq("user_id", appUser.id)
    .single()

  return NextResponse.json({ prefs: prefs ?? DEFAULT_PREFS })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ obra_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const { obra_id } = await params

  const { data: vinculo } = await supabase
    .from("cliente_obras")
    .select("obra_id")
    .eq("obra_id", obra_id)
    .eq("user_id", appUser.id)
    .single()

  if (!vinculo) {
    return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 })
  }

  const body = await req.json()

  const updates: Record<string, unknown> = {}
  for (const field of PREF_BOOL_FIELDS) {
    if (typeof body[field] === "boolean") {
      updates[field] = body[field]
    }
  }

  // Atualizar phone do usuário se fornecido
  if (typeof body.phone === "string") {
    const phone = body.phone.trim() || null
    await supabase.from("users").update({ phone }).eq("id", appUser.id)
  }

  const { data: prefs, error } = await supabase
    .from("obra_notificacao_prefs")
    .upsert(
      {
        user_id: appUser.id,
        ...DEFAULT_PREFS,
        ...updates,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select(
      "email_enabled, whatsapp_enabled, push_enabled, notify_nova_foto, notify_novo_documento, notify_nova_mensagem, notify_progresso"
    )
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ prefs })
}
