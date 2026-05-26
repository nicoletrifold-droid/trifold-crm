import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import {
  searchCustomerByCpf,
  getFinancialStatement,
  getUnitIdsByEnterprise,
  getAllSalesContracts,
} from "@web/lib/integrations/sienge/client"

const ALLOWED_ROLES = ["admin", "supervisor"]

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = requireRole(appUser, ALLOWED_ROLES)
  if (roleError) return roleError

  const { id } = await params

  let body: { cpf?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const cpfRaw = body.cpf?.trim()
  if (!cpfRaw) {
    return NextResponse.json({ error: "CPF é obrigatório" }, { status: 400 })
  }

  const cpfSanitized = cpfRaw.replace(/\D/g, "")
  if (cpfSanitized.length !== 11) {
    return NextResponse.json({ error: "CPF inválido" }, { status: 400 })
  }

  // Verificar que o cliente CRM pertence à org
  const { data: crmCliente, error: clienteErr } = await supabase
    .from("clientes")
    .select("id, nome, cpf, email, sienge_customer_id")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .maybeSingle()

  if (clienteErr) {
    return NextResponse.json({ error: clienteErr.message }, { status: 500 })
  }
  if (!crmCliente) {
    return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 })
  }

  // Buscar no Sienge por CPF
  let siengeCustomer
  try {
    siengeCustomer = await searchCustomerByCpf(cpfSanitized)
  } catch {
    return NextResponse.json(
      { error: "Erro ao consultar a API Sienge. Verifique as credenciais e tente novamente." },
      { status: 502 }
    )
  }

  if (!siengeCustomer) {
    return NextResponse.json(
      { error: `Nenhum cliente encontrado no Sienge com o CPF informado` },
      { status: 404 }
    )
  }

  // Salvar sienge_customer_id na tabela clientes (CRM)
  const updates: Record<string, unknown> = {
    sienge_customer_id: siengeCustomer.id,
    updated_at: new Date().toISOString(),
  }
  if (!crmCliente.cpf) {
    updates.cpf = cpfSanitized
  }

  const { error: updateErr } = await supabase
    .from("clientes")
    .update(updates)
    .eq("id", id)
    .eq("org_id", appUser.org_id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // Espelhar sienge_customer_id no usuário portal com mesmo email (best-effort)
  if (crmCliente.email) {
    await supabase
      .from("users")
      .update({ sienge_customer_id: siengeCustomer.id })
      .eq("email", crmCliente.email)
      .eq("role", "cliente")
  }

  // Buscar contrato (best-effort — não bloqueia se falhar)
  let contrato: string | null = null
  try {
    const installments = await getFinancialStatement(siengeCustomer.id)
    const firstDocId = installments[0]?.documentId ?? null
    contrato = firstDocId
  } catch {
    // Ignorar falha opcional — vínculo já foi salvo
  }

  // Cache contract numbers nos vínculos deste cliente (obras com enterprise_id)
  // best-effort — não bloqueia retorno
  try {
    const { data: vinculos } = await supabase
      .from("clientes_obras_vinculos")
      .select(
        "id, obra_id, sienge_contract_numbers, obras(sienge_enterprise_id)"
      )
      .eq("cliente_id", id)

    const vinculosArr = vinculos ?? []
    // Coleta enterpriseIds únicos para minimizar chamadas
    const enterpriseIds = new Set<number>()
    for (const v of vinculosArr) {
      const obra = Array.isArray(v.obras) ? v.obras[0] : v.obras
      const eid = (obra as { sienge_enterprise_id?: number | null })
        ?.sienge_enterprise_id
      if (eid) enterpriseIds.add(eid)
    }

    if (enterpriseIds.size > 0) {
      // Carrega contratos uma vez
      const allContracts = await getAllSalesContracts()
      const customerContracts = allContracts.filter(
        (c) => c.customerId === siengeCustomer.id
      )

      for (const v of vinculosArr) {
        const obra = Array.isArray(v.obras) ? v.obras[0] : v.obras
        const enterpriseId = (obra as { sienge_enterprise_id?: number | null })
          ?.sienge_enterprise_id
        if (!enterpriseId) continue

        try {
          const unitIds = await getUnitIdsByEnterprise(enterpriseId)
          const relevant = customerContracts.filter((c) =>
            unitIds.has(c.unitId)
          )
          const contractNumbers = relevant.map((c) => c.contractNumber)

          if (contractNumbers.length > 0) {
            const existing =
              (v as { sienge_contract_numbers?: string[] | null })
                .sienge_contract_numbers ?? []
            const merged = Array.from(
              new Set([...existing, ...contractNumbers])
            )
            await supabase
              .from("clientes_obras_vinculos")
              .update({ sienge_contract_numbers: merged })
              .eq("id", v.id)
          }
        } catch {
          // best-effort per-vinculo
        }
      }
    }
  } catch {
    // best-effort — vínculo já foi salvo
  }

  return NextResponse.json({
    sienge_customer_id: siengeCustomer.id,
    nome_sienge: siengeCustomer.name,
    contrato,
  })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = requireRole(appUser, ALLOWED_ROLES)
  if (roleError) return roleError

  const { id } = await params

  const { data: crmCliente, error: clienteErr } = await supabase
    .from("clientes")
    .select("id, email")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .maybeSingle()

  if (clienteErr) {
    return NextResponse.json({ error: clienteErr.message }, { status: 500 })
  }
  if (!crmCliente) {
    return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 })
  }

  const { error: updateErr } = await supabase
    .from("clientes")
    .update({ sienge_customer_id: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", appUser.org_id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // Remover espelho no usuário portal (best-effort)
  if ((crmCliente as { email?: string | null }).email) {
    await supabase
      .from("users")
      .update({ sienge_customer_id: null })
      .eq("email", (crmCliente as { email: string }).email)
      .eq("role", "cliente")
  }

  return new NextResponse(null, { status: 204 })
}
