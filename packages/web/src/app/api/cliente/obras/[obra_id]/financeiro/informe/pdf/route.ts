import { NextRequest, NextResponse } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"
import { createElement } from "react"
import { requireAuth } from "@web/lib/api-auth"
import { getFinancialStatement, getIncomeTax, computeInformeFromStatements } from "@web/lib/integrations/sienge/client"
import { InformePDF } from "@web/lib/pdf/informe-pdf"

const CURRENT_YEAR = new Date().getFullYear()

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ obra_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const { obra_id } = await params
  const { searchParams } = req.nextUrl

  const rawYear = searchParams.get("ano")
  const year = rawYear ? parseInt(rawYear) : CURRENT_YEAR - 1

  if (isNaN(year) || year < 2000 || year > CURRENT_YEAR) {
    return NextResponse.json({ error: "Ano inválido" }, { status: 400 })
  }

  // Valida acesso
  const { data: vinculo } = await supabase
    .from("cliente_obras")
    .select("obra_id")
    .eq("obra_id", obra_id)
    .eq("user_id", appUser.id)
    .single()

  if (!vinculo) {
    return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 })
  }

  const [{ data: obra }, { data: portalUser }] = await Promise.all([
    supabase.from("obras").select("id, name").eq("id", obra_id).single(),
    supabase.from("users").select("name, cpf, email, sienge_customer_id").eq("id", appUser.id).single(),
  ])

  if (!obra) {
    return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 })
  }

  // Resolve sienge_customer_id
  let siengeCustomerId: number | null = portalUser?.sienge_customer_id ?? null

  if (!siengeCustomerId && portalUser?.email) {
    const { data: vinculos } = await supabase
      .from("clientes_obras_vinculos")
      .select("clientes(sienge_customer_id, email)")
      .eq("obra_id", obra_id)

    for (const v of vinculos ?? []) {
      const c = Array.isArray(v.clientes) ? v.clientes[0] : v.clientes
      if ((c as { email?: string | null })?.email === portalUser.email) {
        siengeCustomerId =
          (c as { sienge_customer_id?: number | null })?.sienge_customer_id ?? null
        break
      }
    }
  }

  if (!siengeCustomerId) {
    return NextResponse.json({ error: "Extrato não disponível" }, { status: 404 })
  }

  // Busca installments (necessário para fallback e filtragem por obra)
  let installments
  try {
    installments = await getFinancialStatement(siengeCustomerId)
  } catch {
    return NextResponse.json({ error: "Erro ao buscar dados financeiros" }, { status: 502 })
  }

  // Filtra por contrato da obra
  const { data: vinculos } = await supabase
    .from("clientes_obras_vinculos")
    .select("sienge_contract_numbers, clientes(sienge_customer_id)")
    .eq("obra_id", obra_id)

  const vinculoCliente = (vinculos ?? []).find((v) => {
    const c = Array.isArray(v.clientes) ? v.clientes[0] : v.clientes
    return (c as { sienge_customer_id?: number | null })?.sienge_customer_id === siengeCustomerId
  })

  const contractNumbers =
    (vinculoCliente as { sienge_contract_numbers?: string[] | null } | undefined)
      ?.sienge_contract_numbers ?? []

  if (contractNumbers.length > 0) {
    installments = installments.filter((i) => contractNumbers.includes(i.documentId))
  }

  // Tenta endpoint dedicado; fallback para cálculo via extrato
  let informe
  try {
    const siengeResult = await getIncomeTax(siengeCustomerId, year)
    if (siengeResult?.results?.[0]) {
      const r = siengeResult.results[0]
      const contracts = r.enterprises.flatMap((e) => e.contracts)
      informe = {
        year,
        totalPaidInYear: contracts.reduce((s, c) => s + c.paidValueInYear, 0),
        accumulatedPaid: contracts.reduce((s, c) => s + c.accumulatedPaidValue, 0),
        remainingBalance: contracts.reduce((s, c) => s + c.remainingBalance, 0),
        totalContractValue: contracts.reduce((s, c) => s + c.totalContractValue, 0),
        contractNumbers: contracts.map((c) => c.contractNumber),
        monthlyBreakdown: contracts
          .flatMap((c) => c.payments)
          .reduce(
            (acc, p) => {
              const existing = acc.find((a) => a.month === p.month)
              if (existing) { existing.value += p.value }
              else { acc.push({ month: p.month, monthName: "", value: p.value, installments: [] }) }
              return acc
            },
            [] as { month: number; monthName: string; value: number; installments: { number: string; value: number; date: string }[] }[]
          ),
        source: "sienge" as const,
      }
    } else {
      informe = computeInformeFromStatements(installments, year)
    }
  } catch {
    informe = computeInformeFromStatements(installments, year)
  }

  const geradoEm = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  })

  const pdfElement = createElement(InformePDF, {
    obraName: obra.name,
    clienteName: portalUser?.name ?? "Cliente",
    clienteCpf: portalUser?.cpf ?? null,
    informe,
    geradoEm,
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(pdfElement as any)

  const safeName = obra.name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "-")
    .toLowerCase()

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="informe-${year}-${safeName}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  })
}
