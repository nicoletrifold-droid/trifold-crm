import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { canAccess } from "@web/lib/permissions"
import { createAdminClient } from "@web/lib/supabase/admin"
import { parseFormSchema, FormSchemaInvalido } from "@web/lib/forms/schema"

// Story 75-330 (Epic 89) — CRUD dos formulários de qualificação.
// A rota PÚBLICA que executa o formulário é /api/formulario/[token]; esta aqui
// é interna e exige capability.
//
// `lead_forms` tem RLS habilitada e SEM policies (232) — o client do usuário não
// enxerga a tabela por construção. O acesso é por service-role DEPOIS do gate de
// capability, mesmo padrão de fvs_* / lancamentos / imobiliarias. Por isso todo
// WHERE carrega `org_id` explícito: aqui o escopo é do código, não da policy.

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser } = auth

  // MESMO gate da tela (configuracoes/formularios/page.tsx): API e página têm de
  // concordar, senão vira "vejo o botão e tomo 403". Módulo dotted, não
  // capability nova — a AC8 pede admin, e é isso que "configuracoes" já entrega.
  if (!(await canAccess(appUser.id, appUser.org_id, "configuracoes"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as { nome?: string } | null
  const nome = body?.nome?.trim()
  if (!nome) return NextResponse.json({ error: "Informe o nome do formulário." }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("lead_forms")
    .insert({ org_id: appUser.org_id, nome, created_by: appUser.id })
    .select("id, nome, token, is_active")
    .single()

  if (error || !data) {
    console.error("[lead-forms] falha ao criar:", error)
    return NextResponse.json({ error: "Não foi possível criar o formulário." }, { status: 500 })
  }
  return NextResponse.json({ data }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser } = auth

  // MESMO gate da tela (configuracoes/formularios/page.tsx): API e página têm de
  // concordar, senão vira "vejo o botão e tomo 403". Módulo dotted, não
  // capability nova — a AC8 pede admin, e é isso que "configuracoes" já entrega.
  if (!(await canAccess(appUser.id, appUser.org_id, "configuracoes"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as {
    id?: string
    nome?: string
    schema?: unknown
    is_active?: boolean
  } | null
  if (!body?.id) return NextResponse.json({ error: "Formulário não informado." }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (typeof body.nome === "string" && body.nome.trim()) patch.nome = body.nome.trim()
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active

  // AC8 — schema inválido é RECUSADO na gravação, com erro legível. Salvar um
  // JSON quebrado derrubaria a página pública de uma campanha já no ar.
  if (body.schema !== undefined) {
    try {
      patch.schema = parseFormSchema(body.schema)
    } catch (e) {
      const motivo = e instanceof FormSchemaInvalido ? e.message : "Formulário inválido."
      return NextResponse.json({ error: motivo }, { status: 400 })
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nada para salvar." }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from("lead_forms")
    .update(patch)
    .eq("id", body.id)
    .eq("org_id", appUser.org_id)

  if (error) {
    console.error("[lead-forms] falha ao salvar:", error)
    return NextResponse.json({ error: "Não foi possível salvar." }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
