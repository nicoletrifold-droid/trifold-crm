// Story 75-272 — as opções de cada filtro saem dos DADOS, com contagem no
// rótulo, e são FACETADAS.
//
// POR QUE A CONTAGEM NO RÓTULO NÃO É ENFEITE. Medido em prod em 04/08 (1.657
// leads/90d): os campos de perfil do lead estão preenchidos em **1 a 2%**
// (`estado_civil` 1,9%, `profissao` 1,8%, `tem_pet` 1,0%). Um filtro
// "Estado civil = Casado" devolve 31 de 1.657 — sem a contagem visível, o
// usuário clica, vê o gráfico esvaziar e conclui "o analytics está errado" em
// vez de "esse dado quase não é preenchido". A contagem transforma escassez
// escondida em escassez informada. Corretor (97,6%) e Calor (79,6%) não têm
// esse problema, mas ganham contagem pela consistência.
//
// POR QUE FACETADO (ressalva R5 do @po). As opções de uma dimensão são contadas
// com todos os OUTROS filtros ativos aplicados, e a própria dimensão livre.
// Se contássemos com tudo aplicado, escolher "Casado" deixaria só "Casado" na
// lista e não haveria como trocar. Se contássemos sem nenhum filtro, a opção
// "Casado (31)" poderia devolver zero quando combinada com um corretor que não
// atende nenhum dos 31. Facetado é o único jeito de a contagem do rótulo ser
// verdade e a dimensão seguir trocável.

import { matchesFilters, isCaseInsensitive, FILTER_SPEC, type AnalyticsFilters, type FilterKey } from "./filters"
import { INTEREST_LEVEL_LABELS, SOURCE_LABELS_SHORT } from "@web/lib/constants"

export interface FilterOption {
  value: string
  /** Rótulo humano, SEM a contagem. */
  label: string
  count: number
}

/** Linha mínima para facetar: as colunas dos filtros. */
export type FacetRow = Record<string, unknown>

/**
 * Rótulo de um valor. Dimensões com mapa canônico usam o mapa (importado, nunca
 * copiado — lição registrada no repo); as demais mostram o próprio valor.
 */
export function labelDoValor(key: FilterKey, value: string, extra?: Map<string, string>): string {
  if (extra?.has(value)) return extra.get(value)!
  if (key === "interestLevel") return INTEREST_LEVEL_LABELS[value] ?? value
  if (key === "finalidade") return FINALIDADE_LABELS[value] ?? value
  if (key === "temPet") return SIM_NAO_LABELS[value] ?? value
  return value
}

/**
 * Finalidade tem 3 valores em prod (`moradia` 185, `ambos` 31,
 * `investimento` 25) e NÃO existe mapa canônico para eles no repo — os rótulos
 * nascem aqui. Se um dia virar enum compartilhado, importar de lá.
 */
export const FINALIDADE_LABELS: Record<string, string> = {
  moradia: "Moradia",
  investimento: "Investimento",
  ambos: "Ambos",
}

export const SIM_NAO_LABELS: Record<string, string> = {
  sim: "Sim",
  nao: "Não",
  true: "Sim",
  false: "Não",
}

/** Chave de agrupamento: texto livre agrupa sem caixa (mesmo critério do AC11). */
function chaveDeGrupo(key: FilterKey, raw: string): string {
  return isCaseInsensitive(key) ? raw.trim().toLowerCase() : raw
}

/**
 * Opções de UMA dimensão, contadas sobre as linhas que passam por todos os
 * OUTROS filtros ativos.
 *
 * @param labels rótulos externos por valor (ex.: id de corretor → nome, id de
 *   empreendimento → nome), já resolvidos por quem chama.
 */
export function facetOptions(
  rows: FacetRow[],
  filters: AnalyticsFilters,
  key: FilterKey,
  labels?: Map<string, string>
): FilterOption[] {
  const { column } = FILTER_SPEC[key]
  // grafias: conta cada escrita literal, para eleger a mais comum como rótulo —
  // é o mesmo critério do aggregatePerfil (perfil.ts:68-71), e é o que faz o
  // rótulo do FILTRO bater com o rótulo do CARD "Perfil dos Leads".
  const grupos = new Map<string, { count: number; grafias: Map<string, number> }>()

  for (const row of rows) {
    // `except: key` = a própria dimensão fica livre; o resto vale (facetado).
    if (!matchesFilters(row, filters, key)) continue

    const cell = row[column]
    if (cell === null || cell === undefined) continue
    const raw = String(cell).trim()
    if (raw === "") continue

    const grupo = chaveDeGrupo(key, raw)
    let entrada = grupos.get(grupo)
    if (!entrada) {
      entrada = { count: 0, grafias: new Map() }
      grupos.set(grupo, entrada)
    }
    entrada.count++
    entrada.grafias.set(raw, (entrada.grafias.get(raw) ?? 0) + 1)
  }

  const opcoes: FilterOption[] = []
  for (const { count, grafias } of grupos.values()) {
    // Empate de grafia resolvido alfabeticamente, para o rótulo não oscilar
    // entre renders com os mesmos dados.
    const ordenadas = [...grafias.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR")
    )
    // O grupo só existe porque teve ao menos uma linha, então há grafia.
    const value = ordenadas[0]![0]
    opcoes.push({ value, label: labelDoValor(key, value, labels), count })
  }

  return opcoes.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    return a.label.localeCompare(b.label, "pt-BR")
  })
}

/**
 * Opções do filtro de Corretor. Separada de `facetOptions` porque o nome do
 * corretor NÃO está na linha do lead — vem de um mapa externo — e opção sem nome
 * resolvido é inutilizável: foi o defeito visto em prod em 04/08, onde o gestor
 * escolhia entre um nome e seis uuid (Story 75-274).
 *
 * @param nomes id do corretor → nome. Faz DOIS papéis de propósito: rótulo e
 *   régua de quem pode aparecer. Quem monta o mapa já decidiu isso (na tela:
 *   corretor ativo na roleta, Story 75-53), então "sem nome" e "não pode
 *   aparecer" não conseguem divergir.
 * @param hiddenBrokerNames nomes ocultos (corretor demo etc.) — mesma convenção
 *   de `aggregateFilteredLeads`. A peneira é por NOME, então ela só volta a
 *   funcionar agora que o rótulo deixou de ser uuid.
 */
export function brokerFilterOptions(
  rows: FacetRow[],
  filters: AnalyticsFilters,
  nomes: Map<string, string>,
  hiddenBrokerNames: Set<string> = new Set()
): FilterOption[] {
  return facetOptions(rows, filters, "brokerId", nomes).filter(
    (o) => nomes.has(o.value) && !hiddenBrokerNames.has(o.label.toLowerCase().trim())
  )
}

/** Rótulo com a contagem, do jeito que vai para o `<option>`. */
export function optionLabelComContagem(o: FilterOption): string {
  return `${o.label} (${o.count})`
}

/**
 * A frase do aviso de cobertura, ou `null` quando TODA linha do recorte tem o
 * dado — dimensão densa não precisa de aviso, e aviso que sempre aparece deixa
 * de ser lido (Story 75-274, AC5).
 *
 * Vale para Corretor e Calor também, não só para o perfil do lead: `interest_level`
 * está em 79,6% da base, mas dentro de um recorte a densidade muda (medido em
 * prod: 29 de 50 num corretor). Sem a frase, a soma que não fecha parece defeito
 * de contador em vez de dado ausente.
 */
export function coverageNote(cobertura: { comValor: number; total: number }): string | null {
  if (cobertura.comValor >= cobertura.total) return null
  const n = (v: number) => v.toLocaleString("pt-BR")
  return `${n(cobertura.comValor)} de ${n(cobertura.total)} com o dado`
}

/**
 * Cobertura de uma dimensão: quantas linhas (dentre as que passam pelos outros
 * filtros) têm valor. Alimenta o aviso do AC5 — "a tela está falando de 31 de
 * 1.657 leads" — para o número pequeno ser explicado, não misterioso.
 */
export function facetCoverage(
  rows: FacetRow[],
  filters: AnalyticsFilters,
  key: FilterKey
): { comValor: number; total: number } {
  const { column } = FILTER_SPEC[key]
  let comValor = 0
  let total = 0
  for (const row of rows) {
    if (!matchesFilters(row, filters, key)) continue
    total++
    const cell = row[column]
    if (cell !== null && cell !== undefined && String(cell).trim() !== "") comValor++
  }
  return { comValor, total }
}

/** Re-export p/ a UI de Origem seguir lendo a fonte única (Story 75-269). */
export { SOURCE_LABELS_SHORT }
