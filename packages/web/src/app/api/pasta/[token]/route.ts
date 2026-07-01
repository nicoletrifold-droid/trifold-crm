import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"

// PATCH público — salva os campos de informação (profissão/e-mail/celular…) da pasta,
// via token. Faz merge no form_data.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const admin = createAdminClient()

  const { data: pasta } = await admin
    .from("pastas")
    .select("id, form_data")
    .eq("token", token)
    .maybeSingle()

  if (!pasta) {
    return NextResponse.json({ error: "Pasta não encontrada" }, { status: 404 })
  }

  const body = await request.json().catch(() => null)
  const incoming = body?.form_data
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
    return NextResponse.json({ error: "form_data inválido" }, { status: 400 })
  }

  // Só aceita strings (campos de texto do formulário) — evita payload arbitrário.
  const clean: Record<string, string> = {}
  for (const [k, v] of Object.entries(incoming as Record<string, unknown>)) {
    if (typeof v === "string") clean[k] = v.slice(0, 500)
  }

  const merged = { ...(pasta.form_data as Record<string, unknown>), ...clean }

  const { error } = await admin
    .from("pastas")
    .update({ form_data: merged, updated_at: new Date().toISOString() })
    .eq("id", pasta.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
