/**
 * Gates do módulo Imóveis (empreendimentos/unidades/tipologias).
 *
 * Story 75-306 (Perfis de Acesso 2.0, F3-5): as constantes IMOVEIS_EDIT_ROLES
 * (admin/supervisor/obras/gerente-relacionamento) e IMOVEIS_CREATE_ROLES
 * (admin/supervisor) viraram as capabilities `imoveis.editar` e `imoveis.criar`
 * — seeds da mig 225 espelham exatamente aquelas listas (diff conferido).
 * Visualizar segue sendo o módulo `imoveis` (canAccess), inclusive corretor.
 * Status de unidade NÃO é editável no CRM (integração externa) — exceto o
 * reset do admin, agora `imoveis.resetar_status_unidade`.
 */

import { can } from "@web/lib/permissions"

/** Pode editar empreendimentos, unidades (exceto status) e criar tipologias. */
export async function canEditImoveis(userId: string, orgId: string): Promise<boolean> {
  return can(userId, orgId, "imoveis.editar")
}

/** Pode criar empreendimentos. */
export async function canCreateImoveis(userId: string, orgId: string): Promise<boolean> {
  return can(userId, orgId, "imoveis.criar")
}
