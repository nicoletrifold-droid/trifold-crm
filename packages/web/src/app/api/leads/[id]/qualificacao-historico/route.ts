import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { canAccess } from "@web/lib/permissions"
import { createOrgScopedAdminClient } from "@web/lib/supabase/org-scoped-admin"

/**
 * GET /api/leads/[id]/qualificacao-historico
 *
 * Story 84-2 (Epic 84) — histórico de mudanças da Qualificação Comercial, lido de
 * `audit_logs` (gravado pela Story 84-1). `audit_logs` tem RLS que restringe SELECT a
 * `role = 'admin'` (059_audit_logs.sql) — por isso usamos `createOrgScopedAdminClient(appUser.org_id)` (bypassa
 * RLS) com o gate de permissão feito aqui em código (`leads.qualificacao`), para liberar
 * o histórico a qualquer role com essa permissão, não só admin. O filtro por `org_id` é
 * OBRIGATÓRIO (o admin client não tem isolamento multi-tenant automático).
 *
 * QA (SEC-001): `leads.qualificacao` é permissão de MÓDULO, não do lead específico — sem
 * checagem extra, um corretor com essa permissão conseguiria ver o histórico de leads
 * atribuídos a OUTROS corretores, o que a política `leads_select`
 * (`004_rls_policies.sql:104-112`) bloqueia para a leitura normal do lead. Por isso, ANTES
 * de usar o admin client, confirmamos que o usuário pode ver este lead com o client
 * RLS-scoped dele (`supabase`, não `admin`) — mesma política que já protege
 * `GET /api/leads/[id]`, sem duplicar a lógica de `assigned_broker_id` em código novo.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!(await canAccess(appUser.id, appUser.org_id, "leads.qualificacao"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data: leadCheck } = await supabase
    .from("leads")
    .select("id")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!leadCheck) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 })
  }

  const admin = createOrgScopedAdminClient(appUser.org_id)
  const { data, error } = await admin
    .from("audit_logs")
    .select("id, user_name, created_at, metadata")
    .eq("org_id", appUser.org_id)
    .eq("entity_type", "lead")
    .eq("entity_id", id)
    .eq("action", "lead.qualificacao_comercial_updated")
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: "Erro ao buscar histórico" }, { status: 500 })
  }

  const historico = (data ?? []).map((row) => {
    const metadata = (row.metadata as Record<string, unknown> | null) ?? {}
    return {
      id: row.id as string,
      user_name: row.user_name as string,
      created_at: row.created_at as string,
      old_value: (metadata.old_value as string | null) ?? null,
      new_value: (metadata.new_value as string | null) ?? null,
    }
  })

  return NextResponse.json({ historico })
}
