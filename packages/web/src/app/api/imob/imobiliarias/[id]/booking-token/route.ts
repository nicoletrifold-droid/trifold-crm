import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { imobiliariasGuard } from "@web/lib/imob/guard"

// Story 81-4 — gerencia o token do link público de agendamento da imobiliária.
// POST { action: 'regenerate' | 'revoke' } — mesmo gate de escrita do módulo IMOB
// (imobiliariasGuard, base única da 75-148).
//  - regenerate: novo uuid (invalida o link antigo na hora)
//  - revoke: NULL (página pública passa a recusar)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await imobiliariasGuard()
  if (g.error) return g.error
  const { admin, appUser } = g
  const { id } = await params

  const body = (await req.json().catch(() => null)) as { action?: string } | null
  const action = body?.action
  if (action !== "regenerate" && action !== "revoke") {
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 })
  }

  const booking_token = action === "regenerate" ? randomUUID() : null
  const { data, error } = await admin
    .from("imobiliarias")
    .update({ booking_token, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .select("id, booking_token")
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Imobiliária não encontrada" }, { status: 404 })

  return NextResponse.json({ booking_token: data.booking_token })
}
