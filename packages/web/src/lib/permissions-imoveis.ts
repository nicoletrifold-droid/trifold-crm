/**
 * Fonte única de permissões do módulo Imóveis (empreendimentos/unidades).
 *
 * Regra de negócio (Story 72-1):
 *  - Editar empreendimento, unidades (menos status) e tipologias: admin, supervisor, obras.
 *  - Criar/excluir empreendimento: admin, supervisor.
 *  - Visualizar: qualquer perfil com acesso ao módulo `imoveis` (inclui corretor).
 *  - Status da unidade NÃO é editável no CRM (vem de integração externa).
 *
 * Módulo puro (sem código server-side) — pode ser importado em Server e Client Components.
 */

export const IMOVEIS_EDIT_ROLES = ["admin", "supervisor", "obras"] as const
export const IMOVEIS_CREATE_ROLES = ["admin", "supervisor"] as const

/** Pode editar empreendimentos, unidades (exceto status) e tipologias. */
export function canEditImoveis(role: string | null | undefined): boolean {
  return role != null && (IMOVEIS_EDIT_ROLES as readonly string[]).includes(role)
}

/** Pode criar/excluir empreendimentos. */
export function canCreateImoveis(role: string | null | undefined): boolean {
  return role != null && (IMOVEIS_CREATE_ROLES as readonly string[]).includes(role)
}
