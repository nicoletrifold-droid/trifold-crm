/**
 * Story 900-57 · AC4 — a régua da paleta do console.
 *
 * ## O que ela mede, e por que não é "o teste da prop"
 *
 * A prop `palette` é fácil de acrescentar e fácil de acrescentar PELA METADE: bastava threadar
 * 14 dos 18 lugares que carregavam cor para a tela do console continuar com quatro remendos do
 * CRM — que é exatamente o defeito que a story existe para corrigir, só que menor e mais difícil
 * de ver. Um teste que só chamasse `classesDaPaleta("slate")` ficaria verde nesse estado.
 *
 * Por isso a régua central é uma VARREDURA de texto-fonte com uma afirmação absoluta: depois
 * desta story, **nenhuma cor literal sobrevive dentro de `integrations-panel.tsx`** e **nenhuma
 * classe da escala do CRM sobrevive em `app/platform/**`**. Qualquer remendo esquecido, e
 * qualquer remendo NOVO num PR futuro, reprova aqui com o nome do arquivo.
 *
 * ## Vivacidade
 *
 * "Zero ocorrências" é indistinguível de "a varredura não olhou para arquivo nenhum" e de "o
 * detector não detecta". Os controles positivos abaixo medem as duas coisas, e o de árvore real
 * envenena um arquivo REAL — não uma fixture sintética.
 */

import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  PALETAS,
  PALETA_PADRAO,
  classesDaPaleta,
  type ClassesDaPaleta,
} from "@web/components/integrations/paleta"
import { arquivosDeProducao, callSiteDe, codigoDe, linhasDeCodigo } from "./fonte-scan"

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(AQUI, "../..") // packages/web/src

const PAINEL = path.join(SRC, "components/integrations/integrations-panel.tsx")
const RAIZ_DO_CONSOLE = path.join(SRC, "app/platform")
const INTEGRACOES_DO_CONSOLE = path.join(SRC, "app/platform/orgs/[id]/integracoes/page.tsx")

/**
 * As classes da escala do CRM, escritas de forma que a própria régua não se acuse: o prefixo é
 * montado em runtime, então este arquivo NÃO contém o literal que ele procura. Sem isso a
 * varredura de `app/platform/**` teria de excluir a si mesma, e exclusão é onde essas réguas
 * apodrecem.
 */
const ESCALA_DO_CRM = "sto" + "ne-"
const ESCALA_DO_CONSOLE = "sla" + "te-"

/** As linhas de `fonte` que citam uma escala de cinza. Fonte limpa ⇒ `[]`. */
function linhasComEscala(fonte: string, escala: string): string[] {
  return fonte
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.includes(escala))
}

/**
 * `linhasDeCodigo`, `codigoDe` e `callSiteDe` moram em `fonte-scan.ts` desde que um SEGUNDO
 * arquivo de régua (`console-fail-closed.test.ts`) passou a precisar deles. Eram locais aqui, e
 * a terceira cópia de um detector que já ficou verde três vezes seria o começo do apodrecimento:
 * cada cópia deixa de aprender o que as outras aprenderam. As três formas que os motivam — o
 * comentário em prosa, o comentário JSX e o recorte até o fim do arquivo — estão documentadas lá.
 */

/** As linhas de CÓDIGO que pedem a paleta do console. Comentário citando a prop não conta. */
function linhasComPropDePaleta(fonte: string): string[] {
  return linhasDeCodigo(fonte).filter((l) => l.includes('palette="slate"'))
}

describe("AC4 — a tabela de paletas", () => {
  it("o default é a escala do CRM: o `/dashboard` não muda de aparência", () => {
    // O `/dashboard` não passa a prop. Se o default virasse `slate`, a tela do CLIENTE mudaria
    // por causa de uma correção do console da Trifold — e nenhuma outra régua veria isso.
    expect(PALETA_PADRAO).toBe("stone")
    expect(classesDaPaleta()).toBe(PALETAS.stone)
    expect(classesDaPaleta(undefined)).toBe(PALETAS.stone)
    expect(classesDaPaleta("slate")).toBe(PALETAS.slate)
  })

  it("as duas paletas têm EXATAMENTE os mesmos papéis", () => {
    // Uma chave a menos em `slate` não daria erro de tipo se alguém a marcasse opcional, e o
    // lugar correspondente na tela ficaria sem classe nenhuma — invisível até alguém abrir.
    expect(Object.keys(PALETAS.slate).sort()).toEqual(Object.keys(PALETAS.stone).sort())
    expect(Object.keys(PALETAS.stone).length).toBeGreaterThan(0)
  })

  it("cada papel de `stone` usa SÓ a escala do CRM, e cada papel de `slate` SÓ a do console", () => {
    for (const [papel, valor] of Object.entries(PALETAS.stone) as Array<[string, string]>) {
      expect(valor, `stone.${papel}`).toContain(ESCALA_DO_CRM)
      expect(valor, `stone.${papel}`).not.toContain(ESCALA_DO_CONSOLE)
    }
    for (const [papel, valor] of Object.entries(PALETAS.slate) as Array<[string, string]>) {
      expect(valor, `slate.${papel}`).toContain(ESCALA_DO_CONSOLE)
      expect(valor, `slate.${papel}`).not.toContain(ESCALA_DO_CRM)
    }
  })

  it("QA-900-57-2 — o campo de senha é byte a byte o da `main`, e não uma concatenação", () => {
    // A string abaixo é o `class` do `<input type="password">` em `main@1393fa68`, copiada byte
    // a byte (só o prefixo da escala é montado, para este arquivo não conter o literal que ele
    // varre). A âncora é a FONTE ANTERIOR, não `PALETAS`: derivar o esperado da tabela que se
    // testa aprovaria qualquer valor que a tabela viesse a ter.
    const NA_MAIN =
      `mt-1 w-full rounded border border-${ESCALA_DO_CRM}700 bg-${ESCALA_DO_CRM}950 ` +
      `px-2 py-1 font-mono text-sm text-${ESCALA_DO_CRM}100`
    expect(PALETAS.stone.campoMono).toBe(NA_MAIN)

    // `${classes.campo} font-mono` põe o token no FIM da string. Mesmo multiconjunto de tokens,
    // ordem diferente — sem efeito visual, mas o `/dashboard` deixa de ser byte a byte igual à
    // `main`, e é essa distinção que a frase do Change Log confundia.
    expect(PALETAS.stone.campoMono).not.toBe(`${PALETAS.stone.campo} font-mono`)
    expect(codigoDe(fs.readFileSync(PAINEL, "utf8"))).toContain("className={classes.campoMono}")
  })

  it("as duas paletas diferem em TODOS os papéis — nenhum ficou copiado por engano", () => {
    for (const papel of Object.keys(PALETAS.stone) as Array<keyof ClassesDaPaleta>) {
      expect(PALETAS.slate[papel], `papel ${papel}`).not.toBe(PALETAS.stone[papel])
    }
  })
})

describe("AC4 — nenhuma cor sobreviveu solta no componente compartilhado", () => {
  it("`integrations-panel.tsx` não tem literal de escala de cinza nenhum", () => {
    const fonte = fs.readFileSync(PAINEL, "utf8")
    // Vivacidade no MESMO `it`: um caminho errado devolveria fonte vazia e as duas asserções
    // abaixo passariam por vacuidade, aprovando o nada.
    expect(fonte.length).toBeGreaterThan(1000)
    expect(linhasComEscala(fonte, ESCALA_DO_CRM)).toEqual([])
    expect(linhasComEscala(fonte, ESCALA_DO_CONSOLE)).toEqual([])
  })

  it("o detector está VIVO contra o arquivo real, não só contra fixture", () => {
    const fonte = fs.readFileSync(PAINEL, "utf8")
    const envenenada = `${fonte}\nconst remendo = "bg-${ESCALA_DO_CRM}900"\n`
    expect(linhasComEscala(envenenada, ESCALA_DO_CRM)).toHaveLength(1)
  })

  it("o componente consome a tabela — a prop não é decorativa", () => {
    const fonte = fs.readFileSync(PAINEL, "utf8")
    // Sobre o CÓDIGO, não sobre o arquivo: `toContain` no arquivo inteiro fica verde com a
    // chamada trocada por `PALETAS.stone` e um comentário citando a chamada em prosa — e nesse
    // estado a prop é inteiramente decorativa, o que devolve a tela do console à escala do CRM.
    expect(codigoDe(fonte)).toContain("classesDaPaleta(palette)")

    // `Tile` e `Badge` são funções SEPARADAS dentro do arquivo e hardcodavam a escala por conta
    // própria. Threadar só o componente-pai deixaria os 5 tiles — o corpo da tela — na escala do
    // CRM. Os dois call sites são medidos em recortes DELIMITADOS e disjuntos: fatiar até o fim
    // do arquivo faz o recorte do Badge conter o do Tile, e aí um satisfaz o outro.
    const doTile = callSiteDe(fonte, "<Tile")
    const doBadge = callSiteDe(fonte, "<Badge")
    expect(doTile).toContain("classes={classes}")
    expect(doBadge).toContain("classes={classes}")
    expect(doTile).not.toContain("<Badge")
    expect(doBadge).not.toContain("<Tile")
  })
})

describe("AC4 — o console inteiro fala uma língua visual só", () => {
  it("nenhum arquivo de `app/platform/**` usa a escala do CRM", () => {
    const arquivos = arquivosDeProducao(RAIZ_DO_CONSOLE)
    expect(arquivos.length).toBeGreaterThan(0)

    const achados: Array<{ arquivo: string; linhas: string[] }> = []
    for (const arquivo of arquivos) {
      const linhas = linhasComEscala(fs.readFileSync(arquivo, "utf8"), ESCALA_DO_CRM)
      if (linhas.length > 0) achados.push({ arquivo: path.relative(SRC, arquivo), linhas })
    }
    expect(achados).toEqual([])
  })

  it("a tela de integrações do console pede a paleta do console", () => {
    // Sem esta linha, a varredura acima ficaria verde com a página no default — porque as cores
    // dela não estão mais no texto-fonte dela, e sim na tabela.
    //
    // A asserção mede a linha de JSX, NÃO o arquivo inteiro: a primeira versão media o arquivo, e
    // apagar a prop deixava a régua verde porque um comentário de topo citava `palette="slate"`
    // em prosa. O comentário foi reescrito e a medição foi estreitada — as duas coisas, porque
    // qualquer uma delas sozinha volta a apodrecer no próximo PR.
    const fonte = fs.readFileSync(INTEGRACOES_DO_CONSOLE, "utf8")
    expect(linhasComPropDePaleta(fonte)).toHaveLength(1)
  })

  it("a tela do CLIENTE continua sem pedir paleta — é assim que ela não muda", () => {
    const fonte = fs.readFileSync(
      path.join(SRC, "app/dashboard/configuracoes/integracoes/page.tsx"),
      "utf8",
    )
    expect(fonte).not.toContain("palette=")
  })
})

/**
 * AC4 · QA-900-57-1 — um controle positivo por furo.
 *
 * As três asserções de texto-fonte acima já estiveram VERDES com a prop de paleta neutralizada:
 * um comentário citando a chamada, um recorte de call site que engolia o call site vizinho, e um
 * comentário JSX. Os três foram medidos (`tsc --noEmit` rc=0, régua 10/10 verde) — não são
 * hipóteses.
 *
 * Consertar sem exercitar o conserto deixa a correção como PROSA, e prosa não é herdada pelo
 * próximo PR: quem reescrever a régua não tem como saber que aquele filtro e aquele recorte são
 * o carrasco, e não decoração. Cada `it` abaixo envenena a FONTE REAL da forma exata que
 * escapava e afirma que agora ela reprova — e, onde vale, afirma também que a forma ANTIGA da
 * asserção continuaria verde, que é a medida do que se ganhou.
 *
 * Todos são fail-closed: se a âncora do envenenamento não casar (reindentação, renomeação), o
 * `not.toBe(fonte)` reprova em vez de aprovar por mutação inerte.
 */
describe("AC4 — a régua morde as três formas que já a driblaram", () => {
  it("furo q8: comentário citando `classesDaPaleta(palette)` não substitui a chamada", () => {
    const fonte = fs.readFileSync(PAINEL, "utf8")
    const envenenada = fonte.replace(
      "const classes = classesDaPaleta(palette)",
      "// a paleta vem de classesDaPaleta(palette)\n  const classes = PALETAS.stone",
    )
    expect(envenenada).not.toBe(fonte)

    // O estado da mutação: a prop `palette` fica INTEIRAMENTE decorativa e a tela de integrações
    // do console volta toda à escala do CRM — e a varredura de cor não vê nada, porque
    // `PALETAS.stone` é um identificador e não contém o literal da escala.
    expect(linhasComEscala(envenenada, ESCALA_DO_CRM)).toEqual([])

    // A forma ANTIGA da asserção (arquivo inteiro) continuaria VERDE…
    expect(envenenada).toContain("classesDaPaleta(palette)")
    // …e a forma nova reprova.
    expect(codigoDe(envenenada)).not.toContain("classesDaPaleta(palette)")
  })

  it("furo M3: o recorte do `<Badge>` não é satisfeito pelo call site do `<Tile>`", () => {
    const fonte = fs.readFileSync(PAINEL, "utf8")
    const inicio = fonte.indexOf("<Badge")
    const fim = fonte.indexOf("/>", inicio)
    expect(inicio).toBeGreaterThan(-1)
    expect(fim).toBeGreaterThan(inicio)

    // A causa do furo, medida e não descrita: o `<Tile>` vem DEPOIS do `<Badge>`, então fatiar
    // do `<Badge` até o fim do arquivo inclui o call site do `<Tile>`.
    expect(fonte.slice(inicio)).toContain("<Tile")

    const envenenada =
      fonte.slice(0, inicio) +
      fonte.slice(inicio, fim).replace("classes={classes}", "classes={PALETAS.stone}") +
      fonte.slice(fim)
    expect(envenenada).not.toBe(fonte)

    // A forma ANTIGA (slice até o EOF) continuaria VERDE, porque o `<Tile>` ainda tem a prop…
    expect(envenenada.slice(envenenada.indexOf("<Badge"))).toContain("classes={classes}")
    // …e os recortes delimitados são disjuntos: só o do Badge acende.
    expect(callSiteDe(envenenada, "<Badge")).not.toContain("classes={classes}")
    expect(callSiteDe(envenenada, "<Tile")).toContain("classes={classes}")
  })

  it("furo q4c: comentário JSX `{/* … */}` não substitui a prop na tela do console", () => {
    const fonte = fs.readFileSync(INTEGRACOES_DO_CONSOLE, "utf8")
    const envenenada = fonte
      .replace('        palette="slate"\n', "")
      .replace(
        "      <IntegrationsPanel\n",
        '      {/* palette="slate" */}\n      <IntegrationsPanel\n',
      )
    expect(envenenada).not.toBe(fonte)
    expect(envenenada).not.toContain('palette="slate"\n      />')

    // O filtro antigo cobria `*` e `//` e NÃO cobria `{/*`, que é a forma idiomática num `.tsx`.
    const filtroAntigo = envenenada
      .split("\n")
      .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//"))
      .filter((l) => l.includes('palette="slate"'))
    expect(filtroAntigo).toHaveLength(1) // continuaria VERDE
    expect(linhasComPropDePaleta(envenenada)).toHaveLength(0) // agora reprova
  })
})
