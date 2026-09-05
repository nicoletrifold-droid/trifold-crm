/**
 * Story 75-372 — tamanho do brinde: opções do filtro e resumo de quantidades.
 *
 * Funções puras, fora dos componentes, para que a agregação do resumo do relatório
 * impresso (AC5) e a ordem das opções do select (AC3) possam ser verificadas por teste
 * sem DOM. A fonte do dado é SEMPRE o cadastro (`brindes_destinatarios.brinde_tipo_id`
 * → embed `brindes_tipos`), nunca a entrega.
 */

/**
 * Ordem conhecida de tamanhos de vestuário. Alfabético puro produziria
 * "EXGG, G, GG, M, P" no select — ilegível para quem escolhe tamanho de camiseta.
 * Valores fora desta lista (o campo é texto livre no catálogo) entram depois, em
 * ordem alfabética.
 */
export const TAMANHO_ORDER = ["P", "M", "G", "GG", "EXGG"]

export const SEM_BRINDE_LABEL = "Sem brinde definido"

/** Só o que estas funções precisam do catálogo / dos registros. */
type TipoLike = { tamanho: string | null }
type BrindeEmbed = { nome: string; tamanho: string | null } | null
type RecordLike = { brindes_tipos?: BrindeEmbed }

export interface ResumoEntry {
  label: string
  count: number
}

/**
 * Opções do select "Tamanho": valores distintos e não vazios do catálogo, na ordem
 * `TAMANHO_ORDER` primeiro e o resto em ordem alfabética.
 *
 * O valor é preservado exatamente como está cadastrado (sem trim) porque o filtro da
 * API compara por igualdade exata — normalizar aqui faria a opção deixar de casar com
 * a linha do banco.
 */
export function buildTamanhoOptions(tipos: TipoLike[]): string[] {
  const distintos = new Set<string>()
  for (const t of tipos) {
    if (t.tamanho && t.tamanho.trim()) distintos.add(t.tamanho)
  }
  const conhecidos = TAMANHO_ORDER.filter((t) => distintos.has(t))
  const resto = [...distintos]
    .filter((t) => !TAMANHO_ORDER.includes(t))
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
  return [...conhecidos, ...resto]
}

/**
 * Resumo agregado por `nome + tamanho`, com um bucket separado — sempre por último —
 * para quem não tem brinde resolvível no cadastro.
 *
 * Invariante (AC5): a soma dos `count` é exatamente `records.length`. Por isso o bucket
 * "Sem brinde definido" é decidido pela ausência do embed, e não só por
 * `brinde_tipo_id === null`: se a FK existir mas o embed vier nulo, o registro ainda
 * precisa ser contado em algum lugar.
 */
export function buildResumoBrindes(records: RecordLike[]): ResumoEntry[] {
  const contagem = new Map<string, number>()
  let semBrinde = 0

  for (const r of records) {
    const t = r.brindes_tipos
    if (!t || !t.nome) {
      semBrinde++
      continue
    }
    const label = t.tamanho ? `${t.nome} ${t.tamanho}` : t.nome
    contagem.set(label, (contagem.get(label) ?? 0) + 1)
  }

  const entries: ResumoEntry[] = [...contagem.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))

  if (semBrinde > 0) entries.push({ label: SEM_BRINDE_LABEL, count: semBrinde })

  return entries
}

/** Linha corrida do cabeçalho do relatório: `Camiseta G: 4 | ... | Sem brinde definido: 164`. */
export function formatResumoBrindes(records: RecordLike[]): string {
  return buildResumoBrindes(records)
    .map((e) => `${e.label}: ${e.count}`)
    .join(" | ")
}
