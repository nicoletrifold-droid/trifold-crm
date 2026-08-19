import { can, canAccess } from "@web/lib/permissions"

// Story 75-344 — quem pode ver o quê dentro de Campanhas, em UM lugar.
//
// O módulo tem quatro abas com três donos diferentes: CRM e Meta Ads são do
// módulo `campanhas`, Formulários é do sub-módulo `campanhas.formularios` (para o
// Marcos poder liberar só ela, pela tela) e a Lídia é da capability
// `marketing.gerenciar`. As quatro telas montam a mesma barra de abas, então cada
// uma precisa das três respostas — e a barra já regrediu duas vezes por cada tela
// resolver isso do seu jeito (75-333, 75-340).

export interface AcessoCampanhas {
  /** Módulo `campanhas`: abas CRM e Meta Ads. */
  modulo: boolean
  /** Sub-módulo `campanhas.formularios` (herda do módulo quando não há linha). */
  formularios: boolean
  /** Capability `marketing.gerenciar`: aba Lídia. */
  agente: boolean
}

export async function resolverAcessoCampanhas(userId: string, orgId: string): Promise<AcessoCampanhas> {
  const [modulo, formularios, agente] = await Promise.all([
    canAccess(userId, orgId, "campanhas"),
    canAccess(userId, orgId, "campanhas.formularios"),
    can(userId, orgId, "marketing.gerenciar"),
  ])
  return { modulo, formularios, agente }
}

/**
 * Para onde mandar quem abriu CRM ou Meta Ads sem ter o módulo — `null` quando
 * não há nenhuma aba permitida (aí a tela responde `notFound()`).
 *
 * Redirecionar em vez de 404 seco é o que preserva as portas que já existem: o
 * perfil de marketing chega em `/dashboard/campaigns` pelo "voltar" da tela da
 * Lídia, e a partir desta story pode não ter o módulo. Função PURA: a decisão é
 * testável sem sessão, sem banco e sem tela.
 */
export function destinoSemModuloCampanhas(acesso: AcessoCampanhas): string | null {
  if (acesso.formularios) return "/dashboard/campaigns/formularios"
  if (acesso.agente) return "/dashboard/campaigns/agente"
  return null
}
