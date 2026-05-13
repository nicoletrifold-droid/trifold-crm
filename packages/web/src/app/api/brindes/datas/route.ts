import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const { searchParams } = new URL(request.url)

  let query = supabase
    .from("datas_comemorativas")
    .select("*")
    .eq("org_id", appUser.org_id)
    .order("data")

  const ativa = searchParams.get("ativa")
  if (ativa === "true") query = query.eq("ativa", true)
  if (ativa === "false") query = query.eq("ativa", false)

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

  const roleError = requireRole(appUser, ["admin", "supervisor", "obras"])
  if (roleError) return roleError

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const nome = typeof body.nome === "string" ? body.nome.trim() : ""
  const data = typeof body.data === "string" ? body.data.trim() : ""

  if (!nome) return NextResponse.json({ error: "nome é obrigatório" }, { status: 400 })
  if (!data) return NextResponse.json({ error: "data é obrigatória" }, { status: 400 })

  const ativa = body.ativa !== false

  const { data: created, error } = await supabase
    .from("datas_comemorativas")
    .insert({ org_id: appUser.org_id, nome, data, ativa })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: created }, { status: 201 })
}
