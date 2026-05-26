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
    .from("clientes_obras_vinculos")
    .select("id, numero_unidade, clientes(id, nome, cpf, email)")
    .eq("obra_id", obra_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const clientes = (data ?? []).map((row) => {
    const c = Array.isArray(row.clientes) ? row.clientes[0] : row.clientes
    return {
      id: row.id,            // vinculo_id — usado para desvincular/editar
      cliente_id: c?.id ?? "",
      name: c?.nome ?? "",
      cpf: c?.cpf ?? "",
      email: c?.email ?? "",
      is_primary: false,
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

  // Modo B — vincular cliente existente por CPF
  const isModoB = typeof body.cpf === "string" && !body.nome
  // Modo A — criar novo cliente (nome + cpf + email + senha)
  const isModoA = typeof body.nome === "string" && typeof body.cpf === "string"

  if (!isModoA && !isModoB) {
    return NextResponse.json(
      { error: "Parâmetros inválidos. Forneça 'cpf' para vincular ou 'nome'+'cpf'+'email'+'senha_temporaria' para criar." },
      { status: 400 }
    )
  }

  // ── MODO B: Vincular CRM cliente por CPF ──────────────────────────────
  if (isModoB) {
    const { cpf, numero_unidade } = body as {
      cpf: string
      numero_unidade?: string
    }

    if (!cpf.trim()) {
      return NextResponse.json({ error: "CPF é obrigatório" }, { status: 400 })
    }

    // Buscar cliente pelo CPF na org
    const { data: clienteCrm, error: crmErr } = await supabase
      .from("clientes")
      .select("id, nome, cpf, email")
      .eq("org_id", appUser.org_id)
      .eq("cpf", cpf.trim())
      .maybeSingle()

    if (crmErr) {
      return NextResponse.json({ error: crmErr.message }, { status: 500 })
    }

    if (!clienteCrm) {
      return NextResponse.json(
        {
          error:
            "CPF não encontrado no cadastro de clientes. Cadastre o cliente em Configurações → Clientes antes de vincular.",
        },
        { status: 404 }
      )
    }

    // Criar vínculo na tabela CRM (clientes_obras_vinculos)
    const { data: vinculo, error: linkErr } = await supabase
      .from("clientes_obras_vinculos")
      .insert({
        cliente_id: clienteCrm.id,
        obra_id,
        numero_unidade:
          typeof numero_unidade === "string" && numero_unidade.trim()
            ? numero_unidade.trim()
            : null,
      })
      .select("id, numero_unidade")
      .single()

    if (linkErr) {
      if (linkErr.message.includes("duplicate") || linkErr.code === "23505") {
        return NextResponse.json(
          { error: "Este cliente já está vinculado a esta obra." },
          { status: 409 }
        )
      }
      return NextResponse.json({ error: linkErr.message }, { status: 500 })
    }

    return NextResponse.json({
      cliente: {
        id: vinculo.id,
        cliente_id: clienteCrm.id,
        name: clienteCrm.nome,
        cpf: clienteCrm.cpf,
        email: clienteCrm.email,
        numero_unidade: vinculo.numero_unidade,
      },
    })
  }

  // ── MODO A: Criar novo cliente + vincular ─────────────────────────────
  const { nome, cpf, email, senha_temporaria, numero_unidade } = body as {
    nome: string
    cpf: string
    email: string
    senha_temporaria: string
    numero_unidade?: string
  }

  if (!nome?.trim() || !cpf?.trim() || !email?.trim() || !senha_temporaria) {
    return NextResponse.json(
      { error: "nome, cpf, email e senha_temporaria são obrigatórios" },
      { status: 400 }
    )
  }

  // Verificar se CPF já existe no cadastro CRM da org
  const { data: existingCrm } = await supabase
    .from("clientes")
    .select("id, nome")
    .eq("org_id", appUser.org_id)
    .eq("cpf", cpf.trim())
    .maybeSingle()

  if (existingCrm) {
    return NextResponse.json(
      {
        error: `CPF já cadastrado como "${existingCrm.nome}". Use "Vincular por CPF" para vincular este cliente à obra.`,
        cliente_existente: { id: existingCrm.id, nome: existingCrm.nome },
      },
      { status: 409 }
    )
  }

  const supabaseAdmin = createAdminClient()

  // Criar usuário de portal (acesso ao portal do cliente)
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
        { error: "Email já cadastrado no portal" },
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

  // Criar registro CRM do cliente (clientes table)
  const { data: clienteCrm, error: crmError } = await supabase
    .from("clientes")
    .insert({
      org_id: appUser.org_id,
      nome: nome.trim(),
      cpf: cpf.trim(),
      email: email.trim(),
    })
    .select("id, nome, cpf, email")
    .single()

  if (crmError) {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: crmError.message }, { status: 500 })
  }

  // Criar vínculo CRM (clientes_obras_vinculos)
  const { data: vinculo, error: linkCrmErr } = await supabase
    .from("clientes_obras_vinculos")
    .insert({
      cliente_id: clienteCrm.id,
      obra_id,
      numero_unidade:
        typeof numero_unidade === "string" && numero_unidade.trim()
          ? numero_unidade.trim()
          : null,
    })
    .select("id, numero_unidade")
    .single()

  if (linkCrmErr) {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: linkCrmErr.message }, { status: 500 })
  }

  // Criar vínculo de acesso ao portal (cliente_obras) — mantém acesso ao portal
  await supabaseAdmin.from("cliente_obras").insert({
    user_id: newUser.id,
    obra_id,
    is_primary: true,
    numero_unidade: vinculo.numero_unidade,
  })

  return NextResponse.json(
    {
      cliente: {
        id: vinculo.id,
        cliente_id: clienteCrm.id,
        name: clienteCrm.nome,
        cpf: clienteCrm.cpf,
        email: clienteCrm.email,
        numero_unidade: vinculo.numero_unidade,
      },
    },
    { status: 201 }
  )
}
