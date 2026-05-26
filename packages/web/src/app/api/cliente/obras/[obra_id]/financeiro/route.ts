import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { getFinancialStatement } from "@web/lib/integrations/sienge/client"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ obra_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const { obra_id } = await params

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

  // Busca sienge_customer_id do usuário portal
  const { data: portalUser } = await supabase
    .from("users")
    .select("sienge_customer_id, cpf, email")
    .eq("id", appUser.id)
    .single()

  let siengeCustomerId: number | null = portalUser?.sienge_customer_id ?? null

  // Fallback: busca via clientes_obras_vinculos → clientes por CPF
  if (!siengeCustomerId && portalUser?.cpf) {
    const cpfSanitized = portalUser.cpf.replace(/\D/g, "")
    const { data: vinculos } = await supabase
      .from("clientes_obras_vinculos")
      .select("clientes(sienge_customer_id, cpf)")
      .eq("obra_id", obra_id)

    for (const v of vinculos ?? []) {
      const c = Array.isArray(v.clientes) ? v.clientes[0] : v.clientes
      const clienteCpf = (c as { cpf?: string | null })?.cpf?.replace(/\D/g, "")
      if (clienteCpf === cpfSanitized) {
        siengeCustomerId = (c as { sienge_customer_id?: number | null })?.sienge_customer_id ?? null
        break
      }
    }
  }

  // Fallback: busca via clientes_obras_vinculos → clientes por email
  if (!siengeCustomerId && portalUser?.email) {
    const { data: vinculos } = await supabase
      .from("clientes_obras_vinculos")
      .select("clientes(sienge_customer_id, email)")
      .eq("obra_id", obra_id)

    for (const v of vinculos ?? []) {
      const c = Array.isArray(v.clientes) ? v.clientes[0] : v.clientes
      if ((c as { email?: string | null })?.email === portalUser.email) {
        siengeCustomerId = (c as { sienge_customer_id?: number | null })?.sienge_customer_id ?? null
        if (siengeCustomerId) {
          // Persiste para acelerar próximas consultas
          await supabase
            .from("users")
            .update({ sienge_customer_id: siengeCustomerId })
            .eq("id", appUser.id)
        }
        break
      }
    }
  }

  if (!siengeCustomerId) {
    return NextResponse.json({ configured: false, installments: [] })
  }

  try {
    let installments = await getFinancialStatement(siengeCustomerId)

    // Filtra por contract numbers desta obra (se houver cache)
    const { data: vinculos } = await supabase
      .from("clientes_obras_vinculos")
      .select("sienge_contract_numbers, clientes(sienge_customer_id)")
      .eq("obra_id", obra_id)

    const vinculo = (vinculos ?? []).find((v) => {
      const c = Array.isArray(v.clientes) ? v.clientes[0] : v.clientes
      return (
        (c as { sienge_customer_id?: number | null })?.sienge_customer_id ===
        siengeCustomerId
      )
    })

    const contractNumbers =
      (vinculo as { sienge_contract_numbers?: string[] | null } | undefined)
        ?.sienge_contract_numbers ?? []

    if (contractNumbers.length > 0) {
      installments = installments.filter((i) =>
        contractNumbers.includes(i.documentId)
      )
    }

    return NextResponse.json({ configured: true, installments })
  } catch {
    return NextResponse.json({
      configured: true,
      error: "sienge_unavailable",
      installments: [],
    })
  }
}
