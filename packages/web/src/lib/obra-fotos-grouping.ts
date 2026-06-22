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
