import "server-only"

import { redirect } from "next/navigation"
import { getServerUser, type AppUser } from "@web/lib/auth"
import { createAdminClient } from "@web/lib/supabase/admin"

// Story 78-1 — Portal Cliente "Visão Mestre" (ver como cliente, somente leitura).
// Modelo real: há UMA `obra` por empreendimento; cada cliente/unidade é uma linha em
// `clientes_obras_vinculos` (numero_unidade próprio). Fases/Fotos/Documentos são da OBRA
// (compartilhados no prédio); Mensagens e Financeiro são POR CLIENTE. Por isso o viewer é
// chaveado pelo VÍNCULO (unidade/cliente), não pela obra.
//
// Acesso restrito a admin/supervisor. Toda leitura usa o admin client (service role,
// contorna RLS) → o gate de role + o filtro por org_id são a fronteira de segurança.
// NUNCA escrever no banco a partir do viewer (é read-only).

const VIEWER_ROLES: AppUser["role"][] = ["admin", "supervisor"]

export function canUsePortalViewer(role: AppUser["role"]): boolean {
  return VIEWER_ROLES.includes(role)
}

/** Garante que o usuário é admin/supervisor e devolve o admin client (service role). */
export async function requireViewerAccess() {
  const user = await getServerUser()
  if (!canUsePortalViewer(user.role)) {
    redirect("/dashboard")
  }
  return { user, admin: createAdminClient() }
}

export interface ViewerObra {
  id: string
  name: string
  description: string | null
  progress_pct: number
  status: string
  expected_delivery_date: string | null
  current_phase_id: string | null
  property_id: string | null
}

/** Busca a obra escopada por org. Retorna null se não existir/for de outra org. */
export async function getViewerObra(
  admin: ReturnType<typeof createAdminClient>,
  obraId: string,
  orgId: string
): Promise<ViewerObra | null> {
  const { data } = await admin
    .from("obras")
    .select(
      "id, name, description, progress_pct, status, expected_delivery_date, current_phase_id, property_id"
    )
    .eq("id", obraId)
    .eq("org_id", orgId)
    .single()
  return (data as ViewerObra | null) ?? null
}

export interface ViewerContext {
  vinculoId: string
  numeroUnidade: string | null
  clienteNome: string | null
  siengeCustomerId: number | null
  contractNumbers: string[]
  /** users.id do login do portal do cliente (para filtrar mensagens); null se não tiver acesso. */
  portalUserId: string | null
  obra: ViewerObra
}

interface ClienteEmbed {
  nome: string | null
  email: string | null
  cpf: string | null
  sienge_customer_id: number | null
}

/**
 * Resolve o contexto do viewer a partir de um vínculo (clientes_obras_vinculos.id):
 * obra (escopada por org) + cliente + usuário do portal correspondente.
 */
export async function getViewerVinculo(
  admin: ReturnType<typeof createAdminClient>,
  vinculoId: string,
  orgId: string
): Promise<ViewerContext | null> {
  const { data: v } = await admin
    .from("clientes_obras_vinculos")
    .select(
      "id, obra_id, numero_unidade, sienge_contract_numbers, clientes(nome, email, cpf, sienge_customer_id)"
    )
    .eq("id", vinculoId)
    .single()

  if (!v) return null

  const obra = await getViewerObra(admin, v.obra_id as string, orgId)
  if (!obra) return null // obra de outra org ou inexistente

  const c = (Array.isArray(v.clientes) ? v.clientes[0] : v.clientes) as
    | ClienteEmbed
    | null
    | undefined
  const siengeCustomerId = c?.sienge_customer_id ?? null
  const email = c?.email ?? null
  const cpf = c?.cpf ?? null

  // Resolve o usuário do portal (obra_mensagens.cliente_id = users.id) por
  // sienge_customer_id → email → cpf, dentro da org.
  let portalUserId: string | null = null
  const orFilters: string[] = []
  if (siengeCustomerId) orFilters.push(`sienge_customer_id.eq.${siengeCustomerId}`)
  if (email) orFilters.push(`email.eq.${email}`)
  if (cpf) orFilters.push(`cpf.eq.${cpf}`)
  if (orFilters.length > 0) {
    const { data: users } = await admin
      .from("users")
      .select("id")
      .eq("org_id", orgId)
      .or(orFilters.join(","))
      .limit(1)
    portalUserId = (users?.[0]?.id as string | undefined) ?? null
  }

  return {
    vinculoId: v.id as string,
    numeroUnidade: (v.numero_unidade as string | null) ?? null,
    clienteNome: c?.nome ?? null,
    siengeCustomerId,
    contractNumbers: (v.sienge_contract_numbers as string[] | null) ?? [],
    portalUserId,
    obra,
  }
}
