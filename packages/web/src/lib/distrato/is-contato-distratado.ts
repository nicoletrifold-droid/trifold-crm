import "server-only"

import { createAdminClient } from "@web/lib/supabase/admin"
import { normalizePhoneBR } from "@trifold/shared"

/**
 * Story 20.10 — Ponte leads↔Sienge + fonte única de verdade de distrato.
 *
 * A tabela `leads` (lado CRM/Nicole) está desconectada do Sienge. O status de distrato
 * vive em `clientes_obras_vinculos.distrato` (Story 20.9, migration 116). A ponte entre os
 * dois lados é o telefone/email normalizado.
 *
 * Semântica active-contract-wins (nível do CONTATO — decisão de stakeholder 2026-06-30):
 * um contato só é considerado distratado quando TODOS os seus vínculos em
 * `clientes_obras_vinculos` têm `distrato = true` E existe ao menos um vínculo. Basta UM
 * contrato ativo (`distrato = false`) para o contato continuar recebendo comunicações.
 *
 * `import "server-only"`: usa `createAdminClient()` (service_role). NUNCA pode vazar para o
 * bundle do cliente — o import acima faz o build do Next.js falhar se um Client Component
 * importar este módulo (direta ou indiretamente).
 */

export interface DistratoCheckParams {
  /** Fast path: consulta `leads.distrato` diretamente (cache populado pelo cron 20.11). */
  leadId?: string | null
  /** Telefone bruto; normalizado com `normalizePhoneBR` antes do match. */
  phone?: string | null
  /** Email do contato (match case-insensitive contra `clientes.email`). */
  email?: string | null
}

/**
 * Fonte única de verdade: indica se um contato está TOTALMENTE distratado.
 *
 * Ordem de resolução:
 *  1. `leadId` (fast path) → lê `leads.distrato` direto.
 *  2. `phone`/`email` → percorre `clientes_obras_vinculos` em tempo real, aplicando a regra
 *     active-contract-wins via 2 passos (evita cardinalidade ambígua de embeds Supabase).
 *
 * Fail-open: qualquer erro de DB → `console.error` + retorna `false`, para nunca bloquear
 * um lead legítimo por causa de um bug de infraestrutura.
 */
export async function isContatoDistratado(
  params: DistratoCheckParams
): Promise<boolean> {
  const { leadId, phone, email } = params ?? {}
  const admin = createAdminClient()

  // ── Fast path: leadId → leads.distrato (AC 6) ──────────────────────────────
  if (leadId) {
    try {
      const { data, error } = await admin
        .from("leads")
        .select("distrato")
        .eq("id", leadId)
        .maybeSingle()
      if (error) {
        console.error("[isContatoDistratado] erro lendo leads.distrato:", error)
        return false
      }
      return data?.distrato === true
    } catch (err) {
      console.error("[isContatoDistratado] exceção no fast path leadId:", err)
      return false
    }
  }

  // ── Normaliza parâmetros de contato ────────────────────────────────────────
  const normalizedPhone = normalizePhoneBR(phone)
  const normalizedEmail = email?.trim().toLowerCase() || null

  // Nenhum parâmetro válido → false sem lançar (AC 7)
  if (!normalizedPhone && !normalizedEmail) return false

  try {
    // Passo 1: cliente_ids com ao menos um vínculo distratado (conjunto MENOR/bounded).
    // 2 passos como o padrão da Story 20.9 (notificacoes.ts L166-181) — evita embed
    // `clientes!inner(...)` com cardinalidade ambígua no TypeScript.
    const { data: distVinc, error: distErr } = await admin
      .from("clientes_obras_vinculos")
      .select("cliente_id")
      .eq("distrato", true)
    if (distErr) {
      console.error("[isContatoDistratado] erro lendo vínculos distratados:", distErr)
      return false
    }
    const distClienteIds = [
      ...new Set(
        ((distVinc ?? []) as { cliente_id: string }[]).map((v) => v.cliente_id)
      ),
    ]
    if (distClienteIds.length === 0) return false

    // Passo 2: dentre os clientes distratados, quais batem com o contato (phone/email).
    // Os phones de `clientes` podem NÃO estar normalizados → normalizar em JS antes do match.
    const { data: distClientes, error: cliErr } = await admin
      .from("clientes")
      .select("id, telefone, whatsapp, email")
      .in("id", distClienteIds)
    if (cliErr) {
      console.error("[isContatoDistratado] erro lendo clientes distratados:", cliErr)
      return false
    }

    const matchedClienteIds = new Set<string>()
    for (const c of (distClientes ?? []) as {
      id: string
      telefone: string | null
      whatsapp: string | null
      email: string | null
    }[]) {
      const phoneMatch =
        !!normalizedPhone &&
        (normalizePhoneBR(c.telefone) === normalizedPhone ||
          normalizePhoneBR(c.whatsapp) === normalizedPhone)
      const emailMatch =
        !!normalizedEmail && c.email?.trim().toLowerCase() === normalizedEmail
      if (phoneMatch || emailMatch) matchedClienteIds.add(c.id)
    }

    // Contato não bate com nenhum cliente distratado → não distratado (AC 5)
    if (matchedClienteIds.size === 0) return false

    // Passo 3: active-contract-wins (AC 5a). Se QUALQUER cliente que bateu tem um vínculo
    // ativo (distrato = false), o contato NÃO é bloqueado.
    const { data: activeVinc, error: actErr } = await admin
      .from("clientes_obras_vinculos")
      .select("cliente_id")
      .eq("distrato", false)
      .in("cliente_id", [...matchedClienteIds])
    if (actErr) {
      console.error("[isContatoDistratado] erro lendo vínculos ativos:", actErr)
      return false
    }
    const hasActiveContract = (activeVinc ?? []).length > 0
    return !hasActiveContract
  } catch (err) {
    console.error("[isContatoDistratado] exceção no path phone/email:", err)
    return false
  }
}

/**
 * Story 20.10 / cron Story 20.11 — propaga o estado de distrato dos clientes do Sienge
 * para o cache `leads.distrato` de uma org.
 *
 * Aplica active-contract-wins no nível do contato: marca `leads.distrato = true` apenas
 * para leads cujo telefone/email coincide com um cliente TOTALMENTE distratado (>= 1 vínculo
 * `distrato = true` E NENHUM vínculo `distrato = false`). Leads cujo contato deixou de ser
 * distratado são revertidos para `false`.
 *
 * Idempotente: re-execução sem mudanças no Sienge → `{ updated: 0, cleared: 0 }` (só altera
 * linhas que de fato mudam de estado).
 *
 * @param orgId org alvo (a função opera sobre uma org por chamada).
 * @returns `{ updated, cleared }` — leads marcados true / revertidos para false.
 */
export async function propagateDistratosToLeads(
  orgId: string
): Promise<{ updated: number; cleared: number }> {
  const admin = createAdminClient()

  try {
    // Passo 1: clientes da org + seus vínculos, para computar quais estão TOTALMENTE
    // distratados (active-contract-wins). 2 passos por clareza e para escopar por org.
    const { data: orgClientes, error: orgCliErr } = await admin
      .from("clientes")
      .select("id, telefone, whatsapp, email")
      .eq("org_id", orgId)
    if (orgCliErr) {
      console.error("[propagateDistratosToLeads] erro lendo clientes da org:", orgCliErr)
      return { updated: 0, cleared: 0 }
    }

    const clienteById = new Map(
      ((orgClientes ?? []) as {
        id: string
        telefone: string | null
        whatsapp: string | null
        email: string | null
      }[]).map((c) => [c.id, c])
    )
    const orgClienteIds = [...clienteById.keys()]

    // Conjunto de phones/emails de clientes TOTALMENTE distratados.
    const targetPhones = new Set<string>()
    const targetEmails = new Set<string>()

    if (orgClienteIds.length > 0) {
      const { data: vinculos, error: vincErr } = await admin
        .from("clientes_obras_vinculos")
        .select("cliente_id, distrato")
        .in("cliente_id", orgClienteIds)
      if (vincErr) {
        console.error("[propagateDistratosToLeads] erro lendo vínculos:", vincErr)
        return { updated: 0, cleared: 0 }
      }

      // Agrega por cliente: hasActive (algum distrato=false) e hasDistrato (algum distrato=true).
      const hasActive = new Set<string>()
      const hasDistrato = new Set<string>()
      for (const v of (vinculos ?? []) as {
        cliente_id: string
        distrato: boolean
      }[]) {
        if (v.distrato) hasDistrato.add(v.cliente_id)
        else hasActive.add(v.cliente_id)
      }

      for (const cid of hasDistrato) {
        // Totalmente distratado = tem distrato E não tem nenhum vínculo ativo.
        if (hasActive.has(cid)) continue
        const c = clienteById.get(cid)
        if (!c) continue
        const np = normalizePhoneBR(c.telefone)
        if (np) targetPhones.add(np)
        const nw = normalizePhoneBR(c.whatsapp)
        if (nw) targetPhones.add(nw)
        const ne = c.email?.trim().toLowerCase()
        if (ne) targetEmails.add(ne)
      }
    }

    const phonesArr = [...targetPhones]
    const emailsArr = [...targetEmails]

    // Passo 2: leads que DEVEM estar distratados (batem com um contato totalmente distratado).
    const shouldBeDistratado = new Set<string>()
    if (phonesArr.length > 0) {
      const { data: byPhone, error } = await admin
        .from("leads")
        .select("id")
        .eq("org_id", orgId)
        .in("phone_normalized", phonesArr)
      if (error) {
        console.error("[propagateDistratosToLeads] erro buscando leads por phone:", error)
        return { updated: 0, cleared: 0 }
      }
      for (const l of (byPhone ?? []) as { id: string }[]) shouldBeDistratado.add(l.id)
    }
    if (emailsArr.length > 0) {
      const { data: byEmail, error } = await admin
        .from("leads")
        .select("id")
        .eq("org_id", orgId)
        .in("email", emailsArr)
      if (error) {
        console.error("[propagateDistratosToLeads] erro buscando leads por email:", error)
        return { updated: 0, cleared: 0 }
      }
      for (const l of (byEmail ?? []) as { id: string }[]) shouldBeDistratado.add(l.id)
    }

    // Passo 3: leads atualmente marcados distratado na org.
    const { data: currentDistratado, error: curErr } = await admin
      .from("leads")
      .select("id")
      .eq("org_id", orgId)
      .eq("distrato", true)
    if (curErr) {
      console.error("[propagateDistratosToLeads] erro lendo leads distratados atuais:", curErr)
      return { updated: 0, cleared: 0 }
    }
    const currentlyDistratado = new Set(
      ((currentDistratado ?? []) as { id: string }[]).map((l) => l.id)
    )

    // Diffs: só altera o que realmente muda de estado (idempotência — AC 10).
    const toSetTrue = [...shouldBeDistratado].filter((id) => !currentlyDistratado.has(id))
    const toSetFalse = [...currentlyDistratado].filter((id) => !shouldBeDistratado.has(id))

    // Passo 4: aplica as transições.
    if (toSetTrue.length > 0) {
      const { error } = await admin
        .from("leads")
        .update({ distrato: true })
        .in("id", toSetTrue)
      if (error) {
        console.error("[propagateDistratosToLeads] erro marcando distrato=true:", error)
        return { updated: 0, cleared: 0 }
      }
    }
    if (toSetFalse.length > 0) {
      const { error } = await admin
        .from("leads")
        .update({ distrato: false })
        .in("id", toSetFalse)
      if (error) {
        console.error("[propagateDistratosToLeads] erro revertendo distrato=false:", error)
        // `updated` já aplicado; reporta cleared como 0 para refletir o estado real.
        return { updated: toSetTrue.length, cleared: 0 }
      }
    }

    return { updated: toSetTrue.length, cleared: toSetFalse.length }
  } catch (err) {
    console.error("[propagateDistratosToLeads] exceção:", err)
    return { updated: 0, cleared: 0 }
  }
}
