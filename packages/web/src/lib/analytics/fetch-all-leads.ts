// Story 75-269 — laço de paginação do PostgREST, em UM lugar.
//
// O PostgREST corta silenciosamente em 1000 linhas: a query não falha, ela
// devolve menos. Quem depende do conjunto completo (séries temporais do
// analytics) tem de paginar com `.range()` até vir uma página incompleta.
//
// O padrão nasceu dentro de `api/analytics/executive/route.ts` (função local
// `fetchLeads`), onde ficou preso: ela fecha sobre `supabase`, `org_id` e
// `propertyId` do handler, então não dava para importar. Extraído aqui SEM
// mudança de comportamento — o executive continua com o mesmo recorte e os
// mesmos números; o `leads-by-period` passa a ter a mesma proteção.
//
// O helper recebe um CONSTRUTOR de query em vez de filtros: cada endpoint
// monta o próprio recorte (que são legitimamente diferentes — o executive não
// filtra `is_active`/`lost_reason`, o leads-by-period sim) e o helper só cuida
// da paginação. Unificar os recortes seria mudar número em tela, e não é isto.

export const LEADS_PAGE_SIZE = 1000

/**
 * Só o que o laço precisa de uma query PostgREST: aplicar `.range()` e ser
 * aguardável. Tipar assim (em vez de `PostgrestFilterBuilder`) mantém o helper
 * testável com um fake, sem subir um Supabase.
 */
export interface RangeableQuery<T> {
  range(from: number, to: number): PromiseLike<{ data: T[] | null; error: unknown }>
}

/**
 * Busca TODAS as linhas da query, página por página.
 *
 * @param buildQuery chamado uma vez por página — deve devolver a query com
 *   todos os filtros e o `.order()` já aplicados, mas SEM `.range()`.
 *   Precisa ser função (e não a query pronta) porque um builder PostgREST não
 *   pode ser reaproveitado depois de executado.
 * @throws o erro do PostgREST, para o handler decidir o status HTTP.
 */
export async function fetchAllLeads<T>(
  buildQuery: () => RangeableQuery<T>,
  pageSize: number = LEADS_PAGE_SIZE
): Promise<T[]> {
  const out: T[] = []

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await buildQuery().range(offset, offset + pageSize - 1)
    if (error) throw error

    const rows = data ?? []
    out.push(...rows)

    // Página incompleta = acabou. Página CHEIA pede outra volta, mesmo que a
    // próxima venha vazia: o total pode ser múltiplo exato de pageSize.
    if (rows.length < pageSize) break
  }

  return out
}
