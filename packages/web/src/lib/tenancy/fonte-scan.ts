/**
 * Epic 900 · Console de plataforma — os primitivos de varredura de TEXTO-FONTE.
 *
 * Nasceram dentro de `console-paleta.test.ts` (Story 900-57, AC4) e saíram para cá quando um
 * segundo arquivo de régua passou a precisar deles. Duplicá-los seria a terceira cópia de um
 * detector que já ficou VERDE três vezes com a prop de paleta neutralizada — e cada cópia
 * apodrece por conta própria.
 *
 * ## As quatro formas que já driblaram uma régua de texto-fonte neste repositório
 *
 * 1. **Comentário de bloco/linha** citando a chamada em prosa: `toContain` sobre o arquivo
 *    inteiro não distingue "a chamada existe" de "alguém a escreveu num comentário".
 * 2. **Comentário JSX** aberto por chave-barra-asterisco, a forma idiomática num `.tsx`, que o
 *    filtro de `*` e `//` não cobria.
 * 3. **Recorte até o fim do arquivo**: `fonte.slice(fonte.indexOf("<Badge"))` engolia o call site
 *    do `<Tile>` adiante, e a asserção do primeiro passava a ser satisfeita pelo segundo.
 * 4. **A CONTINUAÇÃO de um comentário de bloco** — achado do CodeRabbit no PR #547. O filtro
 *    original olhava o INÍCIO da linha, então só a linha de ABERTURA do bloco era descartada:
 *    da segunda linha em diante o comentário voltava a ser "código". É a mesma classe de (1) e
 *    (2), na forma que sobreviveu aos dois consertos anteriores — e o corpus REAL tem seis
 *    comentários JSX de duas linhas, então não era hipótese.
 *
 * `linhasDeCodigo`/`codigoDe` matam (1), (2) e (4); `trechoDelimitado`/`callSiteDe` matam (3).
 *
 * ⚠️ Só as asserções POSITIVAS ("esta chamada existe") usam este filtro. Varredura de PROIBIÇÃO
 * ("nenhuma cor literal sobrevive") mede o arquivo inteiro de propósito: lá, ignorar comentário
 * afrouxaria uma afirmação absoluta.
 *
 * Este arquivo é `.ts` e não `.test.ts` porque o `include` do `vitest.config.ts` casa o sufixo
 * `.test.ts` — um helper com aquele sufixo viraria uma suíte sem nenhum `it`. É o mesmo arranjo
 * de `platform-query-scan.ts`.
 */

import fs from "node:fs"
import path from "node:path"

const ABRE_BLOCO = "/" + "*"
const FECHA_BLOCO = "*" + "/"
const FECHA_BLOCO_JSX = FECHA_BLOCO + "}"

/**
 * Todo arquivo `.ts`/`.tsx` de PRODUÇÃO sob `dir`, recursivamente.
 *
 * Nasceu em `console-paleta.test.ts` e veio para cá quando um segundo arquivo de régua passou a
 * varrer a mesma árvore. Diretório inexistente devolve o acumulador como está — quem precisa de
 * vivacidade (`length > 0`) afirma isso no próprio `it`, porque uma varredura que aprova o vazio
 * é indistinguível de uma árvore limpa.
 */
export function arquivosDeProducao(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const alvo = path.join(dir, entrada.name)
    if (entrada.isDirectory()) {
      if (["__tests__", "__fixtures__", "__mocks__"].includes(entrada.name)) continue
      arquivosDeProducao(alvo, acc)
      continue
    }
    if (!/\.tsx?$/.test(entrada.name)) continue
    if (/\.test\.tsx?$/.test(entrada.name)) continue
    acc.push(alvo)
  }
  return acc
}

/**
 * Onde começa o comentário de LINHA em `trecho`, ou `-1`.
 *
 * A barra dupla precedida de `:` é uma URL (`https://…`), não um comentário. Sem esta guarda o
 * filtro cortaria o meio de um literal legítimo — e a asserção positiva sobre ele viraria um
 * vermelho falso.
 */
function inicioDeComentarioDeLinha(trecho: string): number {
  for (let de = 0; ; ) {
    const i = trecho.indexOf("//", de)
    if (i < 0) return -1
    if (i === 0 || trecho[i - 1] !== ":") return i
    de = i + 2
  }
}

/**
 * As linhas de `fonte` que são CÓDIGO, já trimadas.
 *
 * Não é um filtro por prefixo: é uma varredura com ESTADO, porque comentário de bloco atravessa
 * a quebra de linha e a linha de continuação não carrega marcador nenhum (forma 4 do cabeçalho).
 * O estado sobrevive de uma linha para a seguinte; o que estiver dentro do bloco é descartado
 * inteiro, e o código que sobra ANTES da abertura ou DEPOIS do fechamento é preservado.
 *
 * A chave de `{` mais barra-asterisco faz parte do comentário JSX, e por isso sai junto — deixá-la
 * para trás encheria o código de `{`/`}` órfãos que nenhuma asserção pede.
 *
 * A linha que começa com `*` continua sendo descartada mesmo fora de bloco: `trechoDelimitado`
 * recorta a fonte crua e o recorte pode começar no MEIO de um bloco, sem a abertura que ligaria
 * o estado.
 *
 * Sobra ou falta: sobra. Descartar demais deixa uma asserção positiva VERMELHA (falso alarme,
 * visível); descartar de menos é o furo, que fica verde e silencioso.
 */
export function linhasDeCodigo(fonte: string): string[] {
  const linhas: string[] = []
  let dentroDeBloco = false

  for (const bruta of fonte.split("\n")) {
    const trimada = bruta.trim()
    if (!dentroDeBloco && trimada.startsWith("*")) continue

    let resto = bruta
    let codigo = ""

    while (resto.length > 0) {
      if (dentroDeBloco) {
        const fim = resto.indexOf(FECHA_BLOCO)
        if (fim < 0) break
        const jsx = resto.startsWith(FECHA_BLOCO_JSX, fim)
        resto = resto.slice(fim + (jsx ? FECHA_BLOCO_JSX.length : FECHA_BLOCO.length))
        dentroDeBloco = false
        continue
      }

      const abre = resto.indexOf(ABRE_BLOCO)
      const barras = inicioDeComentarioDeLinha(resto)

      if (abre >= 0 && (barras < 0 || abre < barras)) {
        const corte = abre > 0 && resto[abre - 1] === "{" ? abre - 1 : abre
        codigo += resto.slice(0, corte)
        resto = resto.slice(abre + ABRE_BLOCO.length)
        dentroDeBloco = true
        continue
      }

      if (barras >= 0) {
        codigo += resto.slice(0, barras)
        break
      }

      codigo += resto
      break
    }

    // Linha que era SÓ comentário some, como sumia antes. Linha em branco de verdade continua
    // sendo uma linha em branco: `codigoDe` junta com `\n` e o formato do texto não muda.
    if (codigo.trim() === "" && trimada !== "") continue
    linhas.push(codigo.trim())
  }

  return linhas
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
