import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { getFinancialStatement, getPaymentSlip } from "@web/lib/integrations/sienge/client"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ obra_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const { obra_id } = await params
  const { searchParams } = req.nextUrl

  const billReceivableId = Number(searchParams.get("billReceivableId"))
  const installmentId = Number(searchParams.get("installmentId"))

  if (!billReceivableId || !installmentId) {
    return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 })
  }

  // Valida acesso do portal user a esta obra
  const { data: vinculo } = await supabase
    .from("cliente_obras")
    .select("obra_id")
    .eq("obra_id", obra_id)
    .eq("user_id", appUser.id)
    .single()

  if (!vinculo) {
    return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 })
  }

  // Resolve sienge_customer_id (mesmo fluxo do GET financeiro)
  const { data: portalUser } = await supabase
    .from("users")
    .select("sienge_customer_id, email")
    .eq("id", appUser.id)
    .single()

  let siengeCustomerId: number | null = portalUser?.sienge_customer_id ?? null

  if (!siengeCustomerId && portalUser?.email) {
    const { data: vinculos } = await supabase
      .from("clientes_obras_vinculos")
      .select("clientes(sienge_customer_id, email)")
      .eq("obra_id", obra_id)

    for (const v of vinculos ?? []) {
      const c = Array.isArray(v.clientes) ? v.clientes[0] : v.clientes
      if ((c as { email?: string | null })?.email === portalUser.email) {
        siengeCustomerId = (c as { sienge_customer_id?: number | null })?.sienge_customer_id ?? null
        break
      }
    }
  }

  if (!siengeCustomerId) {
    return NextResponse.json({ error: "Integração Sienge não configurada" }, { status: 404 })
  }

  // Prevenção IDOR: valida que a parcela pertence ao sienge_customer_id deste usuário
  let installmentValid = false
  try {
    const installments = await getFinancialStatement(siengeCustomerId)
    installmentValid = installments.some(
      (i) => i.billReceivableId === billReceivableId && i.installmentId === installmentId
    )
  } catch {
    return NextResponse.json({ error: "Erro ao validar parcela" }, { status: 502 })
  }

  if (!installmentValid) {
    return NextResponse.json({ error: "Parcela não encontrada" }, { status: 404 })
  }

  // Busca URL do boleto
  let slip
  try {
    slip = await getPaymentSlip(billReceivableId, installmentId)
  } catch {
    return NextResponse.json({ error: "Erro ao buscar boleto" }, { status: 502 })
  }

  const url = slip?.url
  if (!url) {
    return NextResponse.json({ error: "URL do boleto não disponível" }, { status: 404 })
  }

  return NextResponse.redirect(url)
}
