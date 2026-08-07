import { createAdminClient } from "@web/lib/supabase/admin"
import type { SupabaseClient } from "@supabase/supabase-js"
import { normalizePhoneBR } from "@trifold/shared"
import { logEvent } from "@web/lib/logger"
import { cpfLookupValues } from "@web/lib/validation/contato"
import {
  getAllSalesContracts,
  getCustomerById,
} from "./client"
import { syncClienteEmail } from "./customer-profile-sync"
import type { SiengeContract, SiengeCustomer } from "./types"

/**
 * Extrai o telefone de um cliente Sienge a partir do array `phones[]`.
 * Prioriza o marcado como `main`, depois o tipo "Celular", depois o primeiro
 * com número. Normaliza para o formato canônico BR (`55DDD9XXXXXXXX`).
 * Retorna `null` se não houver número válido.
 */
export function extractCustomerPhone(customer: SiengeCustomer): string | null {
  const phones = customer.phones ?? []
  const withNumber = phones.filter((p) => p.number && p.number.trim().length > 0)
  if (withNumber.length === 0) return null

  const chosen =
    withNumber.find((p) => p.main) ??
    withNumber.find((p) => (p.type ?? "").toLowerCase().includes("celular")) ??
    withNumber[0]

  return chosen ? normalizePhoneBR(chosen.number) : null
}

/**
 * Story 20.9 — Deny-list explícita de distrato.
 * SOMENTE esta situação Sienge bloqueia notificações. Qualquer outro valor
 * (Emitido, Autorizado, Solicitado, ou valores futuros desconhecidos como
 * "Rescindido") NÃO bloqueia — o cliente permanece ativo até revisão (AC 6).
 * Não existe a string "Distrato" na API Sienge: distrato === situation "Cancelado".
 */
const SITUACAO_DISTRATO = "Cancelado"

/**
 * Story 20.9 — Calcula a flag `distrato` a partir do mapa
 * `{contract_number: situation}` de um vínculo cliente+obra.
 *
 * Regra "active-contract-wins" (AC 3/AC 5): `distrato = true` apenas quando o
 * vínculo tem ao menos um contrato E TODOS estão em "Cancelado". Se houver ao
 * menos um contrato não-Cancelado (ex.: 1 Emitido + 1 Cancelado), retorna
 * `false`. Mapa vazio também retorna `false`.
 */
function computeDistrato(situations: Record<string, string>): boolean {
  const values = Object.values(situations)
  return values.length > 0 && values.every((s) => s === SITUACAO_DISTRATO)
}

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

  // 2. Find or create CRM client — `null` = casamento ambíguo (já logado). Pula o contrato:
  //    criar cliente aqui é o que gerava duplicata a cada sync (Story 75-282).
  const resolved = await findOrCreateCliente(
    customer,
    cpfSanitized,
    email,
    obra.org_id,
    supabaseAdmin
  )
  if (!resolved) return null
  const { clienteId, created } = resolved

  // 3. Upsert clientes_obras_vinculos — persiste a situação do contrato (merge
  //    JSONB) e recalcula a flag `distrato` do vínculo (AC 2, 3, 5, 6).
  const { id: vinculoId, distrato } = await upsertVinculo(
    clienteId,
    obra.id,
    contract.number,
    contract.situation,
    supabaseAdmin
  )

  // 4. Convidar portal user (best-effort) — suprimido quando o vínculo está em
  //    distrato (AC 4): nenhum convite é enviado e sienge_invite_sent_at fica NULL.
  let invited = false
  if (email && vinculoId && !distrato) {
    invited = await maybeInviteCliente(
      email,
      customer.name,
      customer.id,
      obra.org_id,
      obra.id,
      vinculoId,
      extractCustomerPhone(customer),
      supabaseAdmin
    )
  }

  return { created, invited }
}

interface ClienteRow {
  id: string
  cpf: string | null
  email: string | null
  telefone: string | null
  whatsapp: string | null
  sienge_customer_id: number | null
  created_at: string | null
}

const CLIENTE_COLS =
  "id, cpf, email, telefone, whatsapp, sienge_customer_id, created_at"

/**
 * Story 75-282 — resultado de uma tentativa de casamento cliente Sienge → cliente CRM.
 *
 * `ambiguous` existe para o e-mail: duas pessoas diferentes podem compartilhar e-mail (foi
 * exatamente o caso Alexandre × MAKTUB), então ali NÃO se escolhe — nem se cria. `error` nunca
 * pode ser confundido com `none`: era a confusão que fazia o sync duplicar cliente.
 */
type Lookup =
  | { kind: "found"; row: ClienteRow }
  | { kind: "none" }
  | { kind: "ambiguous"; ids: string[] }
  | { kind: "error"; message: string }

/**
 * Story 75-282 — chaves FORTES (`sienge_customer_id`, CPF): duplicata é o MESMO cliente, então
 * desempata pela linha mais ANTIGA — a canônica, a que carrega os vínculos de obra. Determinístico:
 * dois syncs seguidos escolhem a mesma linha.
 */
async function lookupStrong(
  supabaseAdmin: SupabaseClient,
  orgId: string,
  column: "sienge_customer_id" | "cpf",
  values: (string | number)[]
): Promise<Lookup> {
  if (values.length === 0) return { kind: "none" }

  const { data, error } = await supabaseAdmin
    .from("clientes")
    .select(CLIENTE_COLS)
    .eq("org_id", orgId)
    .in(column, values)
    .order("created_at", { ascending: true })
    .limit(1)

  if (error) return { kind: "error", message: error.message }
  const row = (data as ClienteRow[] | null)?.[0]
  return row ? { kind: "found", row } : { kind: "none" }
}

/**
 * Story 75-282 — chave FRACA (e-mail). Busca 2 linhas de propósito: com mais de uma, o casamento é
 * ambíguo e o sync precisa parar, não adivinhar.
 */
async function lookupByEmail(
  supabaseAdmin: SupabaseClient,
  orgId: string,
  email: string
): Promise<Lookup> {
  const { data, error } = await supabaseAdmin
    .from("clientes")
    .select(CLIENTE_COLS)
    .eq("org_id", orgId)
    .eq("email", email)
    .order("created_at", { ascending: true })
    .limit(2)

  if (error) return { kind: "error", message: error.message }
  const rows = (data as ClienteRow[] | null) ?? []
  if (rows.length > 1) return { kind: "ambiguous", ids: rows.map((r) => r.id) }
  return rows[0] ? { kind: "found", row: rows[0] } : { kind: "none" }
}

/**
 * Monta os updates de telefone/whatsapp apenas para os campos que estão vazios
 * no registro existente — nunca sobrescreve preenchimento manual.
 */
function phoneBackfillUpdates(
  existing: ClienteRow,
  phone: string | null
): { telefone?: string; whatsapp?: string } {
  const updates: { telefone?: string; whatsapp?: string } = {}
  if (!phone) return updates
  if (!existing.telefone || existing.telefone.trim().length === 0) {
    updates.telefone = phone
  }
  if (!existing.whatsapp || existing.whatsapp.trim().length === 0) {
    updates.whatsapp = phone
  }
  return updates
}

/**
 * Casa o cliente do Sienge com o cliente do CRM e, só se ele realmente não existir, cria.
 *
 * Story 75-282 — a ordem é do mais forte para o mais fraco:
 *   1. `sienge_customer_id` — vínculo já estabelecido, a evidência mais direta
 *   2. **CPF por dígitos** — casa `207.363.470-20` (CRM legado) com `20736347020` (Sienge)
 *   3. e-mail — último recurso, e apenas quando aponta para UMA linha
 *
 * Devolve `null` quando não é possível decidir com segurança (e-mail ambíguo): o contrato é pulado
 * e o fato é logado. Antes, qualquer falha de consulta caía no `INSERT` e o cliente duplicava a
 * cada sync — o MAKTUB acumulou 5 linhas assim.
 */
async function findOrCreateCliente(
  customer: SiengeCustomer,
  cpfSanitized: string | null,
  email: string | null,
  orgId: string,
  supabaseAdmin: SupabaseClient
): Promise<{ clienteId: string; created: boolean } | null> {
  const phone = extractCustomerPhone(customer)

  // 1. Vínculo Sienge já existente. 2. CPF nos dois formatos que a base tem hoje — a coluna é
  // normalizada pela migration 216, mas o sync não depende disso para casar.
  const cpfCandidates = cpfLookupValues(cpfSanitized)

  const attempts: Lookup[] = [
    await lookupStrong(supabaseAdmin, orgId, "sienge_customer_id", [customer.id]),
    ...(cpfCandidates.length > 0
      ? [await lookupStrong(supabaseAdmin, orgId, "cpf", cpfCandidates)]
      : []),
    // 3. E-mail: só entra em jogo se as chaves fortes não resolveram.
    ...(email ? [await lookupByEmail(supabaseAdmin, orgId, email)] : []),
  ]

  let existing: ClienteRow | null = null
  for (const attempt of attempts) {
    // Erro de consulta NUNCA vira "não existe" — aborta o contrato sem escrever nada.
    if (attempt.kind === "error") {
      throw new Error(`Falha ao buscar cliente CRM: ${attempt.message}`)
    }
    if (attempt.kind === "ambiguous") {
      logEvent({
        level: "warn",
        category: "system",
        event_type: "SIENGE_SYNC_AMBIGUOUS_EMAIL",
        message: `E-mail ${email} aponta para ${attempt.ids.length} clientes — sync pulou o cliente Sienge ${customer.id} em vez de criar duplicata`,
        metadata: {
          email,
          sienge_customer_id: customer.id,
          sienge_customer_name: customer.name,
          cliente_ids: attempt.ids,
        },
        source: "sienge-sync",
        org_id: orgId,
      })
      return null
    }
    if (attempt.kind === "found") {
      existing = attempt.row
      break
    }
  }

  if (existing) {
    const updates: Record<string, unknown> = {
      ...phoneBackfillUpdates(existing, phone),
    }
    if (!existing.sienge_customer_id) {
      updates.sienge_customer_id = customer.id
    }
    if (!existing.cpf && cpfSanitized) {
      updates.cpf = cpfSanitized
    }
    if (Object.keys(updates).length > 0) {
      await supabaseAdmin.from("clientes").update(updates).eq("id", existing.id)
    }
    // Story 79-1: e-mail segue o Sienge (fonte da verdade) + propaga ao login do portal.
    await syncClienteEmail(
      supabaseAdmin,
      { id: existing.id, email: existing.email, sienge_customer_id: existing.sienge_customer_id ?? customer.id, org_id: orgId },
      customer.email
    )
    return { clienteId: existing.id, created: false }
  }

  // Cria novo — alcançado somente quando TODAS as buscas responderam e vieram vazias.
  const { data: novo, error: insertErr } = await supabaseAdmin
    .from("clientes")
    .insert({
      org_id: orgId,
      nome: customer.name,
      cpf: cpfSanitized,
      email,
      telefone: phone,
      whatsapp: phone,
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
  sienge_contract_situations: Record<string, string> | null
}

interface UpsertVinculoResult {
  id: string | null
  /** Flag `distrato` recalculada após o merge da situação deste contrato. */
  distrato: boolean
}

/**
 * Cria/atualiza o vínculo cliente+obra e mantém o mapa
 * `sienge_contract_situations` por contrato via merge JSONB (não substitui —
 * preserva situações de outros contratos do mesmo cliente+obra). Recalcula e
 * persiste `distrato` a cada chamada (idempotente: mesmos inputs → mesmo estado).
 */
async function upsertVinculo(
  clienteId: string,
  obraId: string,
  contractNumber: string,
  situation: string,
  supabaseAdmin: SupabaseClient
): Promise<UpsertVinculoResult> {
  const { data: existing } = await supabaseAdmin
    .from("clientes_obras_vinculos")
    .select("id, sienge_contract_numbers, sienge_contract_situations")
    .eq("cliente_id", clienteId)
    .eq("obra_id", obraId)
    .maybeSingle()

  const row = existing as VinculoRow | null

  if (row) {
    const currentNumbers = row.sienge_contract_numbers ?? []
    const mergedNumbers = currentNumbers.includes(contractNumber)
      ? currentNumbers
      : [...currentNumbers, contractNumber]

    // Merge JSONB: preserva as situações já registradas para os demais contratos
    // do vínculo e sobrescreve apenas a deste contrato (AC 2). Sobrescrever a
    // entrada existente é intencional — permite transição Emitido → Cancelado.
    const mergedSituations: Record<string, string> = {
      ...(row.sienge_contract_situations ?? {}),
      [contractNumber]: situation,
    }
    const distrato = computeDistrato(mergedSituations)

    await supabaseAdmin
      .from("clientes_obras_vinculos")
      .update({
        sienge_contract_numbers: mergedNumbers,
        sienge_contract_situations: mergedSituations,
        distrato,
      })
      .eq("id", row.id)

    return { id: row.id, distrato }
  }

  const situations: Record<string, string> = { [contractNumber]: situation }
  const distrato = computeDistrato(situations)

  const { data: novo, error: insertErr } = await supabaseAdmin
    .from("clientes_obras_vinculos")
    .insert({
      cliente_id: clienteId,
      obra_id: obraId,
      sienge_contract_numbers: [contractNumber],
      sienge_contract_situations: situations,
      distrato,
    })
    .select("id")
    .single()

  if (insertErr) {
    throw new Error(`Falha ao criar vínculo: ${insertErr.message}`)
  }

  return { id: (novo as { id: string } | null)?.id ?? null, distrato }
}

async function maybeInviteCliente(
  email: string,
  name: string,
  siengeCustomerId: number,
  orgId: string,
  obraId: string,
  vinculoId: string,
  phone: string | null,
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
    .select("id, auth_id, phone, sienge_customer_id")
    .eq("email", email)
    .eq("role", "cliente")
    .maybeSingle()

  let userId: string | null = null

  if (existingUser) {
    userId = (existingUser as { id: string }).id
    // Preenche o telefone do portal user quando vazio (fonte do disparo de
    // WhatsApp em notifyClientes) — nunca sobrescreve preenchimento existente.
    const currentPhone = (existingUser as { phone?: string | null }).phone
    if (phone && (!currentPhone || currentPhone.trim().length === 0)) {
      await supabaseAdmin.from("users").update({ phone }).eq("id", userId)
    }
    // Mirror sienge_customer_id se ainda não tiver
    if (!(existingUser as { sienge_customer_id?: number | null }).sienge_customer_id) {
      await supabaseAdmin
        .from("users")
        .update({ sienge_customer_id: siengeCustomerId })
        .eq("id", userId)

      // Confirmar e-mail do portal user automaticamente (best-effort)
      try {
        const authId = (existingUser as { auth_id?: string | null }).auth_id
        if (authId) {
          await supabaseAdmin.auth.admin.updateUserById(authId, { email_confirm: true })
        }
      } catch {
        // best-effort — não bloqueia o sync
      }
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
            phone,
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

export interface ReconcileResult {
  /** Total de vínculos da obra que tiveram situação/distrato recalculados. */
  reconciled: number
  /** Quantos desses vínculos ficaram com `distrato = true`. */
  distratados: number
  /** Erros por vínculo (não-bloqueantes; o restante continua sendo processado). */
  errors: string[]
}

/**
 * Story 20.9 (AC 8) — Remediação/backfill: reconstrói
 * `sienge_contract_situations` e recalcula `distrato` para TODOS os vínculos
 * existentes de uma obra, a partir dos dados ATUAIS do Sienge.
 *
 * Necessário porque a coluna `sienge_contract_situations` foi criada vazia
 * (`'{}'`) pela migration 116 — sem dados históricos. Idempotente: pode ser
 * re-executado com segurança.
 *
 * Reutiliza `getAllSalesContracts()` (já rate-limited com sleep entre páginas).
 * Mapeia cada `clientes_obras_vinculos.sienge_contract_numbers` → situação atual.
 */
export async function reconcileDistratosForObra(
  obraId: string
): Promise<ReconcileResult> {
  const supabaseAdmin = createAdminClient()

  const { data: obra, error: obraErr } = await supabaseAdmin
    .from("obras")
    .select("id, sienge_enterprise_id")
    .eq("id", obraId)
    .maybeSingle()

  if (obraErr || !obra) {
    throw new Error(obraErr?.message ?? "Obra não encontrada")
  }

  const enterpriseId = (obra as { sienge_enterprise_id?: number | null })
    .sienge_enterprise_id
  if (!enterpriseId) {
    throw new Error("Obra não tem sienge_enterprise_id configurado")
  }

  // Situação atual por número de contrato (rate-limited internamente).
  const contracts = await getAllSalesContracts(enterpriseId)
  const situationByNumber = new Map<string, string>()
  for (const c of contracts) {
    situationByNumber.set(c.number, c.situation)
  }

  const { data: vinculos, error: vinculosErr } = await supabaseAdmin
    .from("clientes_obras_vinculos")
    .select("id, sienge_contract_numbers")
    .eq("obra_id", obraId)

  if (vinculosErr) {
    throw new Error(`Falha ao carregar vínculos: ${vinculosErr.message}`)
  }

  const rows = (vinculos ?? []) as {
    id: string
    sienge_contract_numbers: string[] | null
  }[]

  const result: ReconcileResult = { reconciled: 0, distratados: 0, errors: [] }

  for (const v of rows) {
    try {
      const numbers = v.sienge_contract_numbers ?? []
      const situations: Record<string, string> = {}
      for (const num of numbers) {
        const sit = situationByNumber.get(num)
        // Contrato presente no vínculo mas ausente no Sienge atual é ignorado
        // (não há situação confiável). Não inferimos distrato a partir de
        // ausência — mantém a regra conservadora da deny-list.
        if (sit) situations[num] = sit
      }
      const distrato = computeDistrato(situations)

      const { error: updErr } = await supabaseAdmin
        .from("clientes_obras_vinculos")
        .update({ sienge_contract_situations: situations, distrato })
        .eq("id", v.id)

      if (updErr) {
        result.errors.push(`vínculo ${v.id}: ${updErr.message}`)
        continue
      }

      result.reconciled += 1
      if (distrato) result.distratados += 1
    } catch (err) {
      result.errors.push(
        `vínculo ${v.id}: ${err instanceof Error ? err.message : "erro"}`
      )
    }
  }

  return result
}
