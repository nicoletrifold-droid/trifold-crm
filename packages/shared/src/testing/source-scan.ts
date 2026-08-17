/**
 * Story 87-16 (AC5 · AC6) — leitura e varredura do FONTE do repositório.
 *
 * POR QUE ISTO É UM MÓDULO, E NÃO CÓDIGO DENTRO DE UM `.test.ts`
 *   A AC6 instala uma catraca: nenhum `*.test.ts` pode existir sem importar
 *   módulo do projeto. O caso que a originou é o `loader.test.ts` do MemPalace —
 *   19 testes, ZERO imports, três funções REIMPLEMENTADAS dentro do arquivo de
 *   teste. O @po apagou o módulo e os 19 testes ficaram verdes.
 *
 *   Um scanner que morasse dentro do próprio `.test.ts` não importaria módulo
 *   nenhum e **se auto-flagraria** — e a "solução" seria pôr o arquivo numa
 *   lista de ignore, que é a semente do próximo `loader.test.ts`. O mesmo vale
 *   para a AC5, cuja implementação óbvia (`readFileSync` do fonte) também não
 *   importa nada. Por isso os dois leitores moram AQUI e os testes os importam.
 *   Remédio por REGRA, nunca por auto-exceção.
 *
 * POPULAÇÃO — derivada dos globs do `vitest.config.ts`, não de um `find` à mão
 *   As duas primeiras varreduras do @po deram 41/190 e 3/190, erradas por
 *   `import` multilinha e pelo alias `@web/`. O número só assentou quando a
 *   população passou a sair da MESMA fonte que o executor usa. É por isso que
 *   `listTestFiles()` lê o `include` do `vitest.config.ts` em vez de adivinhar.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"

/**
 * Raiz do repositório (o diretório com `pnpm-workspace.yaml`).
 *
 * Mesmo padrão do `findRepoRoot` de `packages/ai/src/prompts/snapshot.ts` —
 * reescrito aqui e não importado porque `@trifold/shared` NÃO pode depender de
 * `@trifold/ai` (a seta é a contrária). Cinco linhas duplicadas custam menos que
 * um ciclo de pacotes.
 */
export function findRepoRoot(from: string = __dirname): string {
  let dir = from
  for (let i = 0; i < 12; i++) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error(`Raiz do repositório não encontrada a partir de ${from}`)
}

/** Lê um arquivo do repositório por caminho RELATIVO à raiz. */
export function readRepoFile(relativePath: string): string {
  const full = path.join(findRepoRoot(), relativePath)
  if (!existsSync(full)) {
    // Arquivo que sumiu NÃO pode virar "nada encontrado, tudo certo": é
    // exatamente o modo de falha que a 87-16 enterra.
    throw new Error(`Arquivo inexistente: ${relativePath}`)
  }
  return readFileSync(full, "utf8")
}

/** Extrai os globs do `include` do `vitest.config.ts`. */
export function parseVitestInclude(configSource: string): string[] {
  const bloco = /include\s*:\s*\[([\s\S]*?)\]/.exec(configSource)
  if (!bloco) throw new Error("`include` não encontrado no vitest.config.ts")
  const globs = [...bloco[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1])
  if (globs.length === 0) throw new Error("`include` do vitest.config.ts está vazio")
  return globs
}

/** Glob simples (`**` e `*`) → regex. Só as formas que o `include` usa. */
function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .split("/")
    .map((segmento) => {
      if (segmento === "**") return "(?:.+)?"
      return segmento
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, "[^/]*")
    })
    .join("/")
    // `a/(?:.+)?/b` tem de casar também com `a/b`
    .replace(/\/\(\?:\.\+\)\?\//g, "/(?:.+/)?")
  return new RegExp(`^${escaped}$`)
}

const DIRETORIOS_IGNORADOS = new Set(["node_modules", ".git", "dist", ".next", ".aios-core"])

function walk(dir: string, root: string, out: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    if (DIRETORIOS_IGNORADOS.has(entry)) continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, root, out)
    else out.push(path.relative(root, full).split(path.sep).join("/"))
  }
  return out
}

/**
 * Os arquivos de teste da suíte, na MESMA população que o `vitest run` usa.
 * Devolve caminhos relativos à raiz, com `/`, ordenados.
 */
export function listTestFiles(): string[] {
  const root = findRepoRoot()
  const globs = parseVitestInclude(readFileSync(path.join(root, "vitest.config.ts"), "utf8"))
  const regexes = globs.map(globToRegExp)

  // Só varre as raízes que os globs mencionam — o resto do monorepo não entra.
  const raizes = new Set(
    globs.map((g) => g.split("/").filter((s) => !s.includes("*")).join("/")).filter(Boolean)
  )

  const arquivos: string[] = []
  for (const raiz of raizes) {
    const dir = path.join(root, raiz)
    if (existsSync(dir)) walk(dir, root, arquivos)
  }
  return [...new Set(arquivos.filter((f) => regexes.some((re) => re.test(f))))].sort()
}

/** Prefixos que caracterizam módulo DO PROJETO (relativo ou alias de workspace). */
export const PROJECT_MODULE_PREFIXES: readonly string[] = ["./", "../", "@web/", "@trifold/"]

/**
 * Todos os especificadores de módulo de um arquivo.
 *
 * As quatro formas são medidas, não decorativas: `import … from` (inclusive
 * MULTILINHA — foi o que fez a primeira varredura do @po dar 41/190), `import()`
 * dinâmico, `require(...)` e `vi.mock(...)`.
 */
export function moduleSpecifiers(source: string): string[] {
  const padroes = [
    /\bfrom\s*["'`]([^"'`]+)["'`]/g,
    /\bimport\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
    /\brequire\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
    /\bvi\s*\.\s*mock\s*\(\s*["'`]([^"'`]+)["'`]/g,
  ]
  const out: string[] = []
  for (const re of padroes) for (const m of source.matchAll(re)) out.push(m[1])
  return out
}

/** O arquivo referencia ao menos um módulo do próprio projeto? */
export function hasProjectImport(source: string): boolean {
  return moduleSpecifiers(source).some((spec) =>
    PROJECT_MODULE_PREFIXES.some((prefixo) => spec.startsWith(prefixo))
  )
}

export interface ZeroImportScan {
  /** Denominador — quantos `*.test.ts` a suíte tem. */
  populacao: number
  /** Os que não referenciam módulo nenhum do projeto. */
  semImport: string[]
}

/**
 * A catraca da AC6. Denominador declarado: 190 de 190 com import quando a
 * story 87-16 foi escrita (o único zero-import era o `loader.test.ts`, que esta
 * mesma PR apaga).
 */
export function scanZeroImportTests(): ZeroImportScan {
  const root = findRepoRoot()
  const arquivos = listTestFiles()
  if (arquivos.length === 0) {
    // População vazia é régua quebrada, não suíte perfeita.
    throw new Error("Nenhum arquivo de teste encontrado — a régua da AC6 está quebrada")
  }
  const semImport = arquivos.filter(
    (f) => !hasProjectImport(readFileSync(path.join(root, f), "utf8"))
  )
  return { populacao: arquivos.length, semImport }
}
