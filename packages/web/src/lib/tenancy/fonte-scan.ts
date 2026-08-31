/**
 * Epic 900 · Console de plataforma — os primitivos de varredura de TEXTO-FONTE.
 *
 * Nasceram dentro de `console-paleta.test.ts` (Story 900-57, AC4) e saíram para cá quando um
 * segundo arquivo de régua passou a precisar deles. Duplicá-los seria a terceira cópia de um
 * detector que já ficou VERDE três vezes com a prop de paleta neutralizada — e cada cópia
 * apodrece por conta própria.
 *
 * ## As três formas que já driblaram uma régua de texto-fonte neste repositório
 *
 * 1. **Comentário de bloco/linha** citando a chamada em prosa: `toContain` sobre o arquivo
 *    inteiro não distingue "a chamada existe" de "alguém a escreveu num comentário".
 * 2. **Comentário JSX** aberto por chave-barra-asterisco, a forma idiomática num `.tsx`, que o
 *    filtro de `*` e `//` não cobria.
 * 3. **Recorte até o fim do arquivo**: `fonte.slice(fonte.indexOf("<Badge"))` engolia o call site
 *    do `<Tile>` adiante, e a asserção do primeiro passava a ser satisfeita pelo segundo.
 *
 * `linhasDeCodigo`/`codigoDe` matam (1) e (2); `trechoDelimitado`/`callSiteDe` matam (3).
 *
 * ⚠️ Só as asserções POSITIVAS ("esta chamada existe") usam este filtro. Varredura de PROIBIÇÃO
 * ("nenhuma cor literal sobrevive") mede o arquivo inteiro de propósito: lá, ignorar comentário
 * afrouxaria uma afirmação absoluta.
 *
 * Este arquivo é `.ts` e não `.test.ts` porque o `include` do `vitest.config.ts` casa o sufixo
 * `.test.ts` — um helper com aquele sufixo viraria uma suíte sem nenhum `it`. É o mesmo arranjo
 * de `platform-query-scan.ts`.
 */

/**
 * As linhas de `fonte` que são CÓDIGO, já trimadas.
 *
 * As quatro formas filtradas são as quatro que existem num `.tsx`: corpo de bloco (` * `), linha
 * (`//`), abertura de bloco (`/*`) e comentário JSX (`{/*`).
 */
export function linhasDeCodigo(fonte: string): string[] {
  return fonte
    .split("\n")
    .map((l) => l.trim())
    .filter(
      (l) =>
        !l.startsWith("*") && !l.startsWith("//") && !l.startsWith("/*") && !l.startsWith("{/*"),
    )
}

/** Só o código de `fonte`, como um texto só. */
export function codigoDe(fonte: string): string {
  return linhasDeCodigo(fonte).join("\n")
}

/**
 * O CÓDIGO do trecho que vai de `abertura` até o primeiro `fechamento` depois dela.
 *
 * Fail-closed: abertura ausente, ou trecho sem fechamento, devolve `""` — e `""` reprova
 * qualquer `toContain`. Um recorte que não encontrou o alvo nunca pode virar aprovação.
 */
export function trechoDelimitado(fonte: string, abertura: string, fechamento: string): string {
  const inicio = fonte.indexOf(abertura)
  if (inicio < 0) return ""
  const fim = fonte.indexOf(fechamento, inicio + abertura.length)
  if (fim < 0) return ""
  return codigoDe(fonte.slice(inicio, fim + fechamento.length))
}

/** O código do call site JSX de `tag`, de `<Tag` até o `/>` que o fecha. */
export function callSiteDe(fonte: string, tag: string): string {
  return trechoDelimitado(fonte, tag, "/>")
}

/**
 * Quantas vezes `agulha` aparece nas linhas de CÓDIGO de `fonte`.
 *
 * `split` e não `matchAll`: `agulha` é literal, e transformá-la em regex faria `.limit(` e
 * `platformQuery(` casarem como grupo em vez de como texto.
 */
export function ocorrenciasNoCodigo(fonte: string, agulha: string): number {
  return codigoDe(fonte).split(agulha).length - 1
}
