import { createAdminClient } from "@web/lib/supabase/admin"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  getAllSalesContracts,
  getCustomerById,
} from "./client"
import type { SiengeContract, SiengeCustomer } from "./types"

export interface SyncResult {
  success: boolean
  synced: number
  created: number
  invited: number
  error?: string
}

interface ObraContext {
  id: string
  org_id: string
  sienge_enterprise_id: number
}

/**
 * Sincroniza clientes Sienge de um empreendimento → CRM + Portal.
 *
 * Fluxo:
 * 1. Lê obra (sienge_enterprise_id, org_id)
 * 2. Pega unit IDs do empreendimento + filtra contratos relevantes
 * 3. Para cada contrato: cria/atualiza cliente CRM, vínculo obra,
 *    e (se possível) envia convite portal via magic link
 * 4. Atualiza status de sync na obra
 */
export async function syncObraClientes(obraId: string): Promise<SyncResult> {
  const supabaseAdmin = createAdminClient()

  // 1. Carrega obra
  const { data: obra, error: obraErr } = await supabaseAdmin
    .from("obras")
    .select("id, org_id, sienge_enterprise_id")
    .eq("id", obraId)
    .maybeSingle()

  if (obraErr || !obra) {
    return {
      success: false,
      synced: 0,
      created: 0,
      invited: 0,
      error: obraErr?.message ?? "Obra não encontrada",
    }
  }

  const enterpriseId = (obra as { sienge_enterprise_id?: number | null })
    .sienge_enterprise_id

  if (!enterpriseId) {
    return {
      success: false,
      synced: 0,
      created: 0,
      invited: 0,
      error: "Obra não tem sienge_enterprise_id configurado",
    }
  }

  const ctx: ObraContext = {
    id: obra.id as string,
    org_id: obra.org_id as string,
    sienge_enterprise_id: enterpriseId,
  }

  // Marca como syncing
  await supabaseAdmin
    .from("obras")
    .update({ sienge_sync_status: "syncing" })
    .eq("id", obraId)

  try {
    // 2. Busca contratos do empreendimento (filtro na API)
    const relevant = await getAllSalesContracts(enterpriseId)

    let synced = 0
    let created = 0
    let invited = 0

    for (const contract of relevant) {
      try {
        const result = await syncContract(contract, ctx, supabaseAdmin)
        if (result) {
          synced += 1
          if (result.created) created += 1
          if (result.invited) invited += 1
        }
      } catch (err) {
        // Não bloqueia o restante — apenas loga
        console.error(
          `[sienge-sync] erro no contrato ${contract.id}:`,
          err instanceof Error ? err.message : err
        )
      }
    }

    // Marca como done
    await supabaseAdmin
      .from("obras")
      .update({
        sienge_sync_status: "done",
        sienge_last_synced_at: new Date().toISOString(),
      })
      .eq("id", obraId)

    return { success: true, synced, created, invited }
  } catch (err) {
    await supabaseAdmin
      .from("obras")
      .update({ sienge_sync_status: "error" })
      .eq("id", obraId)

    return {
      success: false,
      synced: 0,
      created: 0,
      invited: 0,
      error: err instanceof Error ? err.message : "Erro desconhecido no sync",
    }
  }
}

interface SyncContractResult {
  created: boolean
  invited: boolean
}

async function syncContract(
  contract: SiengeContract,
  obra: ObraContext,
  supabaseAdmin: SupabaseClient
): Promise<SyncContractResult | null> {
  // Extrai cliente principal do contrato
  const mainCustomer =
    contract.salesContractCustomers.find((c) => c.main) ??
    contract.salesContractCustomers[0]
  if (!mainCustomer) return null

  // 1. Detalhe do cliente
  const customer = await getCustomerById(mainCustomer.id)
  if (!customer) return null

  const cpfSanitized = customer.cpf?.replace(/\D/g, "") || null
  const email = customer.email?.trim().toLowerCase() || null

  // 2. Find or create CRM client
  const { clienteId, created } = await findOrCreateCliente(
    customer,
    cpfSanitized,
    email,
    obra.org_id,
    supabaseAdmin
  )

  // 3. Upsert clientes_obras_vinculos
  const vinculoId = await upsertVinculo(
    clienteId,
    obra.id,
    contract.number,
    supabaseAdmin
  )

  // 4. Convidar portal user (best-effort)
  let invited = false
  if (email && vinculoId) {
    invited = await maybeInviteCliente(
      email,
      customer.name,
      customer.id,
      obra.org_id,
      obra.id,
      vinculoId,
      supabaseAdmin
    )
  }

  return { created, invited }
}

interface ClienteRow {
  id: string
  cpf: string | null
  email: string | null
  sienge_customer_id: number | null
}

async function findOrCreateCliente(
  customer: SiengeCustomer,
  cpfSanitized: string | null,
  email: string | null,
  orgId: string,
  supabaseAdmin: SupabaseClient
): Promise<{ clienteId: string; created: boolean }> {
  // Busca por CPF primeiro
  if (cpfSanitized) {
    const { data: byCpf } = await supabaseAdmin
      .from("clientes")
      .select("id, cpf, email, sienge_customer_id")
      .eq("org_id", orgId)
      .eq("cpf", cpfSanitized)
      .maybeSingle()

    const existing = byCpf as ClienteRow | null
    if (existing) {
      if (!existing.sienge_customer_id) {
        await supabaseAdmin
          .from("clientes")
          .update({ sienge_customer_id: customer.id })
          .eq("id", existing.id)
      }
      return { clienteId: existing.id, created: false }
    }
  }

  // Fallback: busca por email
  if (email) {
    const { data: byEmail } = await supabaseAdmin
      .from("clientes")
      .select("id, cpf, email, sienge_customer_id")
      .eq("org_id", orgId)
      .eq("email", email)
      .maybeSingle()

    const existing = byEmail as ClienteRow | null
    if (existing) {
      const updates: Record<string, unknown> = {}
      if (!existing.sienge_customer_id) {
        updates.sienge_customer_id = customer.id
      }
      if (!existing.cpf && cpfSanitized) {
        updates.cpf = cpfSanitized
      }
      if (Object.keys(updates).length > 0) {
        await supabaseAdmin.from("clientes").update(updates).eq("id", existing.id)
      }
      return { clienteId: existing.id, created: false }
    }
  }

  // Cria novo
  const { data: novo, error: insertErr } = await supabaseAdmin
    .from("clientes")
    .insert({
      org_id: orgId,
      nome: customer.name,
      cpf: cpfSanitized,
      email,
      phone: customer.phone,
      sienge_customer_id: customer.id,
    })
    .select("id")
    .single()

  if (insertErr || !novo) {
    throw new Error(
      `Falha ao criar cliente CRM: ${insertErr?.message ?? "unknown"}`
    )
  }

  return { clienteId: (novo as { id: string }).id, created: true }
}

interface VinculoRow {
  id: string
  sienge_contract_numbers: string[] | null
}

async function upsertVinculo(
  clienteId: string,
  obraId: string,
  contractNumber: string,
  supabaseAdmin: SupabaseClient
): Promise<string | null> {
  const { data: existing } = await supabaseAdmin
    .from("clientes_obras_vinculos")
    .select("id, sienge_contract_numbers")
    .eq("cliente_id", clienteId)
    .eq("obra_id", obraId)
    .maybeSingle()

  const row = existing as VinculoRow | null

  if (row) {
    const current = row.sienge_contract_numbers ?? []
    if (!current.includes(contractNumber)) {
      const merged = [...current, contractNumber]
      await supabaseAdmin
        .from("clientes_obras_vinculos")
        .update({ sienge_contract_numbers: merged })
        .eq("id", row.id)
    }
    return row.id
  }

  const { data: novo, error: insertErr } = await supabaseAdmin
    .from("clientes_obras_vinculos")
    .insert({
      cliente_id: clienteId,
      obra_id: obraId,
      sienge_contract_numbers: [contractNumber],
    })
    .select("id")
    .single()

  if (insertErr) {
    throw new Error(`Falha ao criar vínculo: ${insertErr.message}`)
  }

  return (novo as { id: string } | null)?.id ?? null
}

async function maybeInviteCliente(
  email: string,
  name: string,
  siengeCustomerId: number,
  orgId: string,
  obraId: string,
  vinculoId: string,
  supabaseAdmin: SupabaseClient
): Promise<boolean> {
  // Checa se vínculo já tem convite enviado
  const { data: vinculo } = await supabaseAdmin
    .from("clientes_obras_vinculos")
    .select("sienge_invite_sent_at")
    .eq("id", vinculoId)
    .maybeSingle()

  if ((vinculo as { sienge_invite_sent_at?: string | null } | null)?.sienge_invite_sent_at) {
    return false
  }

  // Checa se já existe portal user com esse email
  const { data: existingUser } = await supabaseAdmin
    .from("users")
    .select("id, auth_id, sienge_customer_id")
    .eq("email", email)
    .eq("role", "cliente")
    .maybeSingle()

  let userId: string | null = null

  if (existingUser) {
    userId = (existingUser as { id: string }).id
    // Mirror sienge_customer_id se ainda não tiver
    if (!(existingUser as { sienge_customer_id?: number | null }).sienge_customer_id) {
      await supabaseAdmin
        .from("users")
        .update({ sienge_customer_id: siengeCustomerId })
        .eq("id", userId)
    }
  } else {
    // Cria auth user via generateLink (não envia email pelo Supabase,
    // evitando rate limit de email em syncs em massa).
    // O cliente pode acessar via magic link ou receive convite por Resend.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""
    const redirectTo = appUrl ? `${appUrl}/cliente` : undefined

    try {
      const { data: linkData, error: linkErr } =
        await supabaseAdmin.auth.admin.generateLink({
          type: "invite",
          email,
          options: { redirectTo, data: { full_name: name } },
        })

      if (linkErr || !linkData?.user) {
        const msg = linkErr?.message ?? ""
        const isAlreadyExists =
          msg.includes("already been registered") ||
          msg.includes("already_exists")

        if (isAlreadyExists) {
          // Usuário existe em auth com outro role — vincula sem re-convidar
          const { data: anyUser } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("email", email)
            .maybeSingle()
          userId = (anyUser as { id: string } | null)?.id ?? null
          if (!userId) {
            console.error(
              `[sienge-sync] ${email} existe em auth mas não em users — pulando`
            )
            return false
          }
          // userId já resolvido — pula criação de users record
        } else {
          console.error(
            `[sienge-sync] falha ao criar link para ${email}:`,
            linkErr?.message
          )
          return false
        }
      } else {
        // generateLink bem-sucedido — cria registro em users
        const authUserId = linkData.user.id

        const { data: newUser, error: userErr } = await supabaseAdmin
          .from("users")
          .insert({
            auth_id: authUserId,
            org_id: orgId,
            name,
            email,
            role: "cliente",
            sienge_customer_id: siengeCustomerId,
          })
          .select("id")
          .single()

        if (userErr || !newUser) {
          // Conflito de auth_id: usuário auth já existia na tabela users
          if ((userErr as { code?: string })?.code === "23505") {
            const { data: byAuth } = await supabaseAdmin
              .from("users")
              .select("id")
              .eq("auth_id", authUserId)
              .maybeSingle()
            userId = (byAuth as { id: string } | null)?.id ?? null
          } else {
            console.error(
              `[sienge-sync] falha ao inserir users para ${email}:`,
              userErr?.message
            )
            return false
          }
        } else {
          userId = (newUser as { id: string }).id
        }
      }
    } catch (err) {
      console.error(
        `[sienge-sync] exception para ${email}:`,
        err instanceof Error ? err.message : err
      )
      return false
    }
  }

  // Se userId ainda for null aqui, não há como criar a ligação portal
  if (!userId) {
    console.error(`[sienge-sync] userId não resolvido para ${email} — abortando`)
    return false
  }

  // Garante vínculo cliente_obras (portal)
  if (userId) {
    const { data: portalLink } = await supabaseAdmin
      .from("cliente_obras")
      .select("user_id")
      .eq("user_id", userId)
      .eq("obra_id", obraId)
      .maybeSingle()

    if (!portalLink) {
      await supabaseAdmin.from("cliente_obras").insert({
        user_id: userId,
        obra_id: obraId,
        is_primary: false,
      })
    }
  }

  // Marca invite_sent_at
  await supabaseAdmin
    .from("clientes_obras_vinculos")
    .update({ sienge_invite_sent_at: new Date().toISOString() })
    .eq("id", vinculoId)

  return true
}
