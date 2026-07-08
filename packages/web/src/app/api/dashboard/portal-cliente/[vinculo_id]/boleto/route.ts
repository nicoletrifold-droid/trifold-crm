import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { getViewerVinculo } from "@web/lib/portal/viewer"
import { getFinancialStatement, getPaymentSlip } from "@web/lib/integrations/sienge/client"

// Story 78-2 — download do boleto (PDF do Sienge) na Visão Mestre (admin, leitura).
// Diferente da rota do portal do cliente, resolve o cliente pelo VÍNCULO (não pela
// sessão do cliente); gate admin/supervisor. Mantém a prevenção de IDOR (a parcela
// tem que pertencer ao sienge_customer_id daquele vínculo).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ vinculo_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser } = auth
  const forbidden = requireRole(appUser, ["admin", "supervisor"])
  if (forbidden) return forbidden

  const { vinculo_id } = await params
  const { searchParams } = req.nextUrl
  const billReceivableId = Number(searchParams.get("billReceivableId"))
  const installmentId = Number(searchParams.get("installmentId"))

  if (!billReceivableId || !installmentId) {
    return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 })
  }

  const admin = createAdminClient()
  const ctx = await getViewerVinculo(admin, vinculo_id, appUser.org_id)
  if (!ctx || !ctx.siengeCustomerId) {
    return NextResponse.json({ error: "Cliente sem vínculo Sienge" }, { status: 404 })
  }

  // Prevenção IDOR: a parcela precisa pertencer ao cliente deste vínculo.
  try {
    const installments = await getFinancialStatement(ctx.siengeCustomerId)
    const ok = installments.some(
      (i) => i.billReceivableId === billReceivableId && i.installmentId === installmentId
    )
    if (!ok) {
      return NextResponse.json({ error: "Parcela não encontrada" }, { status: 404 })
    }
  } catch {
    return NextResponse.json({ error: "Erro ao validar parcela" }, { status: 502 })
  }

  let slip
  try {
    slip = await getPaymentSlip(billReceivableId, installmentId)
  } catch {
    return NextResponse.json({ error: "Erro ao buscar boleto" }, { status: 502 })
  }

  const url = slip?.results?.[0]?.urlReport
  if (!url) {
    return NextResponse.json({ error: "URL do boleto não disponível" }, { status: 404 })
  }

  return NextResponse.redirect(url)
}
