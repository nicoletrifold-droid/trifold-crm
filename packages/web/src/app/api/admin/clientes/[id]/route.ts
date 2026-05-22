import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { logAudit, getRequestIp } from "@web/lib/audit"

const ALLOWED_ROLES = ["admin", "supervisor", "obras"]

const UPDATABLE_FIELDS = [
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

  const { data, error } = await supabase
    .from("clientes")
    .select(
      "*, clientes_obras_vinculos(id, obra_id, numero_unidade, created_at, obras(id, name))"
    )
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json(
      { error: "Cliente não encontrado" },
      { status: 404 }
    )
  }

  return NextResponse.json({ data })
}

export async function PATCH(
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

  const updates: Record<string, unknown> = {}

  for (const field of UPDATABLE_FIELDS) {
    if (body[field] !== undefined) {
      if (field === "nome") {
        const nome = typeof body.nome === "string" ? body.nome.trim() : ""
        if (!nome) {
          return NextResponse.json(
            { error: "nome não pode ser vazio" },
            { status: 400 }
          )
        }
        updates.nome = nome
      } else {
        updates[field] = str(body[field])
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "Nenhum campo para atualizar" },
      { status: 400 }
    )
  }

  // CPF unicidade na org (excluindo o próprio cliente)
  if (updates.cpf) {
    const { data: existing, error: cpfErr } = await supabase
      .from("clientes")
      .select("id")
      .eq("org_id", appUser.org_id)
      .eq("cpf", updates.cpf)
      .neq("id", id)
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

  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from("clientes")
    .update(updates)
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .select()
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json(
      { error: "Cliente não encontrado" },
      { status: 404 }
    )
  }

  void logAudit({
    org_id: appUser.org_id,
    user_id: appUser.id,
    user_name: appUser.name,
    action: "cliente.update",
    entity_type: "cliente",
    entity_id: id,
    entity_name: data.nome,
    ip_address: getRequestIp(request.headers),
  })

  return NextResponse.json({ data })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = requireRole(appUser, ALLOWED_ROLES)
  if (roleError) return roleError

  const { id } = await params

  // Confirmar existência do cliente na org antes de checar dependências
  // (também captura `nome` para snapshot do audit log antes do delete)
  const { data: cliente, error: clienteErr } = await supabase
    .from("clientes")
    .select("id, nome")
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

  // Soft check: brindes_destinatarios.cliente_id (coluna pode ainda não existir
  // antes da migration 042 — tolerar erro de coluna inexistente).
  try {
    const { count, error: brindeErr } = await supabase
      .from("brindes_destinatarios")
      .select("id", { count: "exact", head: true })
      .eq("cliente_id", id)

    if (brindeErr) {
      // Postgres column-does-not-exist code = 42703
      // Antes da Story 33.5, a coluna pode não existir — não bloquear delete.
      const code = (brindeErr as { code?: string }).code
      if (code && code !== "42703") {
        return NextResponse.json(
          { error: brindeErr.message },
          { status: 500 }
        )
      }
    } else if (count && count > 0) {
      return NextResponse.json(
        {
          error:
            "Cliente possui destinatários de brindes vinculados. Desvincule antes de excluir.",
          count,
        },
        { status: 409 }
      )
    }
  } catch {
    // Tolerar qualquer falha inesperada na pré-checagem; segue para o delete.
  }

  const { error } = await supabase
    .from("clientes")
    .delete()
    .eq("id", id)
    .eq("org_id", appUser.org_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  void logAudit({
    org_id: appUser.org_id,
    user_id: appUser.id,
    user_name: appUser.name,
    action: "cliente.delete",
    entity_type: "cliente",
    entity_id: id,
    entity_name: cliente.nome,
    ip_address: getRequestIp(_request.headers),
  })

  return new NextResponse(null, { status: 204 })
}
