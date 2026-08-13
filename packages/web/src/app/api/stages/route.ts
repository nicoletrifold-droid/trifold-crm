import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireCapability } from "@web/lib/api-auth"

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const { data: stages, error } = await supabase
    .from("kanban_stages")
    .select("id, name, slug, type, position, color, is_default, is_active, created_at")
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .order("position")

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: stages })
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = await requireCapability(appUser, "configuracoes.pipeline_editar")
  if (forbidden) return forbidden

  const body = await request.json()

  if (!body.name?.trim()) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 }
    )
  }

  if (!body.type) {
    return NextResponse.json(
      { error: "type is required" },
      { status: 400 }
    )
  }

  const slug =
    body.slug?.trim() ||
    body.name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")

  // Get next position
  const { data: lastStage } = await supabase
    .from("kanban_stages")
    .select("position")
    .eq("org_id", appUser.org_id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextPosition = (lastStage?.position ?? -1) + 1

  const { data: stage, error } = await supabase
    .from("kanban_stages")
    .insert({
      org_id: appUser.org_id,
      name: body.name.trim(),
      slug,
      type: body.type,
      position: body.position ?? nextPosition,
      color: body.color?.trim() || null,
      is_default: body.is_default ?? false,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: stage }, { status: 201 })
}
