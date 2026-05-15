import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"

const ALLOWED_ROLES = ["admin", "supervisor"]

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = requireRole(appUser, ALLOWED_ROLES)
  if (roleError) return roleError

  const { id } = await params

  // Garantir que o cliente pertence à org do usuário
  const { data: cliente, error: clienteErr } = await supabase
    .from("clientes")
    .select("id")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .maybeSingle()

  if (clienteErr) {
    return NextResponse.json({ error: clienteErr.message }, { status: 500 })
  }
  if (!cliente) {
    return NextResponse.json(
      { error: "Cliente não encontrado" },
      { status: 404 }
    )
  }

  const { data, error } = await supabase
    .from("clientes_obras_vinculos")
    .select("id, obra_id, numero_unidade, created_at, obras(id, name)")
    .eq("cliente_id", id)
    .order("created_at", { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  type Row = {
    id: string
    obra_id: string
    numero_unidade: string | null
    created_at: string
    obras: { id: string; name: string } | { id: string; name: string }[] | null
  }

  const result = ((data ?? []) as unknown as Row[]).map((row) => {
    const obra = Array.isArray(row.obras) ? row.obras[0] : row.obras
    return {
      id: row.id,
      obra_id: row.obra_id,
      numero_unidade: row.numero_unidade,
      created_at: row.created_at,
      obra: obra ? { id: obra.id, nome: obra.name } : null,
    }
  })

  return NextResponse.json({ data: result })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = requireRole(appUser, ALLOWED_ROLES)
  if (roleError) return roleError

  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const obraId = typeof body.obra_id === "string" ? body.obra_id.trim() : ""
  if (!obraId) {
    return NextResponse.json(
      { error: "obra_id é obrigatório" },
      { status: 400 }
    )
  }

  const numeroUnidade =
    typeof body.numero_unidade === "string" && body.numero_unidade.trim()
      ? body.numero_unidade.trim()
      : null

  // Validar que o cliente pertence à org
  const { data: cliente, error: clienteErr } = await supabase
    .from("clientes")
    .select("id")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .maybeSingle()

  if (clienteErr) {
    return NextResponse.json({ error: clienteErr.message }, { status: 500 })
  }
  if (!cliente) {
    return NextResponse.json(
      { error: "Cliente não encontrado" },
      { status: 404 }
    )
  }

  // Validar ownership da obra (mesma org)
  const { data: obra, error: obraErr } = await supabase
    .from("obras")
    .select("id")
    .eq("id", obraId)
    .eq("org_id", appUser.org_id)
    .maybeSingle()

  if (obraErr) {
    return NextResponse.json({ error: obraErr.message }, { status: 500 })
  }
  if (!obra) {
    return NextResponse.json(
      { error: "Obra não encontrada nesta organização" },
      { status: 404 }
    )
  }

  const { data, error } = await supabase
    .from("clientes_obras_vinculos")
    .insert({
      cliente_id: id,
      obra_id: obraId,
      numero_unidade: numeroUnidade,
    })
    .select("id, obra_id, numero_unidade, created_at")
    .single()

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Este cliente já está vinculado a esta obra" },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}
