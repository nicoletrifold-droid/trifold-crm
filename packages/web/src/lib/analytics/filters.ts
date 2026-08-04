// Story 75-272 — os filtros do Analytics em UM lugar: ler da URL, aplicar numa
// query e montar link preservando o resto.
//
// O PROBLEMA QUE ISTO RESOLVE. Os links de filtro eram strings montadas à mão
// (`page.tsx:414`: `?property_id=${id}${range !== "30d" ? `&range=${range}` : ""}`),
// então cada link só carregava o que o autor lembrou de carregar. Com um filtro
// só isso passa; com dois, escolher empreendimento APAGAVA o corretor. Somar
// filtros exige que a montagem da URL seja mecânica, não artesanal.
//
// Também é o que faz a tela e o PDF concordarem: os dois passam a ler os filtros
// pelo mesmo `parseAnalyticsFilters` e aplicá-los pelo mesmo `applyLeadFilters`,
// em vez de cada um implementar seu recorte (hoje o PDF simplesmente IGNORA o
// filtro de empreendimento — furo pré-existente da convenção "relatório segue a
// tela", fechado nesta story).

/** Filtros que o Analytics entende. `null` = dimensão sem filtro. */
export interface AnalyticsFilters {
  propertyId: string | null
  brokerId: string | null
  /** `interest_level` — Calor do lead (cold/warm/hot). */
  interestLevel: string | null
  finalidade: string | null
  profissao: string | null
  rendaFamiliar: string | null
  filhos: string | null
  estadoCivil: string | null
  faixaEtaria: string | null
  situacaoMoradia: string | null
  temPet: string | null
  cidadeBairro: string | null
}

/**
 * Mapa dimensão → (parâmetro na URL, coluna em `leads`). Fonte ÚNICA: parse,
 * apply e buildHref derivam daqui, então adicionar filtro novo é uma linha e
 * não pode ficar meio-implementado (o tipo acusa).
 *
 * `property_id` mantém o nome histórico do parâmetro — há links externos e
 * relatórios que já apontam com ele.
 */
export const FILTER_SPEC = {
  propertyId: { param: "property_id", column: "property_interest_id" },
  brokerId: { param: "broker_id", column: "assigned_broker_id" },
  interestLevel: { param: "calor", column: "interest_level" },
  finalidade: { param: "finalidade", column: "finalidade" },
  // `ci` = comparação case-insensitive. Profissão e cidade/bairro são TEXTO
  // LIVRE, e o `aggregatePerfil` (perfil.ts:68-71) agrupa profissão
  // case-insensitive exibindo a grafia mais comum. Se o filtro usasse `.eq()`,
  // a opção "Engenheiro (3)" devolveria 1 — as outras duas são "engenheiro" e
  // "ENGENHEIRO". O filtro TEM de usar o mesmo critério do rótulo (AC11).
  profissao: { param: "profissao", column: "profissao", ci: true },
  rendaFamiliar: { param: "renda", column: "renda_familiar" },
  filhos: { param: "filhos", column: "filhos" },
  estadoCivil: { param: "estado_civil", column: "estado_civil" },
  faixaEtaria: { param: "faixa_etaria", column: "faixa_etaria" },
  situacaoMoradia: { param: "moradia", column: "situacao_moradia" },
  temPet: { param: "pet", column: "tem_pet" },
  cidadeBairro: { param: "cidade_bairro", column: "cidade_bairro", ci: true },
} as const satisfies Record<
  keyof AnalyticsFilters,
  { param: string; column: string; ci?: boolean }
>

/** Dimensões de texto livre, comparadas sem diferenciar caixa (AC11). */
export function isCaseInsensitive(key: FilterKey): boolean {
  return (FILTER_SPEC[key] as { ci?: boolean }).ci === true
}

export type FilterKey = keyof AnalyticsFilters

export const FILTER_KEYS = Object.keys(FILTER_SPEC) as FilterKey[]

/** Dimensões de PERFIL do lead (as raras) — separadas p/ a UI agrupar. */
export const PERFIL_FILTER_KEYS: FilterKey[] = [
  "finalidade",
  "profissao",
  "rendaFamiliar",
  "filhos",
  "estadoCivil",
  "faixaEtaria",
  "situacaoMoradia",
  "temPet",
  "cidadeBairro",
]

export const EMPTY_FILTERS: AnalyticsFilters = Object.freeze(
  FILTER_KEYS.reduce((acc, k) => ({ ...acc, [k]: null }), {} as AnalyticsFilters)
)

/** O que `parseAnalyticsFilters` aceita: URLSearchParams ou o objeto do Next. */
export type FilterSource =
  | URLSearchParams
  | Record<string, string | string[] | undefined>

function readParam(source: FilterSource, param: string): string | null {
  const raw =
    source instanceof URLSearchParams ? source.get(param) : source[param]
  const value = Array.isArray(raw) ? raw[0] : raw
  // String vazia é ausência de filtro, não filtro por "" — é o que chega quando
  // o usuário escolhe "Todos" num <select> ou quando a URL tem `&broker_id=`.
  const trimmed = typeof value === "string" ? value.trim() : ""
  return trimmed === "" ? null : trimmed
}

/** Lê os filtros da URL (ou do `searchParams` do Next) para objeto tipado. */
export function parseAnalyticsFilters(source: FilterSource): AnalyticsFilters {
  const out = {} as AnalyticsFilters
  for (const key of FILTER_KEYS) {
    out[key] = readParam(source, FILTER_SPEC[key].param)
  }
  return out
}

/** Alguma dimensão filtrada? Decide RPC agregada × queries diretas. */
export function hasAnyFilter(filters: AnalyticsFilters): boolean {
  return FILTER_KEYS.some((k) => filters[k] !== null)
}

/** Quais dimensões estão filtradas (para copy e diagnóstico). */
export function activeFilterKeys(filters: AnalyticsFilters): FilterKey[] {
  return FILTER_KEYS.filter((k) => filters[k] !== null)
}

/**
 * Só o que `applyLeadFilters` precisa — mantém o helper testável com fake.
 * `ilike` sem curinga é igualdade case-insensitive no Postgres, e é o que faz o
 * filtro de texto livre casar com o agrupamento do rótulo (AC11).
 */
export interface EqQuery<T> {
  eq(column: string, value: string): T
  ilike(column: string, value: string): T
}

/**
 * Aplica os filtros ativos numa query de `leads`.
 *
 * @param except dimensão a IGNORAR. É o que viabiliza o comportamento facetado
 *   (R5 do @po): para montar as opções da dimensão X, conta-se com todos os
 *   outros filtros aplicados MENOS o de X — senão a própria seleção colapsaria
 *   a lista de opções e não haveria caminho de volta.
 */
export function applyLeadFilters<T>(
  query: T,
  filters: AnalyticsFilters,
  except?: FilterKey
): T {
  // O genérico é LIVRE (não `T extends EqQuery<T>`) de propósito: com a
  // constraint recursiva, o TS tentava casar o tipo gigante do
  // PostgrestFilterBuilder contra ela e estourava em
  // "Type instantiation is excessively deep" (TS2589) no caller. O contrato
  // real é o cast abaixo — só `.eq()`/`.ilike()`, verificado pelo teste com fake.
  let q = query as unknown as EqQuery<T>
  for (const key of FILTER_KEYS) {
    if (key === except) continue
    const value = filters[key]
    if (value === null) continue
    const { column } = FILTER_SPEC[key]
    // `ilike` sem `%` = igualdade sem caixa. Escapar curinga é obrigatório:
    // uma profissão com "%" no texto viraria busca por prefixo.
    const proximo = isCaseInsensitive(key)
      ? q.ilike(column, value.replace(/([%_\\])/g, "\\$1"))
      : q.eq(column, value)
    q = proximo as unknown as EqQuery<T>
  }
  return q as unknown as T
}

/** Mesma decisão do `applyLeadFilters`, mas sobre linhas já em memória. */
export function matchesFilters(
  row: Partial<Record<string, unknown>>,
  filters: AnalyticsFilters,
  except?: FilterKey
): boolean {
  for (const key of FILTER_KEYS) {
    if (key === except) continue
    const value = filters[key]
    if (value === null) continue
    const cell = row[FILTER_SPEC[key].column]
    if (isCaseInsensitive(key)) {
      if (typeof cell !== "string") return false
      if (cell.trim().toLowerCase() !== value.trim().toLowerCase()) return false
    } else if (cell !== value) {
      return false
    }
  }
  return true
}

/** Parâmetros de período, que viajam junto com os filtros em todo link. */
export interface PeriodParams {
  range?: string | null
  from?: string | null
  to?: string | null
}

/**
 * Monta URL preservando TUDO que não foi sobrescrito — o coração do AC2.
 *
 * @param overrides `{ brokerId: "abc" }` troca só o corretor; `{ brokerId: null }`
 *   REMOVE o parâmetro (não deixa `&broker_id=` vazio — AC8).
 */
export function buildAnalyticsHref(
  basePath: string,
  filters: AnalyticsFilters,
  period: PeriodParams = {},
  overrides: Partial<AnalyticsFilters> = {}
): string {
  const merged: AnalyticsFilters = { ...filters, ...overrides }
  const sp = new URLSearchParams()

  // Período primeiro: mantém a URL legível e estável entre navegações.
  // `range=30d` é o default da tela e fica implícito, como já era.
  if (period.range && period.range !== "30d") sp.set("range", period.range)
  if (period.range === "custom") {
    if (period.from) sp.set("from", period.from)
    if (period.to) sp.set("to", period.to)
  }

  for (const key of FILTER_KEYS) {
    const value = merged[key]
    if (value !== null && value !== "") sp.set(FILTER_SPEC[key].param, value)
  }

  const qs = sp.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

/** Href que limpa TODOS os filtros, preservando o período (AC8). */
export function buildClearFiltersHref(
  basePath: string,
  period: PeriodParams = {}
): string {
  return buildAnalyticsHref(basePath, EMPTY_FILTERS, period)
}
