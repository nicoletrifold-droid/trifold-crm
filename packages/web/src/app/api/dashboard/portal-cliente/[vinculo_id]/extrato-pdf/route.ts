import { NextRequest, NextResponse } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"
import { createElement } from "react"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { getViewerVinculo } from "@web/lib/portal/viewer"
import { getFinancialStatement } from "@web/lib/integrations/sienge/client"
import { ExtratoPDF } from "@web/lib/pdf/extrato-pdf"

// Story 78-2 — PDF do extrato na Visão Mestre (admin, leitura). Resolve o cliente
// pelo VÍNCULO; gate admin/supervisor. Mesma geração do portal (ExtratoPDF).
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
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
  const de = searchParams.get("de") ?? undefined
  const ate = searchParams.get("ate") ?? undefined

  if ((de && !ISO_DATE.test(de)) || (ate && !ISO_DATE.test(ate))) {
    return NextResponse.json({ error: "Formato de data inválido" }, { status: 400 })
  }

  const admin = createAdminClient()
  const ctx = await getViewerVinculo(admin, vinculo_id, appUser.org_id)
  if (!ctx || !ctx.siengeCustomerId) {
    return NextResponse.json({ error: "Extrato não disponível" }, { status: 404 })
  }

  let installments
  try {
    installments = await getFinancialStatement(ctx.siengeCustomerId)
  } catch {
    return NextResponse.json({ error: "Erro ao buscar dados financeiros" }, { status: 502 })
  }

  if (ctx.contractNumbers.length > 0) {
    installments = installments.filter((i) => ctx.contractNumbers.includes(i.documentId))
  }
  if (de) installments = installments.filter((i) => i.dueDate >= de)
  if (ate) installments = installments.filter((i) => i.dueDate <= ate)
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
    obraName: ctx.obra.name,
    clienteName: ctx.clienteNome ?? "Cliente",
    clienteCpf: ctx.clienteCpf,
    installments,
    de,
    ate,
    geradoEm,
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(pdfElement as any)

  const safeName = ctx.obra.name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
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
