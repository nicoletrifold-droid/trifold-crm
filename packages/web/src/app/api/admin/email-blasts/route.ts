import { NextRequest, NextResponse, after } from "next/server"
import { getServerUser } from "@web/lib/auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { sendTemplateEmail, getEmailsSentToday } from "@web/lib/email"
import { createClient } from "@supabase/supabase-js"

type SegmentFilter = {
  type: "all" | "by_stage" | "by_source" | "by_property"
  stage_ids?: string[]
  sources?: string[]
  property_id?: string
}

interface Lead {
  id: string
  name: string | null
  email: string
  phone: string | null
}

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function distributeOverDays(
  recipients: Lead[],
  startDate: Date,
  dailyQuota = 95
): Array<{ lead: Lead; scheduledFor: Date }> {
  return recipients.map((lead, index) => {
    const dayOffset = Math.floor(index / dailyQuota)
    const scheduled = new Date(startDate)
    scheduled.setDate(scheduled.getDate() + dayOffset)
    // Spread sends across 8h–22h BRT to avoid sending everything at midnight
    const slotInDay = index % dailyQuota
    const minuteOffset = Math.floor((slotInDay / dailyQuota) * 14 * 60)
    scheduled.setHours(8, minuteOffset % 60, 0, 0)
    return { lead, scheduledFor: scheduled }
  })
}

export async function GET(_request: NextRequest) {
  const user = await getServerUser()
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("email_blasts")
    .select(
      "id, name, status, total_recipients, sent_count, scheduled_for, created_at, template_id, email_templates(name)"
    )
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(request: NextRequest) {
  const user = await getServerUser()
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await request.json() as {
    name: string
    template_id: string
    template_slug: string
    subject_override?: string
    segment_filter: SegmentFilter
    scheduled_for?: string
  }

  if (!body.name?.trim()) return NextResponse.json({ error: "name é obrigatório" }, { status: 400 })
  if (!body.template_id) return NextResponse.json({ error: "template_id é obrigatório" }, { status: 400 })
  if (!body.template_slug) return NextResponse.json({ error: "template_slug é obrigatório" }, { status: 400 })
  if (!body.segment_filter?.type) return NextResponse.json({ error: "segment_filter é obrigatório" }, { status: 400 })

  const supabase = createAdminClient()
  const serviceClient = createServiceClient()

  // Fetch audience
  let query = supabase
    .from("leads")
    .select("id, name, email, phone")
    .eq("org_id", user.orgId)
    .eq("is_active", true)
    .not("email", "is", null)

  const sf = body.segment_filter
  if (sf.type === "by_stage" && sf.stage_ids?.length) query = query.in("stage_id", sf.stage_ids)
  if (sf.type === "by_source" && sf.sources?.length) query = query.in("source", sf.sources)
  if (sf.type === "by_property" && sf.property_id) query = query.eq("property_interest_id", sf.property_id)

  const { data: leads } = await query
  const recipients = (leads ?? []).filter((l): l is Lead => !!l.email)

  if (recipients.length === 0) {
    return NextResponse.json({ error: "Nenhum lead com email encontrado para o segmento." }, { status: 400 })
  }

  // Create blast record
  const startDate = body.scheduled_for ? new Date(body.scheduled_for) : new Date()
  const { data: blast, error: blastError } = await supabase
    .from("email_blasts")
    .insert({
      org_id: user.orgId,
      name: body.name.trim(),
      template_id: body.template_id,
      subject_override: body.subject_override ?? null,
      segment_filter: body.segment_filter,
      total_recipients: recipients.length,
      sent_count: 0,
      status: "scheduled",
      scheduled_for: startDate.toISOString(),
      created_by: user.id,
    })
    .select("id")
    .single()

  if (blastError || !blast) {
    return NextResponse.json({ error: blastError?.message ?? "Falha ao criar blast" }, { status: 500 })
  }

  // Check current quota and determine daily capacity
  const sentToday = await getEmailsSentToday(user.orgId, serviceClient)
  const remainingToday = Math.max(0, 95 - sentToday)
  const effectiveStart = remainingToday === 0 ? (() => {
    const d = new Date(startDate)
    d.setDate(d.getDate() + 1)
    return d
  })() : startDate

  const distributed = distributeOverDays(recipients, effectiveStart)

  // Enqueue all emails after response is sent (guaranteed by after())
  const blastId = blast.id
  const templateSlug = body.template_slug
  const subjectOverride = body.subject_override

  after(async () => {
    await supabase
      .from("email_blasts")
      .update({ status: "in_progress", started_at: new Date().toISOString() })
      .eq("id", blastId)

    for (const { lead, scheduledFor } of distributed) {
      await sendTemplateEmail({
        templateSlug,
        to: { email: lead.email, name: lead.name ?? undefined },
        variables: {
          nome: lead.name ?? "",
          email: lead.email,
          telefone: lead.phone ?? "",
        },
        triggeredBy: `blast:${blastId}`,
        orgId: user.orgId,
        scheduledFor,
        priority: 10,
        subjectOverride,
      })
    }
  })

  return NextResponse.json({ data: { id: blastId, total_recipients: recipients.length } }, { status: 201 })
}
