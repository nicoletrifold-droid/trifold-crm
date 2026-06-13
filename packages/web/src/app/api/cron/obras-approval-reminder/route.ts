import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { sendEmail } from "@web/lib/email"

const CRON_SECRET = process.env.CRON_SECRET
const REMINDER_INTERVAL_MS = 48 * 60 * 60 * 1000 // 48 horas

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!CRON_SECRET) {
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 })
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient()
  const threshold = new Date(Date.now() - REMINDER_INTERVAL_MS).toISOString()

  // Busca aprovações pendentes que precisam de lembrete:
  // - nunca lembradas E criadas há mais de 48h, OU
  // - último lembrete há mais de 48h
  const { data: pendentes, error } = await admin
    .from("obra_upload_aprovacoes")
    .select("id, org_id, obra_id, tipo, created_at, last_reminder_sent_at, obra:obras!obra_id(name)")
    .eq("status", "pendente")
    .or(`last_reminder_sent_at.is.null,last_reminder_sent_at.lte.${threshold}`)
    .lte("created_at", threshold)

  if (error) {
    console.error("[obras-reminder] fetch error:", error)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }

  if (!pendentes?.length) {
    return NextResponse.json({ processed: 0, notified_orgs: 0 })
  }

  // Agrupa por org
  const byOrg = new Map<string, { obraIds: Set<string>; count: number; ids: string[] }>()
  for (const p of pendentes) {
    const existing = byOrg.get(p.org_id) ?? { obraIds: new Set(), count: 0, ids: [] }
    existing.obraIds.add(p.obra_id)
    existing.count++
    existing.ids.push(p.id)
    byOrg.set(p.org_id, existing)
  }

  let notifiedOrgs = 0

  for (const [orgId, { count, ids }] of byOrg.entries()) {
    // Busca admins e supervisors da org
    const { data: admins } = await admin
      .from("users")
      .select("name, email")
      .eq("org_id", orgId)
      .in("role", ["admin", "supervisor"])
      .not("email", "is", null)

    if (!admins?.length) continue

    const link = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/obras`
    const plural = count > 1 ? `${count} itens aguardam` : `1 item aguarda`

    await Promise.allSettled(
      admins.map((u: { name: string; email: string }) =>
        sendEmail({
          to: u.email,
          subject: `[Trifold] Lembrete: ${plural} aprovação em Obras`,
          html: `<p>Olá ${u.name},</p>
                 <p>Existem <strong>${count} ${count > 1 ? "itens pendentes" : "item pendente"}</strong> de aprovação no módulo Obras há mais de 48 horas.</p>
                 <p>Por favor, acesse o sistema e revise as pendências para não atrasar o andamento das obras.</p>
                 <p><a href="${link}">Acessar módulo Obras</a></p>`,
        })
      )
    )

    // Atualiza last_reminder_sent_at para os itens notificados
    await admin
      .from("obra_upload_aprovacoes")
      .update({ last_reminder_sent_at: new Date().toISOString() })
      .in("id", ids)

    notifiedOrgs++
  }

  console.log(`[obras-reminder] ${pendentes.length} pendentes → ${notifiedOrgs} orgs notificadas`)
  return NextResponse.json({ processed: pendentes.length, notified_orgs: notifiedOrgs })
}
