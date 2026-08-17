/**
 * Story 87-16 (AC6) — CATRACA: nenhum `*.test.ts` sem import de módulo do projeto.
 *
 * O CASO QUE A ORIGINOU, e ele é o mais puro desta casa
 *   o `loader.test.ts` do carregador do MemPalace (`packages/ai/src/memory/`,
 *   removido nesta mesma PR — sha a60a1bc6): 19 testes, UMA linha de import
 *   (`import { describe, it, expect } from "vitest"`) e NENHUM import do módulo
 *   que ele dizia testar. `detectRoom`, `estimateTokens` e `categorize` estavam
 *   REIMPLEMENTADOS dentro do arquivo de teste. O @po apagou `loader.ts` e os 19
 *   ficaram verdes; o @dev reproduziu (saída no Dev Agent Record da story).
 *
 * VARREDURA × CATRACA
 *   O @po varreu a suíte inteira e achou 1 de 190 (0,53 %) — o próprio
 *   `loader.test.ts`, que esta PR apaga. Uma varredura mede uma vez; a catraca
 *   mede para sempre, custa XS e cabe na mesma PR.
 *
 * DENOMINADOR DECLARADO
 *   antes desta PR: 1 de 190 · depois: 0 de N. O `N` é medido, não fixado: fixar
 *   o número faria a catraca falhar por motivo errado a cada teste novo.
 *
 * 🔴 A ARMADILHA QUE ESTA AC QUASE COMETEU CONTRA SI MESMA
 *   Se o scanner morasse dentro deste arquivo, ele não importaria módulo nenhum
 *   e **se auto-flagraria**. O remédio é o import abaixo — nunca uma
 *   auto-exceção na lista de ignore, que é a semente do próximo `loader.test.ts`.
 *   O mesmo remédio vale para a AC5 (`pipeline-sem-mempalace.test.ts`), que o @po
 *   mediu como flagrada quando escrita do jeito óbvio.
 */
import { describe, it, expect } from "vitest"
import {
  hasProjectImport,
  listTestFiles,
  moduleSpecifiers,
  parseVitestInclude,
  scanZeroImportTests,
  PROJECT_MODULE_PREFIXES,
} from "./source-scan"

describe("AC6 — catraca de zero-import", () => {
  it("🔴 nenhum arquivo de teste da suíte deixa de referenciar módulo do projeto", () => {
    const { populacao, semImport } = scanZeroImportTests()

    // A mensagem carrega o denominador: um vermelho sem denominador manda o
    // humano medir de novo o que a régua já sabia.
    expect(semImport, `${semImport.length} de ${populacao} sem import do projeto`).toEqual([])
    expect(populacao).toBeGreaterThan(100)
  })

  it("a população sai dos globs do `vitest.config.ts`, não de um `find` à mão", () => {
    // Foi assim que as duas primeiras varreduras erraram (41/190 e 3/190).
    const globs = parseVitestInclude(
      ['include: [', '  "packages/ai/src/**/*.test.ts",', '  "packages/web/src/**/*.test.ts",', ']'].join("\n")
    )
    expect(globs).toEqual(["packages/ai/src/**/*.test.ts", "packages/web/src/**/*.test.ts"])

    const arquivos = listTestFiles()
    expect(arquivos.length).toBeGreaterThan(100)
    expect(arquivos.every((f) => f.endsWith(".test.ts"))).toBe(true)
    // Este próprio arquivo tem de estar na população — régua que não se inclui
    // não mede a si mesma.
    expect(arquivos).toContain("packages/shared/src/testing/zero-import.test.ts")
  })
})

describe("AC6 — as quatro formas de referência, medidas uma a uma", () => {
  it("`import … from` MULTILINHA conta — é o que fez a 1ª varredura dar 41/190", () => {
    const src = ['import {', '  algo,', '  outro,', '} from "./modulo"'].join("\n")
    expect(hasProjectImport(src)).toBe(true)
  })

  it("alias `@web/` conta — é o que fez a 2ª varredura dar 3/190", () => {
    expect(hasProjectImport('import { x } from "@web/lib/x"')).toBe(true)
  })

  it("alias `@trifold/` conta", () => {
    expect(hasProjectImport('import { STAGE_IDS } from "@trifold/shared"')).toBe(true)
  })

  it("`import()` dinâmico conta", () => {
    expect(hasProjectImport('const m = await import("../flows/x")')).toBe(true)
  })

  it("`require()` conta", () => {
    expect(hasProjectImport('const m = require("./x")')).toBe(true)
  })

  it("`vi.mock()` conta — mockar módulo do projeto é referenciá-lo", () => {
    expect(hasProjectImport('vi.mock("../flows/x", () => ({}))')).toBe(true)
  })

  it("🔴 controle negativo — só `vitest` e pacotes externos NÃO contam", () => {
    const src = [
      'import { describe, it, expect } from "vitest"',
      'import path from "node:path"',
      'import Anthropic from "@anthropic-ai/sdk"',
    ].join("\n")
    // É exatamente a forma do `loader.test.ts`: importa o executor e mais nada.
    expect(hasProjectImport(src)).toBe(false)
  })

  it("os especificadores são extraídos crus, sem filtro — o filtro é o prefixo", () => {
    const src = 'import a from "vitest"\nimport b from "./x"'
    expect(moduleSpecifiers(src)).toEqual(["vitest", "./x"])
    expect(PROJECT_MODULE_PREFIXES).toContain("./")
  })

  it("🔴 a sonda do controle positivo, reproduzida em memória", () => {
    // A sonda que foi ao disco (saída colada no Dev Agent Record) é um
    // `.test.ts` com um `it(...)` que PASSA e nenhum import do projeto. O
    // `it(...)` é obrigatório: sem ele o vitest falha com "No test suite found"
    // e o vermelho vem da pré-condição, não da catraca — controle positivo
    // engolido pela própria montagem.
    const sonda = [
      'import { it, expect } from "vitest"',
      'it("noop", () => expect(1).toBe(1))',
    ].join("\n")
    expect(hasProjectImport(sonda)).toBe(false)
  })
})
