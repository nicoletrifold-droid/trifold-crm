import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = requireRole(appUser, ["admin", "supervisor", "obras"])
  if (roleError) return roleError

  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
  const updates: Record<string, unknown> = {}

  if (body.obra_nome !== undefined) updates.obra_nome = str(body.obra_nome)
  if (body.tipo !== undefined) {
    if (!["mae", "pai", "outro"].includes(body.tipo as string)) {
      return NextResponse.json({ error: "tipo deve ser mae, pai ou outro" }, { status: 400 })
    }
    updates.tipo = body.tipo
  }
  if (body.nome !== undefined) updates.nome = str(body.nome)
  if (body.observacao !== undefined) updates.observacao = str(body.observacao)
  if (body.endereco_logradouro !== undefined) updates.endereco_logradouro = str(body.endereco_logradouro)
  if (body.endereco_numero !== undefined) updates.endereco_numero = str(body.endereco_numero)
  if (body.endereco_complemento !== undefined) updates.endereco_complemento = str(body.endereco_complemento)
  if (body.endereco_bairro !== undefined) updates.endereco_bairro = str(body.endereco_bairro)
  if (body.endereco_cidade !== undefined) updates.endereco_cidade = str(body.endereco_cidade)
  if (body.endereco_estado !== undefined) updates.endereco_estado = str(body.endereco_estado)
  if (body.endereco_cep !== undefined) updates.endereco_cep = str(body.endereco_cep)
  if (body.endereco_referencia !== undefined) updates.endereco_referencia = str(body.endereco_referencia)

  if (body.cliente_id !== undefined) {
    const clienteIdRaw = body.cliente_id
    if (clienteIdRaw === null) {
      updates.cliente_id = null
    } else if (typeof clienteIdRaw === "string" && clienteIdRaw.trim()) {
      updates.cliente_id = clienteIdRaw.trim()
    } else {
      updates.cliente_id = null
    }
  }

  if (body.brinde_tipo_id !== undefined) {
    const tipoId = typeof body.brinde_tipo_id === "string" && body.brinde_tipo_id.trim()
      ? body.brinde_tipo_id.trim()
      : null
    if (tipoId) {
      const { data: tipoRow, error: tipoErr } = await supabase
        .from("brindes_tipos")
        .select("id")
        .eq("id", tipoId)
        .eq("org_id", appUser.org_id)
        .maybeSingle()
      if (tipoErr) {
        return NextResponse.json({ error: tipoErr.message }, { status: 500 })
      }
      if (!tipoRow) {
        return NextResponse.json({ error: "brinde_tipo_id inválido" }, { status: 400 })
      }
    }
    updates.brinde_tipo_id = tipoId
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nenhum campo para atualizar" }, { status: 400 })
  }

  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from("brindes_destinatarios")
    .update(updates)
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json({ data })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = requireRole(appUser, ["admin", "supervisor", "obras"])
  if (roleError) return roleError

  const { id } = await params

  const { error } = await supabase
    .from("brindes_destinatarios")
    .delete()
    .eq("id", id)
    .eq("org_id", appUser.org_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
