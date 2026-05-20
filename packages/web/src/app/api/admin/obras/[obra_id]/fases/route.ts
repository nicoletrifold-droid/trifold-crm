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

  const { data: fases, error } = await supabase
    .from("obra_fases")
    .select("*")
    .eq("obra_id", obra_id)
    .order("order_index")

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ fases: fases ?? [] })
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
    .select("id, org_id")
    .eq("id", obra_id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!obra) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const body = await req.json()
  const name = typeof body.name === "string" ? body.name.trim() : ""
  if (!name) {
    return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 })
  }

  const VALID_STATUS = ["a_iniciar", "em_andamento", "pausada", "concluida", "pendente"]
  const status = VALID_STATUS.includes(body.status) ? body.status : "a_iniciar"
  const progress_pct =
    typeof body.progress_pct === "number"
      ? Math.min(100, Math.max(0, body.progress_pct))
      : 0
  const { data: maxFase } = await supabase
    .from("obra_fases")
    .select("order_index")
    .eq("obra_id", obra_id)
    .order("order_index", { ascending: false })
    .limit(1)
    .single()

  const order_index = maxFase ? maxFase.order_index + 1 : 1

  const adminSupabase = createAdminClient()
  const { data: fase, error } = await adminSupabase
    .from("obra_fases")
    .insert({
      obra_id,
      org_id: obra.org_id,
      name,
      description: body.description ?? null,
      order_index,
      status,
      progress_pct,
      start_date: body.start_date ?? null,
      end_date: body.end_date ?? null,
    })
    .select("id, name, description, order_index, status, progress_pct, start_date, end_date")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Auto-save to template bank — silent, never fails the request
  const etapa = typeof body.description === "string" ? body.description.trim() : ""
  if (etapa) {
    try {
      await adminSupabase
        .from("obra_fase_templates")
        .upsert(
          { org_id: obra.org_id, nome: name, etapa },
          { onConflict: "org_id,nome,etapa", ignoreDuplicates: true }
        )
    } catch {
      // silent
    }
  }

  return NextResponse.json({ fase }, { status: 201 })
}
