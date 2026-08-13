import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireCapability } from "@web/lib/api-auth"
import { can } from "@web/lib/permissions"
import { getRequestIp, logAudit } from "@web/lib/audit"
import { notifyClientes } from "@web/lib/notificacoes"


export async function GET(
  _req: Request,
  { params }: { params: Promise<{ obra_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (await requireCapability(appUser, "obras.ver")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { obra_id } = await params

  const { data: obra } = await supabase
    .from("obras")
    .select(
      "id, name, description, progress_pct, status, expected_delivery_date"
    )
    .eq("id", obra_id)
    .eq("org_id", appUser.org_id)
    .is("deleted_at", null)
    .maybeSingle()

  if (!obra) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const [fasesRes, fotosRes] = await Promise.all([
    supabase
      .from("obra_fases")
      .select("id, name, status, order_index")
      .eq("obra_id", obra_id)
      .order("order_index"),
    supabase
      .from("obra_fotos")
      .select("id, storage_path, caption, taken_at, fase_id, created_at")
      .eq("obra_id", obra_id)
      .order("created_at", { ascending: false }),
  ])

  return NextResponse.json({
    obra,
    fases: fasesRes.data ?? [],
    fotos: fotosRes.data ?? [],
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ obra_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (await requireCapability(appUser, "obras.editar")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { obra_id } = await params

  const { data: existing } = await supabase
    .from("obras")
    .select("id, name, status, progress_pct")
    .eq("id", obra_id)
    .eq("org_id", appUser.org_id)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const body = await req.json()
  const updates: Record<string, unknown> = {}

  if (typeof body.name === "string" && body.name.trim()) {
    updates.name = body.name.trim()
  }
  if ("description" in body) {
    updates.description = body.description ?? null
  }
  if (["em_andamento", "concluida", "pausada"].includes(body.status)) {
    updates.status = body.status
  }
  if ("expected_delivery_date" in body) {
    updates.expected_delivery_date = body.expected_delivery_date ?? null
  }
  if (typeof body.progress_pct === "number") {
    updates.progress_pct = Math.max(0, Math.min(100, Math.round(body.progress_pct)))
  }
  if ("deleted_at" in body && body.deleted_at === null && (await can(appUser.id, appUser.org_id, "obras.reativar"))) {
    updates.deleted_at = null
  }

  const { data: obra, error } = await supabase
    .from("obras")
    .update(updates)
    .eq("id", obra_id)
    .select("id, name, status, progress_pct, expected_delivery_date")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Story 75-5: notifica clientes quando o progresso da obra muda.
  if (
    typeof updates.progress_pct === "number" &&
    updates.progress_pct !== existing.progress_pct
  ) {
    notifyClientes(obra_id, "progresso", obra.name).catch(() => {})
  }

  // Differentiate obra.reativar (body.deleted_at === null) from obra.update
  const isReativar =
    "deleted_at" in body &&
    body.deleted_at === null &&
    (await can(appUser.id, appUser.org_id, "obras.reativar"))

  const action = isReativar ? "obra.reativar" : "obra.update"

  const metadata: Record<string, unknown> = {}
  if (
    !isReativar &&
    typeof updates.status === "string" &&
    updates.status !== existing.status
  ) {
    metadata.field = "status"
    metadata.from = existing.status
    metadata.to = updates.status
  }

  void logAudit({
    org_id: appUser.org_id,
    user_id: appUser.id,
    user_name: appUser.name,
    action,
    entity_type: "obra",
    entity_id: obra.id,
    entity_name: obra.name,
    obra_id: obra.id,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    ip_address: getRequestIp(req.headers),
  })

  return NextResponse.json({ obra })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ obra_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (await requireCapability(appUser, "obras.apagar")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { obra_id } = await params

  const { data: existing } = await supabase
    .from("obras")
    .select("id, name")
    .eq("id", obra_id)
    .eq("org_id", appUser.org_id)
    .is("deleted_at", null)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const { error } = await supabase
    .from("obras")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", obra_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  void logAudit({
    org_id: appUser.org_id,
    user_id: appUser.id,
    user_name: appUser.name,
    action: "obra.delete",
    entity_type: "obra",
    entity_id: existing.id,
    entity_name: existing.name,
    obra_id: existing.id,
    ip_address: getRequestIp(req.headers),
  })

  return NextResponse.json({ success: true })
}
