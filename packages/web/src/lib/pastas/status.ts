// Story 75-134 — status de conclusão de uma pasta, derivado dos documentos.
// Fonte única da verdade (listagem + detalhe).
//
// Regra:
//  - aguardando: falta documento chegar (entregues < total)
//  - concluida:  todos os docs (exceto o Termo) deferidos E Termo assinado
//  - em_analise: tudo entregue, mas ainda falta deferir algo ou assinar o Termo

export type PastaStatus = "aguardando" | "em_analise" | "concluida"

export const TERMO_SLUG = "termo_intencao"

export interface StatusDoc {
  slug: string
  situacao: string
  /** true quando este doc tem assinatura concluída (Clicksign signed/closed). */
  signed?: boolean
}

export interface PastaStatusResult {
  status: PastaStatus
  total: number
  entregues: number
  deferidos: number
}

export function computePastaStatus(docs: StatusDoc[]): PastaStatusResult {
  const total = docs.length
  const entregues = docs.filter((d) => d.situacao === "entregue" || d.situacao === "deferido").length
  const deferidos = docs.filter((d) => d.situacao === "deferido").length

  const naoTermo = docs.filter((d) => d.slug !== TERMO_SLUG)
  const termo = docs.find((d) => d.slug === TERMO_SLUG)
  const todosDeferidos = naoTermo.length > 0 && naoTermo.every((d) => d.situacao === "deferido")
  const termoAssinado = Boolean(termo?.signed)

  let status: PastaStatus
  if (total === 0 || entregues < total) status = "aguardando"
  else if (todosDeferidos && termoAssinado) status = "concluida"
  else status = "em_analise"

  return { status, total, entregues, deferidos }
}
