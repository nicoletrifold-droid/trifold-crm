/**
 * Agrupa fotos de obra por fase e ordena os grupos pela sequência das fases
 * (`obra_fases.order_index`). O grupo de fotos sem fase (`fase_id` null) — ou
 * com fase órfã/sem order_index — aparece sempre por último.
 *
 * A ordem das fotos DENTRO de cada grupo preserva a ordem recebida (a query
 * de fotos já vem ordenada por `created_at desc`). Usado por:
 * - Portal: `cliente/[obra_id]/fotos/page.tsx`
 * - Admin:  `dashboard/obras/[obra_id]/_components/obra-detail-tabs.tsx`
 *
 * Story 75-3.
 */

export interface FaseRef {
  id: string
  name: string
  order_index: number
}

export interface FotoGroup<F> {
  faseId: string | null
  faseName: string
  fotos: F[]
}

const SEM_FASE_LABEL = "Sem fase"

export function groupFotosByFaseOrder<F extends { fase_id: string | null }>(
  fotos: F[],
  fases: FaseRef[]
): FotoGroup<F>[] {
  const nameMap = new Map(fases.map((f) => [f.id, f.name]))
  const orderMap = new Map(fases.map((f) => [f.id, f.order_index]))

  const groupMap = new Map<string | null, FotoGroup<F>>()
  for (const foto of fotos) {
    const key = foto.fase_id ?? null
    let group = groupMap.get(key)
    if (!group) {
      group = {
        faseId: key,
        faseName: key ? (nameMap.get(key) ?? SEM_FASE_LABEL) : SEM_FASE_LABEL,
        fotos: [],
      }
      groupMap.set(key, group)
    }
    group.fotos.push(foto)
  }

  // Ordena por order_index da fase; "Sem fase" / fase órfã sempre por último.
  const rank = (g: FotoGroup<F>): number => {
    if (g.faseId === null) return Number.POSITIVE_INFINITY
    return orderMap.get(g.faseId) ?? Number.POSITIVE_INFINITY
  }

  return [...groupMap.values()].sort((a, b) => rank(a) - rank(b))
}

/**
 * Story 75-253 — fases que merecem PÍLULA de filtro na tela de fotos do portal.
 *
 * O problema que resolve (medido em produção em 31/07): a faixa desenhava uma
 * pílula por fase CADASTRADA — 38 no Vind, das quais só 9 têm foto. Com nomes
 * longos isso dava ~6.000px de pílulas num container de ~864px, e as primeiras da
 * ordem eram justamente as vazias: o cliente via a faixa cheia de fases sem nada e
 * concluía que o portal não tinha fotos, tendo 74.
 *
 * Ideia do Marcos: só liberar a pílula quando existe foto vinculada.
 *
 * A contagem vai no rótulo porque as fases vêm do cronograma por bloco/torre e os
 * nomes REPETEM (no Vind, "REVESTIMENTOS E PAVIMENTOS" aparece 2× entre as 9 com
 * foto) — sem o número, duas pílulas idênticas são indistinguíveis.
 *
 * PURA (AC6): sem I/O, sem DOM. A ordem segue `order_index`.
 */
export interface FaseComFotos extends FaseRef {
  /** Quantas fotos daquela fase — vai no rótulo da pílula (AC2). */
  totalFotos: number
}

export function fasesComFotos<F extends { fase_id: string | null }>(
  fotos: F[],
  fases: FaseRef[]
): FaseComFotos[] {
  const contagem = new Map<string, number>()
  for (const foto of fotos) {
    if (!foto.fase_id) continue // "Sem fase" não vira pílula: já é um grupo próprio
    contagem.set(foto.fase_id, (contagem.get(foto.fase_id) ?? 0) + 1)
  }

  return fases
    .filter((f) => (contagem.get(f.id) ?? 0) > 0)
    .map((f) => ({ ...f, totalFotos: contagem.get(f.id)! }))
    .sort((a, b) => a.order_index - b.order_index)
}
