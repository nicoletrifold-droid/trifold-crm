import { NextRequest, NextResponse } from "next/server"
import { imobGuard } from "@web/lib/imob/guard"
import { validateImobiliaria } from "@web/lib/imob/imobiliarias"

// PATCH /api/imob/imobiliarias/[id] — edita uma imobiliária (só da própria org). Story 75-92.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await imobGuard()
  if (g.error) return g.error
  const { admin, appUser } = g
  const { id } = await params

  const parsed = validateImobiliaria(await req.json().catch(() => null), { partial: true })
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { data, error } = await admin
    .from("imobiliarias")
    .update({ ...parsed.value, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .select("*")
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Imobiliária não encontrada" }, { status: 404 })
  return NextResponse.json({ imobiliaria: data })
}
