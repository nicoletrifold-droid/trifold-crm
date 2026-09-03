import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireCapability } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { sendEmail } from "@web/lib/email"
import { renderPasswordActionEmail } from "@web/lib/email-layout"
import { tentarAppUrl } from "@web/lib/tenancy/app-url-fallback"
import { normalizePhoneBR } from "@trifold/shared"

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  // Get brokers with user info and active lead count
  const { data: brokers, error } = await supabase
    .from("brokers")
    .select(
      `
      id, creci, type, is_available, max_leads, created_at,
      user:users!user_id(id, name, email, avatar_url, is_active)
    `
    )
    .eq("org_id", appUser.org_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Contagem de leads ativos por corretor via RPC (Story 75-198): mesma régua do
  // teto do bolsão/roleta (sem etapas Perdido/Não Qualificado) e sem o corte de
  // 1000 linhas do PostgREST que truncava a contagem em JS.
  const leadCounts: Record<string, number> = {}

  const { data: counts } = await supabase.rpc("get_brokers_active_lead_counts", {
    p_org_id: appUser.org_id,
  })

  for (const row of (counts ?? []) as Array<{ user_id: string; active_leads: number }>) {
    leadCounts[row.user_id] = row.active_leads
  }

  const brokersWithCounts = (brokers ?? []).map((b) => {
    const u = b.user as unknown as { id: string } | null
    return {
      ...b,
      active_leads_count: u ? leadCounts[u.id] || 0 : 0,
    }
  })

  return NextResponse.json({ data: brokersWithCounts })
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = await requireCapability(appUser, "corretores.gerenciar")
  if (forbidden) return forbidden

  const body = await request.json()

  // If creating a new broker via email invite (no password set by admin)
  if (body.email && body.sendInvite && body.name) {
    const adminSupabase = createAdminClient()

    // Step 1: Create auth user without a real password (random temp)
    const tempPassword = `Tmp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}!`
    const { data: authData, error: authError } =
      await adminSupabase.auth.admin.createUser({
        email: body.email.trim(),
        password: tempPassword,
        email_confirm: true,
        app_metadata: { role: "broker" }, // Story 75-205: role no JWT desde a criação
      })

    if (authError) {
      return NextResponse.json(
        { error: `Erro ao criar usuario: ${authError.message}` },
        { status: 400 }
      )
    }

    const authUser = authData.user

    // Step 2: Create users table row
    const phone: string | null = normalizePhoneBR(typeof body.phone === "string" ? body.phone : null)

    const { data: newUser, error: userError } = await adminSupabase
      .from("users")
      .insert({
        auth_id: authUser.id,
        org_id: appUser.org_id,
        name: body.name.trim(),
        email: body.email.trim(),
        role: "broker",
        is_active: true,
        ...(phone ? { phone } : {}),
      })
      .select("id")
      .single()

    if (userError) {
      await adminSupabase.auth.admin.deleteUser(authUser.id)
      return NextResponse.json(
        { error: `Erro ao criar usuario: ${userError.message}` },
        { status: 500 }
      )
    }

    // Step 3: Create broker record
    const { data: broker, error: brokerError } = await adminSupabase
      .from("brokers")
      .insert({
        org_id: appUser.org_id,
        user_id: newUser.id,
        creci: body.creci?.trim() || null,
        type: body.type || "internal",
        max_leads: body.max_leads ?? 50,
        is_available: true,
      })
      .select()
      .single()

    if (brokerError) {
      return NextResponse.json(
        { error: `Erro ao criar corretor: ${brokerError.message}` },
        { status: 500 }
      )
    }

    // Step 4: Generate password setup link and send branded email
    // Story 900-66 (AC4) — sem URL base não sai convite: o corretor JÁ foi criado, então a
    // resposta 201 é a mesma; o que não acontece é o e-mail com link para a marca errada.
    const base = tentarAppUrl(process.env.NEXT_PUBLIC_SITE_URL, "api/brokers:POST(user_id existente)", {
      orgId: appUser.org_id,
    })
    if (!base.ok) return NextResponse.json({ data: broker }, { status: 201 })
    const siteUrl = base.url
    const { data: linkData } = await adminSupabase.auth.admin.generateLink({
      type: "recovery",
      email: body.email.trim(),
      options: { redirectTo: `${siteUrl}/reset-senha` },
    })

    if (linkData?.properties?.hashed_token) {
      // `action_link` usa /auth/v1/verify (verify + fragment) e não chega em /reset-senha.
      // Link direto para /auth/callback com `hashed_token` (verifyOtp). [Story 75-139]
      const actionLink = `${siteUrl}/auth/callback?token_hash=${linkData.properties.hashed_token}&type=recovery&next=/reset-senha`
      const { subject, html } = renderPasswordActionEmail({
        userName: body.name.trim(),
        actionLink,
        siteUrl,
        mode: "create",
        orgId: appUser.org_id,
      })

      await sendEmail({
        to: body.email.trim(),
        subject,
        html,
        tags: [{ name: "type", value: "broker_invite" }],
        orgId: appUser.org_id,
      })
    }

    return NextResponse.json({ data: broker }, { status: 201 })
  }

  // If creating a new broker with email/password (full creation flow)
  if (body.email && body.password && body.name) {
    const adminSupabase = createAdminClient()

    // Step 1: Create auth user
    const { data: authData, error: authError } =
      await adminSupabase.auth.admin.createUser({
        email: body.email.trim(),
        password: body.password,
        email_confirm: true,
        app_metadata: { role: "broker" }, // Story 75-205
      })

    if (authError) {
      return NextResponse.json(
        { error: `Erro ao criar usuario: ${authError.message}` },
        { status: 400 }
      )
    }

    const authUser = authData.user

    // Step 2: Create users table row
    const phone: string | null = normalizePhoneBR(typeof body.phone === "string" ? body.phone : null)

    const { data: newUser, error: userError } = await adminSupabase
      .from("users")
      .insert({
        auth_id: authUser.id,
        org_id: appUser.org_id,
        name: body.name.trim(),
        email: body.email.trim(),
        role: "broker",
        is_active: true,
        ...(phone ? { phone } : {}),
      })
      .select("id")
      .single()

    if (userError) {
      // Rollback: delete auth user if users insert fails
      await adminSupabase.auth.admin.deleteUser(authUser.id)
      return NextResponse.json(
        { error: `Erro ao criar usuario: ${userError.message}` },
        { status: 500 }
      )
    }

    // Step 3: Create broker record
    const { data: broker, error: brokerError } = await adminSupabase
      .from("brokers")
      .insert({
        org_id: appUser.org_id,
        user_id: newUser.id,
        creci: body.creci?.trim() || null,
        type: body.type || "internal",
        max_leads: body.max_leads ?? 50,
        is_available: true,
      })
      .select()
      .single()

    if (brokerError) {
      return NextResponse.json(
        { error: `Erro ao criar corretor: ${brokerError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ data: broker }, { status: 201 })
  }

  // Legacy flow: link existing user as broker via user_id
  if (!body.user_id) {
    return NextResponse.json(
      { error: "user_id or (email, password, name) is required" },
      { status: 400 }
    )
  }

  // Verify the user exists and belongs to the same org
  const { data: targetUser } = await supabase
    .from("users")
    .select("id, name, email, auth_id, org_id")
    .eq("id", body.user_id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!targetUser) {
    return NextResponse.json(
      { error: "User not found in this organization" },
      { status: 404 }
    )
  }

  // Check if broker record already exists
  const { data: existing } = await supabase
    .from("brokers")
    .select("id")
    .eq("user_id", body.user_id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: "Broker record already exists for this user" },
      { status: 409 }
    )
  }

  // Garante que o usuário tenha conta no Supabase Auth.
  // Usuários criados por fluxos legados podem não ter auth_id.
  if (!targetUser.auth_id && targetUser.email) {
    const adminSupabase = createAdminClient()
    const tempPassword = `Tmp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}!`

    const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
      email: (targetUser.email as string).trim(),
      password: tempPassword,
      email_confirm: true,
      app_metadata: { role: "broker" }, // Story 75-205
    })

    if (!authError && authData?.user) {
      await adminSupabase
        .from("users")
        .update({ auth_id: authData.user.id })
        .eq("id", targetUser.id)

      // Envia link de criação de senha
      // Story 900-66 (AC4) — sem URL base o convite não sai; a criação do usuário e do broker
      // segue normalmente, que é o que o `if` externo já fazia quando o link falhava.
      const base = tentarAppUrl(process.env.NEXT_PUBLIC_SITE_URL, "api/brokers:POST(criação completa)", {
        orgId: appUser.org_id,
      })
      const siteUrl = base.ok ? base.url : null
      const { data: linkData } = siteUrl
        ? await adminSupabase.auth.admin.generateLink({
            type: "recovery",
            email: (targetUser.email as string).trim(),
            options: { redirectTo: `${siteUrl}/reset-senha` },
          })
        : { data: null }

      if (siteUrl && linkData?.properties?.hashed_token) {
        // `action_link` usa /auth/v1/verify (verify + fragment) e não chega em /reset-senha.
        // Link direto para /auth/callback com `hashed_token` (verifyOtp). [Story 75-139]
        const actionLink = `${siteUrl}/auth/callback?token_hash=${linkData.properties.hashed_token}&type=recovery&next=/reset-senha`
        const { subject, html } = renderPasswordActionEmail({
          userName: (targetUser.name as string) ?? "Corretor",
          actionLink,
          siteUrl,
          mode: "create",
          orgId: appUser.org_id,
        })

        await sendEmail({
          to: (targetUser.email as string).trim(),
          subject,
          html,
          tags: [{ name: "type", value: "broker_invite" }],
          orgId: appUser.org_id,
        })
      }
    }
  }

  const { data: broker, error } = await supabase
    .from("brokers")
    .insert({
      org_id: appUser.org_id,
      user_id: body.user_id,
      creci: body.creci?.trim() || null,
      type: body.type || "internal",
      max_leads: body.max_leads ?? 50,
      is_available: body.is_available ?? true,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: broker }, { status: 201 })
}
