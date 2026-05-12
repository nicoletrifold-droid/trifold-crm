import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser } = auth

  const forbidden = requireRole(appUser, ["admin"])
  if (forbidden) return forbidden

  const body = await request.json()
  const { name, email, password, role } = body

  if (!name?.trim() || !email?.trim() || !password || !role) {
    return NextResponse.json({ error: "Nome, email, senha e perfil sao obrigatorios" }, { status: 400 })
  }

  if (!["admin", "supervisor", "broker", "obras"].includes(role)) {
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
  })

  if (authError) {
    if (authError.message.includes("already been registered")) {
      return NextResponse.json({ error: "Este email ja esta cadastrado" }, { status: 409 })
    }
    return NextResponse.json({ error: authError.message }, { status: 500 })
  }

  // Create user in users table
  const { error: userError } = await adminSupabase.from("users").insert({
    org_id: appUser.org_id,
    auth_id: authData.user.id,
    name: name.trim(),
    email: email.trim(),
    role,
  })

  if (userError) {
    // Rollback auth user
    await adminSupabase.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: userError.message }, { status: 500 })
  }

  // If role is broker, also create broker record
  if (role === "broker") {
    await adminSupabase.from("brokers").insert({
      org_id: appUser.org_id,
      user_id: authData.user.id,
      type: "internal",
    }).then(() => {}) // non-blocking, broker record is optional
  }

  return NextResponse.json({ data: { id: authData.user.id, email, role } })
}
