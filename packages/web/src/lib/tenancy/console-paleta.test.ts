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

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(AQUI, "../..") // packages/web/src

const PAINEL = path.join(SRC, "components/integrations/integrations-panel.tsx")
const RAIZ_DO_CONSOLE = path.join(SRC, "app/platform")

/**
 * As classes da escala do CRM, escritas de forma que a própria régua não se acuse: o prefixo é
 * montado em runtime, então este arquivo NÃO contém o literal que ele procura. Sem isso a
 * varredura de `app/platform/**` teria de excluir a si mesma, e exclusão é onde essas réguas
 * apodrecem.
 */
const ESCALA_DO_CRM = "sto" + "ne-"
const ESCALA_DO_CONSOLE = "sla" + "te-"

/** Todo arquivo `.ts`/`.tsx` de produção sob `dir`. */
function arquivosDeProducao(dir: string, acc: string[] = []): string[] {
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

/** As linhas de `fonte` que citam uma escala de cinza. Fonte limpa ⇒ `[]`. */
function linhasComEscala(fonte: string, escala: string): string[] {
  return fonte
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.includes(escala))
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
    expect(fonte).toContain("classesDaPaleta(palette)")

    // `Tile` e `Badge` são funções SEPARADAS dentro do arquivo e hardcodavam a escala por conta
    // própria. Threadar só o componente-pai deixaria os 5 tiles — o corpo da tela — na escala do
    // CRM. A primeira versão desta asserção era um `toContain` único, e passava VERDE com o
    // `classes` do `Tile` removido: o `Badge` sozinho já satisfazia a busca. Medir os DOIS call
    // sites separadamente é o que mata essa mutação.
    const chamadaDoTile = fonte.slice(fonte.indexOf("<Tile"))
    expect(chamadaDoTile).toContain("classes={classes}")
    const chamadaDoBadge = fonte.slice(fonte.indexOf("<Badge"))
    expect(chamadaDoBadge).toContain("classes={classes}")
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
    const fonte = fs.readFileSync(
      path.join(SRC, "app/platform/orgs/[id]/integracoes/page.tsx"),
      "utf8",
    )
    const linhasDeJsx = fonte
      .split("\n")
      .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//"))
    expect(linhasDeJsx.filter((l) => l.includes('palette="slate"'))).toHaveLength(1)
  })

  it("a tela do CLIENTE continua sem pedir paleta — é assim que ela não muda", () => {
    const fonte = fs.readFileSync(
      path.join(SRC, "app/dashboard/configuracoes/integracoes/page.tsx"),
      "utf8",
    )
    expect(fonte).not.toContain("palette=")
  })
})
