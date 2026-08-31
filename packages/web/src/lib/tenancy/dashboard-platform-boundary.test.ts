/**
 * Story 900-51 · AC9 — a fronteira `/dashboard` × `lib/tenancy/platform-*`, varrida.
 *
 * ## Por que esta régua e não a da AC-B4 (`platform-query-scan`)
 *
 * A AC-B4 da 900-22b varre o lado da PLATAFORMA e proíbe `.from(<literal>)` cru. Esta varre o
 * lado do CLIENTE e proíbe outra coisa: importar o guard/o caminho de leitura de plataforma. São
 * perguntas diferentes sobre superfícies diferentes, e a segunda não existia.
 *
 * ## Os TRÊS diretórios, e por que `components/integrations/**` está aqui
 *
 * `app/dashboard/**` e `app/api/configuracoes/**` são as superfícies do cliente. O terceiro é o
 * acréscimo desta rodada e é o mais importante: `components/integrations/**` é importado pelas
 * **duas** superfícies. É o candidato natural a virar a ponte — alguém precisa de uma leitura
 * cross-org "só para o platform admin", importa `platformQuery` dentro do componente
 * compartilhado, e o `/dashboard` passa a carregar o caminho de service-role junto. A varredura
 * da v0.2 deixava exatamente esse arquivo de fora.
 *
 * ## Vivacidade dos dois lados
 *
 * "Zero ocorrências" é indistinguível de "a varredura não olhou para arquivo nenhum" e de "o
 * detector não detecta". Os dois controles positivos abaixo existem por isso, e o segundo mede a
 * árvore REAL (contagem > 0), não uma fixture.
 */

import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(AQUI, "../..") // packages/web/src

/** Os TRÊS diretórios da AC9. */
const DIRETORIOS_DO_CLIENTE = [
  path.join(SRC, "app/dashboard"),
  path.join(SRC, "app/api/configuracoes"),
  path.join(SRC, "components/integrations"),
]

/**
 * Os módulos de plataforma que NÃO podem ser importados do lado do cliente.
 * Cobre as duas grafias de caminho que o repositório usa (`@web/lib/...` e relativo).
 */
const MODULOS_PROIBIDOS = ["lib/tenancy/platform-guard", "lib/tenancy/platform-query"]

/**
 * Devolve os módulos de plataforma importados por este fonte.
 *
 * Casa `import ... from "…"`, `import "…"`, `export ... from "…"` e `await import("…")` — as
 * quatro formas que o TypeScript aceita. Um detector que só olhasse a primeira ficaria cego
 * justamente para o `await import()` dinâmico, que é a forma que alguém usaria para "não poluir o
 * bundle" — o motivo mais provável de a ponte nascer.
 */
export function detectarImportsDePlataforma(fonte: string): string[] {
  const achados: string[] = []
  const padrao = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g
  for (const m of fonte.matchAll(padrao)) {
    const alvo = m[1] as string
    for (const proibido of MODULOS_PROIBIDOS) {
      if (alvo.includes(proibido)) achados.push(proibido)
    }
  }
  return achados
}

/** Mesmas exclusões de `platform-query-scan.test.ts`, e pela mesma razão. */
function arquivosVarridos(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const alvo = path.join(dir, entrada.name)
    if (entrada.isDirectory()) {
      if (entrada.name === "__tests__" || entrada.name === "__fixtures__") continue
      arquivosVarridos(alvo, acc)
      continue
    }
    if (!/\.tsx?$/.test(entrada.name)) continue
    if (/\.test\.tsx?$/.test(entrada.name)) continue
    acc.push(alvo)
  }
  return acc
}

describe("AC9 — o detector (controles positivos)", () => {
  it("acende para import estático do guard", () => {
    const fonte = 'import { requirePlatformAdmin } from "@web/lib/tenancy/platform-guard"'
    expect(detectarImportsDePlataforma(fonte)).toEqual(["lib/tenancy/platform-guard"])
  })

  it("acende para import do caminho de leitura de plataforma, em várias linhas", () => {
    const fonte = `import {
  platformQuery,
} from "@web/lib/tenancy/platform-query"`
    expect(detectarImportsDePlataforma(fonte)).toEqual(["lib/tenancy/platform-query"])
  })

  it("acende para `await import()` dinâmico — a forma que escaparia de um detector ingênuo", () => {
    const fonte = 'const m = await import("@web/lib/tenancy/platform-query")'
    expect(detectarImportsDePlataforma(fonte)).toEqual(["lib/tenancy/platform-query"])
  })

  it("acende para caminho RELATIVO, não só para o alias", () => {
    const fonte = 'import { platformQuery } from "../../lib/tenancy/platform-query"'
    expect(detectarImportsDePlataforma(fonte)).toEqual(["lib/tenancy/platform-query"])
  })

  it("NÃO acende para outros módulos de tenancy que o cliente PODE usar", () => {
    const fonte = 'import { trifoldOrgId } from "@web/lib/tenancy/trifold-org"'
    expect(detectarImportsDePlataforma(fonte)).toEqual([])
  })
})

describe("AC9 — a árvore real", () => {
  it("nenhum arquivo do lado do cliente importa `platform-guard`/`platform-query`", () => {
    const achados: Array<{ arquivo: string; modulos: string[] }> = []
    for (const dir of DIRETORIOS_DO_CLIENTE) {
      for (const arquivo of arquivosVarridos(dir)) {
        const modulos = detectarImportsDePlataforma(fs.readFileSync(arquivo, "utf8"))
        if (modulos.length > 0) {
          achados.push({ arquivo: path.relative(SRC, arquivo), modulos })
        }
      }
    }
    expect(achados).toEqual([])
  })

  it("a varredura olhou para os TRÊS diretórios, e nenhum deles está vazio", () => {
    // Vivacidade: sem isto, apagar um diretório (ou errar o caminho) produziria o mesmo `[]`
    // verde acima. Cada um é medido separadamente — a soma esconderia um zero.
    for (const dir of DIRETORIOS_DO_CLIENTE) {
      expect(arquivosVarridos(dir).length, `diretório ${path.relative(SRC, dir)}`).toBeGreaterThan(0)
    }
  })

  it("o componente compartilhado É de fato compartilhado — as DUAS superfícies o importam", () => {
    // Sem esta asserção, `components/integrations/**` poderia ficar limpo por estar morto, e a
    // varredura acima seria verde sobre um diretório que ninguém usa.
    const doCliente = fs.readFileSync(
      path.join(SRC, "app/dashboard/configuracoes/integracoes/page.tsx"),
      "utf8",
    )
    const daPlataforma = fs.readFileSync(
      path.join(SRC, "app/platform/orgs/[id]/integracoes/page.tsx"),
      "utf8",
    )
    expect(doCliente).toContain("components/integrations/integrations-panel")
    expect(daPlataforma).toContain("components/integrations/integrations-panel")
  })
})
