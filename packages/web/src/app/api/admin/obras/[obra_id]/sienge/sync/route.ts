import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { syncObraClientes } from "@web/lib/integrations/sienge/sync"

const ALLOWED_ROLES = ["admin", "supervisor"]

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ obra_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = requireRole(appUser, ALLOWED_ROLES)
  if (roleError) return roleError

  const { obra_id } = await params

  // Valida obra pertence à org + tem enterprise_id
  const { data: obra } = await supabase
    .from("obras")
    .select("id, sienge_enterprise_id")
    .eq("id", obra_id)
    .eq("org_id", appUser.org_id)
    .is("deleted_at", null)
    .maybeSingle()

  if (!obra) {
    return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 })
  }

  if (!(obra as { sienge_enterprise_id?: number | null }).sienge_enterprise_id) {
    return NextResponse.json(
      { error: "Obra não tem empreendimento Sienge vinculado" },
      { status: 400 }
    )
  }

  try {
    const result = await syncObraClientes(obra_id)
    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error ?? "Falha no sync",
          synced: result.synced,
          created: result.created,
          invited: result.invited,
        },
        { status: 502 }
      )
    }

    return NextResponse.json({
      success: true,
      synced: result.synced,
      created: result.created,
      invited: result.invited,
    })
  } catch (err) {
    console.error(
      "[admin/obras/sienge/sync] erro:",
      err instanceof Error ? err.message : err
    )
    return NextResponse.json(
      { error: "Erro interno no sync" },
      { status: 500 }
    )
  }
}

// Sync pode demorar (rate limit Sienge + paginação). Aumenta timeout.
export const maxDuration = 300
