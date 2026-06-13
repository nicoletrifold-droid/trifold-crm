import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"

type Params = { params: Promise<{ id: string }> }

// GET — List images for a campaign
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = requireRole(appUser, ["admin", "supervisor"])
  if (forbidden) return forbidden

  const { id: campaignId } = await params

  const { data, error } = await supabase
    .from("campaign_email_images")
    .select("id, variant_id, image_url, link_url, alt_text, sort_order, created_at")
    .eq("campaign_id", campaignId)
    .order("sort_order", { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

// POST — Add image variant to campaign
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = requireRole(appUser, ["admin", "supervisor"])
  if (forbidden) return forbidden

  const { id: campaignId } = await params
  const body = await request.json()
  const { image_url, link_url, alt_text, variant_id, sort_order } = body

  if (!image_url) {
    return NextResponse.json({ error: "image_url required" }, { status: 400 })
  }

  // Verify campaign belongs to org
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", campaignId)
    .eq("org_id", appUser.org_id)
    .single()

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
  }

  const { data, error } = await supabase
    .from("campaign_email_images")
    .insert({
      campaign_id: campaignId,
      image_url,
      link_url: link_url ?? null,
      alt_text: alt_text ?? null,
      sort_order: sort_order ?? 0,
      ...(variant_id ? { variant_id } : {}),
    })
    .select("id, variant_id, image_url, link_url, alt_text")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}

// DELETE — Remove image variant
export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = requireRole(appUser, ["admin", "supervisor"])
  if (forbidden) return forbidden

  const { id: campaignId } = await params
  const imageId = request.nextUrl.searchParams.get("image_id")

  if (!imageId) {
    return NextResponse.json({ error: "image_id query param required" }, { status: 400 })
  }

  // RLS garante que só acessa imagens da própria org
  const { error } = await supabase
    .from("campaign_email_images")
    .delete()
    .eq("id", imageId)
    .eq("campaign_id", campaignId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
