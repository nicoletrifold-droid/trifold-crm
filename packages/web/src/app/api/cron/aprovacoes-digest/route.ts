import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { sendEmail } from "@web/lib/email"
import {
  getAprovadoresParaEmail,
  groupPendencias,
  renderDigestHtml,
  type PendenciaRow,
} from "@web/lib/obras/aprovacao-notifications"

/**
 * GET /api/cron/aprovacoes-digest — Story 75-194 (roda 1x/dia, 08:00 BRT).
 * Resumo diário do backlog de aprovações (obra_upload_aprovacoes pendentes):
 * UM e-mail por aprovador (admin/supervisor) listando as obras com pendências.
 * Complementa a janela de silêncio do aviso em tempo real — nada pendente
 * passa despercebido, sem flood.
 */

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!CRON_SECRET) {
    console.error("[APROVACOES_DIGEST] CRON_SECRET not configured")
    return NextResponse.json({ error: "Not configured" }, { status: 500 })
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data: pendencias, error } = await supabase
    .from("obra_upload_aprovacoes")
    .select("tipo, created_at, org_id, obra:obras(id, name)")
    .eq("status", "pendente")

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows: PendenciaRow[] = (pendencias ?? []).map((r) => ({
    tipo: r.tipo as string,
    created_at: r.created_at as string,
    org_id: r.org_id as string,
    obra: (Array.isArray(r.obra) ? r.obra[0] : r.obra) as { id: string; name: string } | null,
  }))

  const byOrg = groupPendencias(rows)
  let emailsSent = 0

  for (const [orgId, obras] of byOrg) {
    if (obras.length === 0) continue
    // Story 75-210: respeita a preferência por usuário (opt-out em Configurações).
    const admins = await getAprovadoresParaEmail(supabase, orgId)

    for (const u of admins) {
      const total = obras.reduce((s, o) => s + o.documentos + o.fotos, 0)
      await sendEmail({
        to: u.email as string,
        subject: `[Trifold] Resumo diário: ${total} pendência${total > 1 ? "s" : ""} de aprovação`,
        html: renderDigestHtml((u.name as string) ?? "", obras),
      }).catch((err) => console.error("[APROVACOES_DIGEST] sendEmail:", err))
      emailsSent++
    }
  }

  return NextResponse.json({
    success: true,
    pendencias: rows.length,
    orgs: byOrg.size,
    emailsSent,
  })
}
