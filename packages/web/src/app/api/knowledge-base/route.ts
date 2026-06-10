import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = requireRole(appUser, ["admin", "supervisor", "gerente-comercial"])
  if (roleError) return roleError

  const { searchParams } = request.nextUrl
  const sourceId = searchParams.get("source_id")
  const source = searchParams.get("source")

  let query = supabase
    .from("knowledge_base")
    .select("*")
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })

  if (sourceId) {
    query = query.eq("source_id", sourceId)
  }

  if (source) {
    query = query.eq("source", source)
  }

  const { data: entries, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: entries })
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = requireRole(appUser, ["admin", "supervisor", "gerente-comercial"])
  if (roleError) return roleError

  const body = await request.json()

  if (!body.title?.trim()) {
    return NextResponse.json(
      { error: "title is required" },
      { status: 400 }
    )
  }

  if (!body.content?.trim()) {
    return NextResponse.json(
      { error: "content is required" },
      { status: 400 }
    )
  }

  const { data: entry, error } = await supabase
    .from("knowledge_base")
    .insert({
      org_id: appUser.org_id,
      title: body.title.trim(),
      content: body.content.trim(),
      source: body.source?.trim() || null,
      source_id: body.source_id || null,
      metadata: body.metadata || null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: entry }, { status: 201 })
}
