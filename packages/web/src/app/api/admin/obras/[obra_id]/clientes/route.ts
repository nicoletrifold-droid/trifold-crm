import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"

const ALLOWED_ROLES = ["admin", "supervisor", "obras"]

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ obra_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!ALLOWED_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { obra_id } = await params

  const { data: obra } = await supabase
    .from("obras")
    .select("id")
    .eq("id", obra_id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!obra) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const { data, error } = await supabase
    .from("cliente_obras")
    .select("is_primary, numero_unidade, users(id, name, email)")
    .eq("obra_id", obra_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const clientes = (data ?? []).map((row) => {
    const user = Array.isArray(row.users) ? row.users[0] : row.users
    return {
      id: user?.id,
      name: user?.name,
      email: user?.email,
      is_primary: row.is_primary,
      numero_unidade: row.numero_unidade ?? null,
    }
  })

  return NextResponse.json({ clientes })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ obra_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!ALLOWED_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { obra_id } = await params

  const { data: obra } = await supabase
    .from("obras")
    .select("id")
    .eq("id", obra_id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!obra) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const body = await req.json()
  const isModoA = typeof body.nome === "string" && typeof body.email === "string"
  const isModoB = !isModoA && typeof body.email === "string"

  if (!isModoA && !isModoB) {
    return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 })
  }

  if (isModoA) {
    const { nome, email, senha_temporaria, numero_unidade } = body as {
      nome: string
      email: string
      senha_temporaria: string
      numero_unidade?: string
    }

    if (!nome?.trim() || !email?.trim() || !senha_temporaria) {
      return NextResponse.json(
        { error: "nome, email e senha_temporaria são obrigatórios" },
        { status: 400 }
      )
    }

    const supabaseAdmin = createAdminClient()

    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email: email.trim(),
        password: senha_temporaria,
        email_confirm: true,
        app_metadata: { role: "cliente" },
        user_metadata: { full_name: nome.trim() },
      })

    if (authError) {
      if (authError.message.toLowerCase().includes("already")) {
        return NextResponse.json(
          { error: "Email já cadastrado" },
          { status: 409 }
        )
      }
      return NextResponse.json({ error: authError.message }, { status: 500 })
    }

    const { data: newUser, error: userError } = await supabaseAdmin
      .from("users")
      .insert({
        auth_id: authData.user.id,
        org_id: appUser.org_id,
        name: nome.trim(),
        email: email.trim(),
        role: "cliente",
      })
      .select("id, name, email")
      .single()

    if (userError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: userError.message }, { status: 500 })
    }

    const { error: linkError } = await supabaseAdmin
      .from("cliente_obras")
      .insert({
        user_id: newUser.id,
        obra_id,
        is_primary: true,
        numero_unidade:
          typeof numero_unidade === "string" && numero_unidade.trim()
            ? numero_unidade.trim()
            : null,
      })

    if (linkError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: linkError.message }, { status: 500 })
    }

    return NextResponse.json({ cliente: newUser }, { status: 201 })
  }

  // Modo B — vincular por email
  const { email, numero_unidade: numero_unidade_b } = body as {
    email: string
    numero_unidade?: string
  }

  const supabaseAdmin = createAdminClient()

  const { data: existingUser } = await supabaseAdmin
    .from("users")
    .select("id, name, email")
    .eq("email", email.trim())
    .eq("org_id", appUser.org_id)
    .eq("role", "cliente")
    .single()

  if (!existingUser) {
    return NextResponse.json(
      { error: "Cliente não encontrado nesta organização" },
      { status: 404 }
    )
  }

  const { error: linkError } = await supabaseAdmin
    .from("cliente_obras")
    .insert({
      user_id: existingUser.id,
      obra_id,
      is_primary: false,
      numero_unidade:
        typeof numero_unidade_b === "string" && numero_unidade_b.trim()
          ? numero_unidade_b.trim()
          : null,
    })

  if (linkError && !linkError.message.includes("duplicate")) {
    return NextResponse.json({ error: linkError.message }, { status: 500 })
  }

  return NextResponse.json({ cliente: existingUser })
}
