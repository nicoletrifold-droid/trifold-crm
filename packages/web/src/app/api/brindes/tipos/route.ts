import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { canAccess } from "@web/lib/permissions"

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const { searchParams } = new URL(request.url)

  let query = supabase
    .from("brindes_tipos")
    .select("*")
    .eq("org_id", appUser.org_id)
    .order("nome")

  const ativo = searchParams.get("ativo")
  if (ativo === "true") query = query.eq("ativo", true)
  if (ativo === "false") query = query.eq("ativo", false)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!(await canAccess(appUser.id, appUser.org_id, "brindes"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const nome = typeof body.nome === "string" ? body.nome.trim() : ""
  if (!nome) return NextResponse.json({ error: "nome é obrigatório" }, { status: 400 })

  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)

  const { data, error } = await supabase
    .from("brindes_tipos")
    .insert({
      org_id: appUser.org_id,
      nome,
      descricao: str(body.descricao),
      tamanho: str(body.tamanho),
      cor: str(body.cor),
    })
    .select()
    .single()

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: `Já existe "${nome}" com esse mesmo tamanho e cor` },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}
