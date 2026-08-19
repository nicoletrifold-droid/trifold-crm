import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

/**
 * Story 75-350 — NENHUMA string de modelo literal fora de `client/anthropic.ts`.
 *
 * Este teste existe porque a mesma classe de defeito nos morde pela TERCEIRA vez:
 *
 *  1. **82-1** — `/api/leads/[id]/summary` chamava `claude-haiku-4-20250414`. A
 *     story centralizou as strings em `ANTHROPIC_MODELS` e consertou /summary e o
 *     cron `enrich-leads`.
 *  2. **75-349** — mas deixou `/api/leads/[id]/handoff` para trás, com a MESMA
 *     string morta. Toda chamada daquela rota falhava na API e o `catch` engolia.
 *  3. **75-350** — `post-visit-followup` usava `claude-3-5-haiku-latest`. O alias
 *     resolvia para um modelo descontinuado, começou a devolver 404, e o cron de
 *     follow-up parou de concluir por quatro semanas sem um único erro logado.
 *
 * Três ocorrências não são azar, são um padrão: string de modelo espalhada pelo
 * código não tem quem a revise quando a Anthropic aposenta um ID. A constante
 * compartilhada tem — é um arquivo só, e é este teste que obriga a passar por ele.
 *
 * 🔥 ALIAS É PROIBIDO junto: `-latest` muda debaixo do deploy, sem PR e sem teste
 * que acenda. Um modelo se pina por ID completo.
 */

const RAIZ = join(__dirname, "..", "..", "..", "..")
const PACOTES = ["packages/ai/src", "packages/web/src", "packages/shared/src", "packages/bot/src"]

/** O único arquivo onde um ID de modelo pode aparecer escrito. */
const FONTE_DA_VERDADE = "packages/ai/src/client/anthropic.ts"

/** Modelo escrito à mão: `"claude-..."` em qualquer forma. */
const STRING_DE_MODELO = /["'`]claude-[a-z0-9][a-z0-9.\-]*["'`]/g

function arquivosDeCodigo(dir: string): string[] {
  let encontrados: string[] = []
  let entradas: string[]
  try {
    entradas = readdirSync(dir)
  } catch {
    return []
  }
  for (const entrada of entradas) {
    const caminho = join(dir, entrada)
    if (statSync(caminho).isDirectory()) {
      if (entrada === "node_modules" || entrada === ".next") continue
      encontrados = encontrados.concat(arquivosDeCodigo(caminho))
    } else if (/\.(ts|tsx)$/.test(entrada)) {
      encontrados.push(caminho)
    }
  }
  return encontrados
}

describe("75-350 — contrato: IDs de modelo só na constante compartilhada", () => {
  const arquivos = PACOTES.flatMap((p) => arquivosDeCodigo(join(RAIZ, p)))

  it("encontrou código para varrer (a varredura não pode passar vazia)", () => {
    // Sem esta asserção, um `RAIZ` errado deixaria o contrato verde varrendo NADA.
    expect(arquivos.length).toBeGreaterThan(200)
  })

  it("nenhum ID de modelo literal fora de ANTHROPIC_MODELS", () => {
    const infratores: string[] = []

    for (const arquivo of arquivos) {
      const rel = relative(RAIZ, arquivo).split("\\").join("/")
      if (rel === FONTE_DA_VERDADE) continue
      // Testes podem citar IDs: é o objeto da asserção deles (ex.: supportsSampling).
      if (/\.(test|spec)\.tsx?$/.test(rel)) continue

      const conteudo = readFileSync(arquivo, "utf-8")
      for (const linha of conteudo.split("\n")) {
        // Comentário que conta a história de um modelo morto é documentação, não uso.
        const semComentario = linha.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "")
        const achados = semComentario.match(STRING_DE_MODELO)
        if (achados) infratores.push(`${rel}: ${achados.join(", ")}`)
      }
    }

    expect(
      infratores,
      `Use ANTHROPIC_MODELS (packages/ai/src/client/anthropic.ts) em vez de escrever o ID:\n${infratores.join("\n")}`
    ).toEqual([])
  })

  it("🔥 nenhum alias `-latest` em lugar nenhum", () => {
    const comAlias: string[] = []
    for (const arquivo of arquivos) {
      const rel = relative(RAIZ, arquivo).split("\\").join("/")
      // Mesma exceção do caso acima: teste cita o alias porque ele É o objeto da
      // asserção — este arquivo, inclusive.
      if (/\.(test|spec)\.tsx?$/.test(rel)) continue
      const conteudo = readFileSync(arquivo, "utf-8")
      for (const linha of conteudo.split("\n")) {
        const semComentario = linha.replace(/\/\/.*$/, "")
        if (/["'`]claude-[a-z0-9.\-]*-latest["'`]/.test(semComentario)) comAlias.push(rel)
      }
    }
    expect(
      comAlias,
      `Alias -latest muda sob o deploy sem aviso (foi o defeito da 75-350). Pine o ID:\n${comAlias.join("\n")}`
    ).toEqual([])
  })
})
