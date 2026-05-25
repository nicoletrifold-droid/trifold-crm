import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

async function extractFormId(url: string): Promise<string | null> {
  let resolved = url
  if (/forms\.gle\//.test(url)) {
    try {
      const res = await fetch(url, { method: "GET", redirect: "follow" })
      resolved = res.url
    } catch {
      return null
    }
  }

  // Editor URL: /forms/d/{FORM_ID}/...
  const editorMatch = resolved.match(/\/forms\/d\/([a-zA-Z0-9_-]{20,})(?:\/|$)/)
  if (editorMatch && editorMatch[1] !== undefined && editorMatch[1] !== "e") {
    return editorMatch[1]
  }

  // Published URL: /forms/d/e/.../viewform — fetch HTML to find real ID
  if (/\/forms\/d\/e\//.test(resolved)) {
    try {
      const pageUrl = resolved.includes("/viewform")
        ? resolved
        : resolved.replace(/\/?$/, "/viewform")
      const res = await fetch(pageUrl)
      const html = await res.text()
      const fbMatch = html.match(/\/forms\/d\/([a-zA-Z0-9_-]{20,})/)
      if (fbMatch && fbMatch[1] !== undefined && fbMatch[1] !== "e") return fbMatch[1]
    } catch {
      return null
    }
  }

  return null
}

// POST — Create campaign
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = requireRole(appUser, ["admin", "supervisor"])
  if (forbidden) return forbidden

  const body = await request.json()
  const {
    name,
    description,
    property_id,
    starts_at,
    ends_at,
    form_url,
    whatsapp_template_name,
    email_enabled,
    email_subject,
    email_body_html,
    field_mapping,
  } = body

  if (!name || !starts_at || !ends_at) {
    return NextResponse.json(
      { error: "name, starts_at, ends_at are required" },
      { status: 400 }
    )
  }

  const slug = slugify(name)
  const google_form_id = form_url ? await extractFormId(form_url) : null

  const { data, error } = await supabase
    .from("campaigns")
    .insert({
      org_id: appUser.org_id,
      name,
      slug,
      description: description ?? null,
      property_id: property_id ?? null,
      starts_at,
      ends_at,
      form_url: form_url ?? null,
      google_form_id,
      whatsapp_template_name: whatsapp_template_name ?? null,
      email_enabled: email_enabled ?? true,
      email_subject: email_subject ?? null,
      email_body_html: email_body_html ?? null,
      field_mapping: field_mapping ?? {},
      status: "draft",
    })
    .select()
    .single()

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Campaign with this name already exists" },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}

// GET — List campaigns with metrics
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = requireRole(appUser, ["admin", "supervisor"])
  if (forbidden) return forbidden

  const { data: campaigns, error } = await supabase
    .from("campaigns")
    .select(
      `id, name, slug, description, starts_at, ends_at, type, status, created_at,
       property_id, properties:property_id(name)`
    )
    .eq("org_id", appUser.org_id)
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fetch entry counts per campaign
  const campaignIds = (campaigns ?? []).map((c) => c.id)

  let entryCounts: Record<string, { total: number; valid: number }> = {}

  if (campaignIds.length > 0) {
    const { data: entries } = await supabase
      .from("campaign_entries")
      .select("campaign_id, is_valid_phone, is_valid_email")
      .in("campaign_id", campaignIds)

    entryCounts = (entries ?? []).reduce(
      (acc, e) => {
        const cid = e.campaign_id
        if (!acc[cid]) acc[cid] = { total: 0, valid: 0 }
        acc[cid].total++
        if (e.is_valid_phone && e.is_valid_email) acc[cid].valid++
        return acc
      },
      {} as Record<string, { total: number; valid: number }>
    )
  }

  const result = (campaigns ?? []).map((c) => {
    const counts = entryCounts[c.id] ?? { total: 0, valid: 0 }
    return {
      ...c,
      properties: Array.isArray(c.properties)
        ? c.properties[0] ?? null
        : c.properties ?? null,
      total_entries: counts.total,
      valid_entries: counts.valid,
      validation_rate:
        counts.total > 0
          ? Math.round((counts.valid / counts.total) * 100)
          : 0,
    }
  })

  return NextResponse.json({ data: result })
}
