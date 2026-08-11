import { NextRequest, NextResponse } from "next/server"
import { fvsGuard } from "@web/lib/fvs/guard"
import { validateLocal, LOCAL_TIPOS, type LocalTipo } from "@web/lib/fvs/fvs"

// POST /api/fvs/locais — cria locais de uma obra, sempre em LOTE (1..N).
// Body: { obra_id, tipo, torre?, locais: [{ nome, pavimento? }, ...] }
// A criação unitária da UI é um lote de 1. Story 75-293 (AC3).
export async function POST(req: NextRequest) {
  const g = await fvsGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body.obra_id !== "string" || !body.obra_id) {
    return NextResponse.json({ error: "obra_id é obrigatório" }, { status: 400 })
  }
  const tipo = (body.tipo ?? "apartamento") as LocalTipo
  if (!LOCAL_TIPOS.includes(tipo)) {
    return NextResponse.json({ error: "Tipo de local inválido" }, { status: 400 })
  }
  const torre = typeof body.torre === "string" && body.torre.trim() !== "" ? body.torre.trim() : null

  if (!Array.isArray(body.locais) || body.locais.length === 0) {
    return NextResponse.json({ error: "Informe pelo menos 1 local" }, { status: 400 })
  }
  const rows: Record<string, unknown>[] = []
  for (const raw of body.locais) {
    const parsed = validateLocal(raw, { partial: false })
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    rows.push({ ...parsed.value, tipo, torre, obra_id: body.obra_id, org_id: appUser.org_id })
  }

  // A obra precisa existir E ser da org (admin client passa por cima da RLS).
  const { data: obra } = await admin
    .from("obras")
    .select("id")
    .eq("id", body.obra_id)
    .eq("org_id", appUser.org_id)
    .maybeSingle()
  if (!obra) return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 })

  const { data, error } = await admin.from("fvs_locais").insert(rows).select("*")
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Já existe um local com esse nome nesta obra" }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ locais: data })
}
