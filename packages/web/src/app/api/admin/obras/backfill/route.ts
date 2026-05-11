import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

const ALLOWED_ROLES = ["admin"]

interface BackfillLink {
  obra_id: string
  property_id: string
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!ALLOWED_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: { links?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!Array.isArray(body.links) || body.links.length === 0) {
    return NextResponse.json(
      { error: "Campo 'links' deve ser um array não vazio" },
      { status: 400 }
    )
  }

  const links = body.links as BackfillLink[]

  const results: Array<{ obra_id: string; ok: boolean; error?: string }> = []

  for (const link of links) {
    if (!link.obra_id || !link.property_id) {
      results.push({
        obra_id: link.obra_id ?? "",
        ok: false,
        error: "obra_id e property_id são obrigatórios",
      })
      continue
    }

    const { data: obra } = await supabase
      .from("obras")
      .select("id, property_id")
      .eq("id", link.obra_id)
      .eq("org_id", appUser.org_id)
      .single()

    if (!obra) {
      results.push({
        obra_id: link.obra_id,
        ok: false,
        error: "Obra não encontrada",
      })
      continue
    }

    if (obra.property_id !== null && obra.property_id !== link.property_id) {
      results.push({
        obra_id: link.obra_id,
        ok: false,
        error: "Obra já vinculada a outro empreendimento",
      })
      continue
    }

    if (obra.property_id === link.property_id) {
      results.push({ obra_id: link.obra_id, ok: true })
      continue
    }

    const { error: updateError } = await supabase
      .from("obras")
      .update({ property_id: link.property_id })
      .eq("id", link.obra_id)
      .is("property_id", null)
      .eq("org_id", appUser.org_id)

    if (updateError) {
      results.push({
        obra_id: link.obra_id,
        ok: false,
        error: updateError.message,
      })
    } else {
      results.push({ obra_id: link.obra_id, ok: true })
    }
  }

  const successCount = results.filter((r) => r.ok).length

  return NextResponse.json({ results, successCount })
}
