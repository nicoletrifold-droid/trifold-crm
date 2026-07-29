import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { normalizePhoneBR } from "@trifold/shared"

/**
 * GET /api/users
 *
 * Lista usuários da org do usuário autenticado. Restrita a admin.
 * Usado, p.ex., pelo select de "Usuário" na página de logs de auditoria.
 *
 * Retorna: { users: Array<{ id, name, email, role, is_active }> }
 */
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = requireRole(appUser, ["admin"])
  if (forbidden) return forbidden

  const { data: users, error } = await supabase
    .from("users")
    .select("id, name, email, role, is_active")
    .eq("org_id", appUser.org_id)
    .order("name", { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ users: users ?? [] })
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = requireRole(appUser, ["admin"])
  if (forbidden) return forbidden

  const body = await request.json()
  const { name, email, password, role } = body

  if (!name?.trim() || !email?.trim() || !password || !role) {
    return NextResponse.json({ error: "Nome, email, senha e perfil sao obrigatorios" }, { status: 400 })
  }

  const phone: string | null = normalizePhoneBR(typeof body.phone === "string" ? body.phone : null)

  const { data: validRole } = await supabase
    .from("roles")
    .select("name")
    .eq("org_id", appUser.org_id)
    .eq("name", role)
    .maybeSingle()

  if (!validRole) {
    return NextResponse.json({ error: "Perfil invalido" }, { status: 400 })
  }

  if (password.length < 6) {
    return NextResponse.json({ error: "Senha deve ter no minimo 6 caracteres" }, { status: 400 })
  }

  // Create auth user with admin client
  const adminSupabase = createAdminClient()

  const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true,
    app_metadata: { role }, // Story 75-205: role no JWT desde a criação
  })

  if (authError) {
    if (authError.message.includes("already been registered")) {
      return NextResponse.json({ error: "Este email ja esta cadastrado" }, { status: 409 })
    }
    return NextResponse.json({ error: authError.message }, { status: 500 })
  }

  // Create user in users table
  const { data: newUser, error: userError } = await adminSupabase
    .from("users")
    .insert({
      org_id: appUser.org_id,
      auth_id: authData.user.id,
      name: name.trim(),
      email: email.trim(),
      role,
      ...(phone ? { phone } : {}),
    })
    .select("id")
    .single()

  if (userError || !newUser) {
    // Rollback auth user
    await adminSupabase.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: userError?.message ?? "Falha ao criar usuário" }, { status: 500 })
  }

  // Broker e SDR recebem leads da roleta → precisam de linha em brokers (Story 75-226).
  // Bug fix: antes gravava auth_id em brokers.user_id (FK p/ users.id) e falhava calado.
  if (role === "broker" || role === "sdr") {
    const { error: brokerError } = await adminSupabase.from("brokers").insert({
      org_id: appUser.org_id,
      user_id: newUser.id as string,
      type: "internal",
      ...(role === "sdr" ? { max_leads: 500 } : {}),
    })
    if (brokerError) {
      // non-blocking: usuário existe; sem a linha ele só não entra na roleta
      console.error("[users] insert em brokers falhou:", brokerError.message)
    }
  }

  return NextResponse.json({ data: { id: authData.user.id, email, role } })
}
