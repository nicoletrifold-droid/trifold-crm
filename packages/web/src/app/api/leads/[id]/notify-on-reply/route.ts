import { NextRequest, NextResponse } from "next/server"
import { can } from "@web/lib/permissions"
import { requireAuth } from "@web/lib/api-auth"
import { createOrgScopedAdminClient } from "@web/lib/supabase/org-scoped-admin"

/**
 * Story 63-10 (Epic 63) — Preferência "me avisar quando o lead responder".
 *
 * POST /api/leads/[id]/notify-on-reply
 * Body (opcional): { enabled?: boolean }  (default: true)
 *
 * Grava `leads.metadata.notify_broker_on_reply` (JSONB). Endpoint DEDICADO
 * porque `PATCH /api/leads/[id]` restringe `allowedFields` e descarta `metadata`
 * silenciosamente (route L65-85). Autorização é feita com a sessão do usuário
 * (RLS por org + ownership do corretor); a escrita do JSONB usa admin client
 * para fazer o merge sem esbarrar em RLS de coluna.
 *
 * Esta story NÃO implementa a notificação real — apenas persiste a preferência
 * (a entrega quando o lead responde é escopo futuro no webhook do WhatsApp).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  // --- Ownership: admin/supervisor/gerente OU corretor atribuído ---
  const { data: lead } = await supabase
    .from("leads")
    .select("id, assigned_broker_id, metadata")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .single()

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 })
  }

  const isPrivileged = await can(appUser.id, appUser.org_id, "leads.anotar_qualquer")
  if (!isPrivileged && lead.assigned_broker_id !== appUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Body opcional; default true (idempotente — sempre seta o mesmo valor).
  const body = await request.json().catch(() => null)
  const enabled = typeof body?.enabled === "boolean" ? body.enabled : true

  // Merge preservando o JSONB existente (não clobbra outros campos de metadata).
  const currentMetadata =
    (lead.metadata as Record<string, unknown> | null) ?? {}
  const nextMetadata = { ...currentMetadata, notify_broker_on_reply: enabled }

  const admin = createOrgScopedAdminClient(appUser.org_id)
  const { error } = await admin
    .from("leads")
    .update({ metadata: nextMetadata })
    .eq("id", id)
    .eq("org_id", appUser.org_id)

  if (error) {
    return NextResponse.json(
      { error: "UPDATE_FAILED", message: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, notifyOnReply: enabled })
}
