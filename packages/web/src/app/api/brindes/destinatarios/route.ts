import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const { searchParams } = new URL(request.url)

  let query = supabase
    .from("brindes_destinatarios")
    .select("*", { count: "exact" })
    .eq("org_id", appUser.org_id)

  const obraNome = searchParams.get("obra_nome")
  if (obraNome) query = query.ilike("obra_nome", `%${obraNome}%`)

  const tipo = searchParams.get("tipo")
  if (tipo) query = query.eq("tipo", tipo)

  const nome = searchParams.get("nome")
  if (nome) query = query.ilike("nome", `%${nome}%`)

  const cidade = searchParams.get("cidade")
  if (cidade) query = query.ilike("endereco_cidade", `%${cidade}%`)

  const estado = searchParams.get("estado")
  if (estado) query = query.eq("endereco_estado", estado)

  const isExport = searchParams.get("export") === "1"

  let finalQuery = query.order("obra_nome").order("nome")

  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"))
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "50")))

  if (!isExport) {
    finalQuery = finalQuery.range((page - 1) * limit, page * limit - 1)
  }

  const { data, error, count } = await finalQuery

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [], total: count ?? 0, page, limit })
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

  const obra_nome = typeof body.obra_nome === "string" ? body.obra_nome.trim() : ""
  const tipo = typeof body.tipo === "string" ? body.tipo.trim() : ""
  const nome = typeof body.nome === "string" ? body.nome.trim() : ""

  if (!obra_nome) return NextResponse.json({ error: "obra_nome é obrigatório" }, { status: 400 })
  if (!tipo) return NextResponse.json({ error: "tipo é obrigatório" }, { status: 400 })
  if (!["mae", "pai", "outro"].includes(tipo)) {
    return NextResponse.json({ error: "tipo deve ser mae, pai ou outro" }, { status: 400 })
  }
  if (!nome) return NextResponse.json({ error: "nome é obrigatório" }, { status: 400 })

  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)

  const { data, error } = await supabase
    .from("brindes_destinatarios")
    .insert({
      org_id: appUser.org_id,
      obra_nome,
      tipo,
      nome,
      observacao: str(body.observacao),
      endereco_logradouro: str(body.endereco_logradouro),
      endereco_numero: str(body.endereco_numero),
      endereco_complemento: str(body.endereco_complemento),
      endereco_bairro: str(body.endereco_bairro),
      endereco_cidade: str(body.endereco_cidade),
      endereco_estado: str(body.endereco_estado),
      endereco_cep: str(body.endereco_cep),
      endereco_referencia: str(body.endereco_referencia),
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}
