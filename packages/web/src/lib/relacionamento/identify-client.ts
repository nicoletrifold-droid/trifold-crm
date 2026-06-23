import { createAdminClient } from "@web/lib/supabase/admin"
import { normalizePhoneBR } from "@trifold/shared"

/**
 * Story 76-1 (Épico 76) — Identificação de cliente da base de obras.
 *
 * Dado um contato do WhatsApp (telefone + nome opcional), verifica se ele já é
 * CLIENTE na tabela `clientes` (base do módulo obras, superset do Sienge). Base
 * de tudo: as próximas etapas usam isso para NÃO tratar o cliente como lead e
 * encaminhá-lo à gerente de relacionamento.
 *
 * Match primário por telefone (normalizado, tolera 9º dígito) em `telefone`/`whatsapp`;
 * fallback por nome normalizado. Na dúvida (múltiplos), retorna `ambiguous` para a
 * Nicole perguntar na conversa.
 */

export interface ClienteObraRef {
  obra_id: string
  obra_name: string | null
  numero_unidade: string | null
}

export interface ClienteMatch {
  cliente_id: string
  nome: string | null
  obras: ClienteObraRef[]
}

export type IdentifyStatus = "phone_match" | "name_match" | "ambiguous" | "none"

export interface IdentifyClientResult {
  status: IdentifyStatus
  /** 1 candidato em phone_match/name_match; >1 em ambiguous; vazio em none. */
  candidates: ClienteMatch[]
}

export interface RawCliente {
  id: string
  nome: string | null
  telefone: string | null
  whatsapp: string | null
}

/** Normaliza nome para comparação: minúsculo, sem acento, espaços colapsados. */
export function normalizeName(raw: string | null | undefined): string {
  if (!raw) return ""
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
}

/**
 * PURO: clientes cujo telefone OU whatsapp normalizado é igual ao telefone de
 * entrada normalizado. Como ambos passam por `normalizePhoneBR`, o 9º dígito
 * ausente na entrada (ex.: Meta às vezes envia 12 dígitos) é tolerado.
 */
export function selectByPhone(
  normalizedInbound: string | null,
  clientes: RawCliente[]
): RawCliente[] {
  if (!normalizedInbound) return []
  return clientes.filter(
    (c) =>
      normalizePhoneBR(c.telefone) === normalizedInbound ||
      normalizePhoneBR(c.whatsapp) === normalizedInbound
  )
}

/**
 * PURO: clientes cujo nome normalizado bate com o nome de entrada. Primeiro
 * tenta igualdade exata; se nada, tenta "um contém o outro" (nome parcial).
 * Nomes com menos de 3 caracteres não disparam match (evita falso-positivo).
 */
export function selectByName(
  name: string | null | undefined,
  clientes: RawCliente[]
): RawCliente[] {
  const n = normalizeName(name)
  if (n.length < 3) return []
  const exact = clientes.filter((c) => normalizeName(c.nome) === n)
  if (exact.length) return exact
  return clientes.filter((c) => {
    const cn = normalizeName(c.nome)
    return cn.length >= 3 && (cn.includes(n) || n.includes(cn))
  })
}

/**
 * PURO: decide o status final a partir dos matches por telefone e por nome.
 * Telefone tem prioridade; nome é fallback. Múltiplos candidatos → ambiguous.
 */
export function resolveStatus(
  byPhone: RawCliente[],
  byName: RawCliente[]
): { status: IdentifyStatus; matched: RawCliente[] } {
  const dedupe = (arr: RawCliente[]) => [...new Map(arr.map((c) => [c.id, c])).values()]

  const phone = dedupe(byPhone)
  if (phone.length === 1) return { status: "phone_match", matched: phone }
  if (phone.length > 1) return { status: "ambiguous", matched: phone }

  const name = dedupe(byName)
  if (name.length === 1) return { status: "name_match", matched: name }
  if (name.length > 1) return { status: "ambiguous", matched: name }

  return { status: "none", matched: [] }
}

/**
 * Identifica o cliente. Carrega os clientes da org (base pequena — dezenas) e
 * aplica o matching puro acima; anexa as obras dos candidatos.
 */
export async function identifyClientByContact(
  orgId: string,
  phone: string | null,
  name?: string | null
): Promise<IdentifyClientResult> {
  const admin = createAdminClient()

  const { data: rows } = await admin
    .from("clientes")
    .select("id, nome, telefone, whatsapp")
    .eq("org_id", orgId)

  const clientes = (rows ?? []) as RawCliente[]
  const normPhone = normalizePhoneBR(phone)

  const byPhone = selectByPhone(normPhone, clientes)
  // só calcula match por nome se o telefone não resolveu (telefone tem prioridade)
  const byName = byPhone.length > 0 ? [] : selectByName(name, clientes)
  const { status, matched } = resolveStatus(byPhone, byName)

  if (status === "none") return { status, candidates: [] }

  const candidates = await attachObras(admin, matched)
  return { status, candidates }
}

/** Anexa as obras (via clientes_obras_vinculos) a cada cliente candidato. */
async function attachObras(
  admin: ReturnType<typeof createAdminClient>,
  clientes: RawCliente[]
): Promise<ClienteMatch[]> {
  const ids = clientes.map((c) => c.id)
  if (ids.length === 0) return []

  const { data: vinc } = await admin
    .from("clientes_obras_vinculos")
    .select("cliente_id, obra_id, numero_unidade, obras(name)")
    .in("cliente_id", ids)

  const byCliente = new Map<string, ClienteObraRef[]>()
  for (const v of (vinc ?? []) as Array<{
    cliente_id: string
    obra_id: string
    numero_unidade: string | null
    obras: { name?: string } | { name?: string }[] | null
  }>) {
    const obra = Array.isArray(v.obras) ? v.obras[0] : v.obras
    const arr = byCliente.get(v.cliente_id) ?? []
    arr.push({
      obra_id: v.obra_id,
      obra_name: obra?.name ?? null,
      numero_unidade: v.numero_unidade,
    })
    byCliente.set(v.cliente_id, arr)
  }

  return clientes.map((c) => ({
    cliente_id: c.id,
    nome: c.nome,
    obras: byCliente.get(c.id) ?? [],
  }))
}
