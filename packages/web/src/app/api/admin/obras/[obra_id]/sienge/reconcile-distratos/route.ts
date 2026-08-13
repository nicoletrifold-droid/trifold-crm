import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireCapability } from "@web/lib/api-auth"
import { reconcileDistratosForObra } from "@web/lib/integrations/sienge/sync"


/**
 * Story 20.9 (AC 9) — Remediação: reconstrói `sienge_contract_situations` e
 * recalcula `distrato` para todos os vínculos da obra a partir do Sienge.
 * Usado para corrigir os contratos "Cancelado" já existentes em produção.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ obra_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = await requireCapability(appUser, "obras.sienge_gerenciar")
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
    const result = await reconcileDistratosForObra(obra_id)
    return NextResponse.json({
      success: true,
      reconciled: result.reconciled,
      distratados: result.distratados,
      errors: result.errors,
    })
  } catch (err) {
    console.error(
      "[admin/obras/sienge/reconcile-distratos] erro:",
      err instanceof Error ? err.message : err
    )
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno na remediação" },
      { status: 500 }
    )
  }
}

// Remediação chama a API Sienge (rate limit + paginação) — aumenta o timeout.
export const maxDuration = 300
