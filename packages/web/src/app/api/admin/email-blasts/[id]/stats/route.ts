import { NextRequest, NextResponse } from "next/server"
import { can } from "@web/lib/permissions"
import { getServerUser } from "@web/lib/auth"
import { createAdminClient } from "@web/lib/supabase/admin"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getServerUser()
  if (!(await can(user.id, user.orgId, "sistema.emails_disparar"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const supabase = createAdminClient()

  const { data: blast } = await supabase
    .from("email_blasts")
    .select(
      "id, name, status, total_recipients, scheduled_for, created_at, ab_test_enabled, ab_test_variable, subject_variant_a, subject_variant_b, body_variant_a_template_id, body_variant_b_template_id"
    )
    .eq("id", id)
    .eq("org_id", user.orgId)
    .single()

  if (!blast) return NextResponse.json({ error: "Blast não encontrado" }, { status: 404 })

  let bodyVariantAName: string | null = null
  let bodyVariantBName: string | null = null
  if (blast.ab_test_variable === "body") {
    const templateIds = [blast.body_variant_a_template_id, blast.body_variant_b_template_id].filter(
      (v): v is string => !!v
    )
    const { data: variantTemplates } = await supabase
      .from("email_templates")
      .select("id, name")
      .in("id", templateIds)
    bodyVariantAName = variantTemplates?.find((t) => t.id === blast.body_variant_a_template_id)?.name ?? null
    bodyVariantBName = variantTemplates?.find((t) => t.id === blast.body_variant_b_template_id)?.name ?? null
  }

  const { data: logs } = await supabase
    .from("email_logs")
    .select("status, variant, opened_at, clicked_at")
    .like("triggered_by", `blast:${id}%`)
    .eq("org_id", user.orgId)

  const stats = { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0, pending: 0 }
  for (const log of logs ?? []) {
    const s = log.status as keyof typeof stats
    if (s in stats) stats[s]++
  }

  const byVariant = blast.ab_test_enabled
    ? {
        a: aggregateVariant(logs ?? [], "a"),
        b: aggregateVariant(logs ?? [], "b"),
      }
    : null

  return NextResponse.json({
    data: {
      ...blast,
      ...stats,
      total_logs: logs?.length ?? 0,
      by_variant: byVariant,
      body_variant_a_name: bodyVariantAName,
      body_variant_b_name: bodyVariantBName,
    },
  })
}

interface VariantLog {
  variant: string | null
  opened_at: string | null
  clicked_at: string | null
}

function aggregateVariant(logs: VariantLog[], variant: "a" | "b") {
  const variantLogs = logs.filter((l) => l.variant === variant)
  const sent = variantLogs.length
  const opened = variantLogs.filter((l) => l.opened_at != null).length
  const clicked = variantLogs.filter((l) => l.clicked_at != null).length

  return {
    sent,
    opened,
    opened_rate: sent > 0 ? opened / sent : 0,
    clicked,
    click_rate: sent > 0 ? clicked / sent : 0,
  }
}
