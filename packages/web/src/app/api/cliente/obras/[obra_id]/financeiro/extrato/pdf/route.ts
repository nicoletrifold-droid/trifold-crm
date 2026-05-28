import { NextRequest, NextResponse } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"
import { createElement } from "react"
import { requireAuth } from "@web/lib/api-auth"
import { getFinancialStatement } from "@web/lib/integrations/sienge/client"
import { ExtratoPDF } from "@web/lib/pdf/extrato-pdf"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ obra_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const { obra_id } = await params
  const { searchParams } = req.nextUrl
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
  const de = searchParams.get("de") ?? undefined
  const ate = searchParams.get("ate") ?? undefined

  if ((de && !ISO_DATE.test(de)) || (ate && !ISO_DATE.test(ate))) {
    return NextResponse.json({ error: "Formato de data inválido" }, { status: 400 })
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

  // Busca dados da obra e do usuário em paralelo
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

  let installments
  try {
    installments = await getFinancialStatement(siengeCustomerId)
  } catch {
    return NextResponse.json({ error: "Erro ao buscar dados financeiros" }, { status: 502 })
  }

  // Filtra por contrato da obra (se houver cache)
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

  // Aplica filtro de período por data de vencimento
  if (de) installments = installments.filter((i) => i.dueDate >= de)
  if (ate) installments = installments.filter((i) => i.dueDate <= ate)

  // Ordena por vencimento
  installments.sort((a, b) => a.dueDate.localeCompare(b.dueDate))

  const geradoEm = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  })

  const pdfElement = createElement(ExtratoPDF, {
    obraName: obra.name,
    clienteName: portalUser?.name ?? "Cliente",
    clienteCpf: portalUser?.cpf ?? null,
    installments,
    de,
    ate,
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
      "Content-Disposition": `inline; filename="extrato-${safeName}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  })
}
