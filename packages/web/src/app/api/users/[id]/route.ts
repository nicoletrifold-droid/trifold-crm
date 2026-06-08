import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { logAudit, getRequestIp } from "@web/lib/audit"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = requireRole(appUser, ["admin", "gerente-comercial"])
  if (forbidden) return forbidden

  const body = await request.json()
  const publicUpdates: Record<string, unknown> = {}

  if (body.role) {
    const adminSupabase = createAdminClient()
    const { data: validRole } = await adminSupabase
      .from("roles")
      .select("name")
      .eq("org_id", appUser.org_id)
      .eq("name", body.role)
      .maybeSingle()
    if (validRole) {
      publicUpdates.role = body.role
    } else {
      return NextResponse.json({ error: "Perfil inválido" }, { status: 400 })
    }
  }
  if (body.is_active !== undefined) {
    publicUpdates.is_active = body.is_active
  }
  if (typeof body.name === "string" && body.name.trim().length > 0) {
    publicUpdates.name = body.name.trim()
  }
  if (typeof body.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
    publicUpdates.email = body.email.trim()
  }
  if (typeof body.phone === "string") {
    publicUpdates.phone = body.phone.trim() || null
  }

  const hasNewPassword =
    typeof body.new_password === "string" && body.new_password.length > 0
  const hasPublicUpdates = Object.keys(publicUpdates).length > 0

  if (!hasPublicUpdates && !hasNewPassword) {
    return NextResponse.json({ error: "No updates" }, { status: 400 })
  }

  if (hasNewPassword && (body.new_password as string).length < 8) {
    return NextResponse.json(
      { error: "A senha deve ter pelo menos 8 caracteres." },
      { status: 422 }
    )
  }

  const needsAuthUpdate =
    hasNewPassword || typeof publicUpdates.email === "string"

  // Snapshot ANTES de aplicar publicUpdates — necessário para:
  //  1. capturar `auth_id` se houver Auth-level update;
  //  2. computar valores anteriores de `role` / `is_active` para o audit log.
  // Escopado pelo `org_id` para evitar acesso cross-org.
  const { data: targetUserSnapshot, error: fetchError } = await supabase
    .from("users")
    .select("id, auth_id, name, role, is_active")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .single()

  if (fetchError || !targetUserSnapshot) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 })
  }

  // Usuário sem auth_id foi cadastrado pelo fluxo legado — cria conta no Supabase Auth agora.
  let resolvedAuthId: string | undefined = targetUserSnapshot.auth_id as string | undefined
  if (hasNewPassword && !resolvedAuthId) {
    const emailForAuth = (publicUpdates.email as string | undefined) ?? (
      (await supabase.from("users").select("email").eq("id", id).single()).data?.email as string | undefined
    )
    if (!emailForAuth) {
      return NextResponse.json({ error: "Usuário sem e-mail cadastrado — não é possível criar conta de acesso." }, { status: 422 })
    }
    const adminSupabase = createAdminClient()
    const { data: newAuth, error: createError } = await adminSupabase.auth.admin.createUser({
      email: emailForAuth,
      password: body.new_password as string,
      email_confirm: true,
    })
    if (createError || !newAuth?.user?.id) {
      return NextResponse.json({ error: createError?.message ?? "Erro ao criar conta de acesso." }, { status: 500 })
    }
    resolvedAuthId = newAuth.user.id
    await supabase.from("users").update({ auth_id: resolvedAuthId }).eq("id", id)
    // Conta criada com a senha já definida — não precisa do updateUserById abaixo
    if (hasPublicUpdates) {
      const { error } = await supabase.from("users").update(publicUpdates).eq("id", id).eq("org_id", appUser.org_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ data: { ok: true } })
  }

  const targetAuthId: string | undefined = needsAuthUpdate ? resolvedAuthId : undefined

  if (hasPublicUpdates) {
    const { error } = await supabase
      .from("users")
      .update(publicUpdates)
      .eq("id", id)
      .eq("org_id", appUser.org_id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  if (needsAuthUpdate && targetAuthId) {
    const authUpdates: { email?: string; password?: string; email_confirm?: boolean } = {}
    if (typeof publicUpdates.email === "string") {
      authUpdates.email = publicUpdates.email
      authUpdates.email_confirm = true
    }
    if (hasNewPassword) {
      authUpdates.password = body.new_password as string
    }

    const adminSupabase = createAdminClient()
    const { error: authError } = await adminSupabase.auth.admin.updateUserById(
      targetAuthId,
      authUpdates
    )
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 })
    }
  }

  // Audit log: registra apenas se role/is_active efetivamente mudaram
  // (atualização apenas de nome/email/senha NÃO gera evento de permissão).
  const changes: Record<string, unknown>[] = []
  if (
    typeof publicUpdates.role === "string" &&
    targetUserSnapshot.role !== publicUpdates.role
  ) {
    changes.push({
      field: "role",
      from: targetUserSnapshot.role,
      to: publicUpdates.role,
    })
  }
  if (
    publicUpdates.is_active !== undefined &&
    targetUserSnapshot.is_active !== publicUpdates.is_active
  ) {
    changes.push({
      field: "is_active",
      to: publicUpdates.is_active,
    })
  }

  if (changes.length > 0) {
    void logAudit({
      org_id: appUser.org_id,
      user_id: appUser.id,
      user_name: appUser.name,
      action: "permissao.update",
      entity_type: "permissao",
      entity_id: id,
      entity_name: (targetUserSnapshot.name as string | null) ?? id,
      metadata: changes.length === 1 ? changes[0] : { changes },
      ip_address: getRequestIp(request.headers),
    })
  }

  return NextResponse.json({ data: { ok: true } })
}
