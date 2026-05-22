import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { logAudit, getRequestIp } from "@web/lib/audit"

const ALLOWED_ROLES = ["admin", "supervisor", "obras"]

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = requireRole(appUser, ALLOWED_ROLES)
  if (roleError) return roleError

  const { searchParams } = new URL(request.url)

  // Pagination
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"))
  const perPage = Math.min(
    200,
    Math.max(1, parseInt(searchParams.get("per_page") ?? "50"))
  )

  // Optional filter by obra_id — resolve cliente_ids via vínculos first
  const obraId = searchParams.get("obra_id")
  let restrictToClienteIds: string[] | null = null
  if (obraId) {
    const { data: vinculoRows, error: vincErr } = await supabase
      .from("clientes_obras_vinculos")
      .select("cliente_id")
      .eq("obra_id", obraId)
    if (vincErr) {
      return NextResponse.json({ error: vincErr.message }, { status: 500 })
    }
    restrictToClienteIds = (vinculoRows ?? []).map((r) => r.cliente_id)
    // Short-circuit: if filter yields no IDs, return empty result
    if (restrictToClienteIds.length === 0) {
      return NextResponse.json({
        data: [],
        total: 0,
        page,
        per_page: perPage,
      })
    }
  }

  let query = supabase
    .from("clientes")
    .select(
      "*, clientes_obras_vinculos(id, obra_id, numero_unidade, obras(id, name))",
      { count: "exact" }
    )
    .eq("org_id", appUser.org_id)
    .order("nome", { ascending: true })

  // Text search (nome / email)
  const q = searchParams.get("q")
  if (q) {
    const sanitized = q.replace(/[%,]/g, "")
    if (sanitized) {
      query = query.or(`nome.ilike.%${sanitized}%,email.ilike.%${sanitized}%`)
    }
  }

  if (restrictToClienteIds) {
    query = query.in("id", restrictToClienteIds)
  }

  query = query.range((page - 1) * perPage, page * perPage - 1)

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    data: data ?? [],
    total: count ?? 0,
    page,
    per_page: perPage,
  })
}

const ALLOWED_FIELDS = [
  "nome",
  "cpf",
  "rg",
  "email",
  "telefone",
  "whatsapp",
  "data_nascimento",
  "estado_civil",
  "profissao",
  "endereco_logradouro",
  "endereco_numero",
  "endereco_complemento",
  "endereco_bairro",
  "endereco_cidade",
  "endereco_estado",
  "endereco_cep",
  "endereco_referencia",
  "observacao",
] as const

const str = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim() : null

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = requireRole(appUser, ALLOWED_ROLES)
  if (roleError) return roleError

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const nome = typeof body.nome === "string" ? body.nome.trim() : ""
  if (!nome) {
    return NextResponse.json({ error: "nome é obrigatório" }, { status: 400 })
  }

  const insertRow: Record<string, unknown> = {
    org_id: appUser.org_id,
    nome,
  }

  for (const field of ALLOWED_FIELDS) {
    if (field === "nome") continue
    if (body[field] !== undefined) {
      insertRow[field] = str(body[field])
    }
  }

  // CPF unicidade na org (se fornecido)
  if (insertRow.cpf) {
    const { data: existing, error: cpfErr } = await supabase
      .from("clientes")
      .select("id")
      .eq("org_id", appUser.org_id)
      .eq("cpf", insertRow.cpf)
      .maybeSingle()
    if (cpfErr) {
      return NextResponse.json({ error: cpfErr.message }, { status: 500 })
    }
    if (existing) {
      return NextResponse.json(
        { error: "Já existe um cliente com este CPF nesta organização" },
        { status: 409 }
      )
    }
  }

  const { data, error } = await supabase
    .from("clientes")
    .insert(insertRow)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  void logAudit({
    org_id: appUser.org_id,
    user_id: appUser.id,
    user_name: appUser.name,
    action: "cliente.create",
    entity_type: "cliente",
    entity_id: data.id,
    entity_name: data.nome,
    ip_address: getRequestIp(request.headers),
  })

  return NextResponse.json({ data }, { status: 201 })
}
