import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { logAudit, getRequestIp } from "@web/lib/audit"

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
    .select("id, numero_unidade, clientes(id, nome, cpf, email, sienge_customer_id)")
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
      sienge_customer_id: (c as { sienge_customer_id?: number | null } | null)?.sienge_customer_id ?? null,
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
            "CPF não encontrado no cadastro. Use 'Criar acesso ao portal' abaixo ou peça ao administrador para cadastrar em Configurações → Clientes.",
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

  // ── MODO A: Criar acesso ao portal (com ou sem cadastro CRM prévio) ──
  const { nome, cpf, email, senha_temporaria, numero_unidade, crm_id } = body as {
    nome: string
    cpf: string
    email: string
    senha_temporaria: string
    numero_unidade?: string
    crm_id?: string   // Presente quando o CPF já existe no CRM (Opção 3)
  }

  if (!nome?.trim() || !cpf?.trim() || !email?.trim() || !senha_temporaria) {
    return NextResponse.json(
      { error: "nome, cpf, email e senha_temporaria são obrigatórios" },
      { status: 400 }
    )
  }

  const supabaseAdmin = createAdminClient()

  // ── Determinar se o cliente CRM já existe ────────────────────────────
  let clienteCrm: { id: string; nome: string; cpf: string; email: string | null }

  if (crm_id) {
    // Frontend já verificou — confirmar que o ID pertence à org
    const { data: found, error: findErr } = await supabase
      .from("clientes")
      .select("id, nome, cpf, email")
      .eq("id", crm_id)
      .eq("org_id", appUser.org_id)
      .maybeSingle()

    if (findErr || !found) {
      return NextResponse.json(
        { error: "Cliente CRM não encontrado." },
        { status: 404 }
      )
    }
    clienteCrm = found as typeof clienteCrm
  } else {
    // CPF não estava no CRM — verificar de segurança antes de criar
    const { data: existingCrm } = await supabase
      .from("clientes")
      .select("id, nome, cpf, email")
      .eq("org_id", appUser.org_id)
      .eq("cpf", cpf.trim())
      .maybeSingle()

    if (existingCrm) {
      // Race condition: CPF foi criado por outro processo entre o check e o submit
      // Usar o registro existente em vez de criar duplicata
      clienteCrm = existingCrm as typeof clienteCrm
    } else {
      // Criar novo registro no CRM
      const { data: newCrm, error: crmError } = await supabase
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
        return NextResponse.json({ error: crmError.message }, { status: 500 })
      }
      clienteCrm = newCrm as typeof clienteCrm

      void logAudit({
        org_id: appUser.org_id,
        user_id: appUser.id,
        user_name: appUser.name,
        action: "cliente.create",
        entity_type: "cliente",
        entity_id: clienteCrm.id,
        entity_name: clienteCrm.nome,
        ip_address: getRequestIp(req.headers),
      })
    }
  }

  // Criar usuário de portal (auth + users table)
  const { data: authData, error: authError } =
    await supabaseAdmin.auth.admin.createUser({
      email: email.trim(),
      password: senha_temporaria,
      email_confirm: true,
      app_metadata: { role: "cliente" },
      user_metadata: { full_name: clienteCrm.nome },
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
      name: clienteCrm.nome,
      email: email.trim(),
      role: "cliente",
    })
    .select("id")
    .single()

  if (userError) {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: userError.message }, { status: 500 })
  }

  const unidadeNormalizada =
    typeof numero_unidade === "string" && numero_unidade.trim()
      ? numero_unidade.trim()
      : null

  // Criar vínculo CRM (clientes_obras_vinculos)
  const { data: vinculo, error: linkCrmErr } = await supabase
    .from("clientes_obras_vinculos")
    .insert({
      cliente_id: clienteCrm.id,
      obra_id,
      numero_unidade: unidadeNormalizada,
    })
    .select("id, numero_unidade")
    .single()

  if (linkCrmErr) {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: linkCrmErr.message }, { status: 500 })
  }

  // Criar vínculo de acesso ao portal (cliente_obras)
  await supabaseAdmin.from("cliente_obras").insert({
    user_id: newUser.id,
    obra_id,
    is_primary: true,
    numero_unidade: unidadeNormalizada,
  })

  void logAudit({
    org_id: appUser.org_id,
    user_id: appUser.id,
    user_name: appUser.name,
    action: "cliente.portal_access_created",
    entity_type: "cliente",
    entity_id: clienteCrm.id,
    entity_name: clienteCrm.nome,
    ip_address: getRequestIp(req.headers),
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
