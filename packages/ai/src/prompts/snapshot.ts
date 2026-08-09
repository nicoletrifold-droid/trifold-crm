/**
 * Story 87-0 (Tarefa 1) — snapshot versionado dos prompts que rodam em PRODUÇÃO.
 *
 * POR QUE EXISTE
 * --------------
 * `agent_prompts` (banco) mascara as constantes de `packages/ai/src/prompts/*.ts` via
 * `overrides?.[slug] || CONSTANTE` (`prompts/index.ts:84-88`, alimentado por
 * `loadAgentConfig` em `chat/pipeline.ts`). Enquanto existir linha ativa com conteúdo,
 * a constante do código NUNCA é usada — e o repositório deixa de descrever o que roda.
 * Um fork editado à mão no slug `visit-scheduling` custou um incidente com leads pagos.
 *
 * Decisão D-87-0-a (Gabriel, 05/08/2026): **o painel admin é a fonte da verdade**; o
 * código vira fallback de bootstrap. Consequência: o repositório precisa de uma cópia
 * versionada do que está no banco, senão não existe diff revisável nem backup.
 *
 * Este módulo é a parte compartilhada entre o dumper (`scripts/dump-agent-prompts.ts`)
 * e os testes de conteúdo (`prompts/*.test.ts`): o normalizador, os caminhos e o
 * leitor do snapshot. Ele NÃO faz parte do runtime da Nicole e NÃO é reexportado por
 * `prompts/index.ts` — usa `node:fs`, e entrar no barrel arrastaria isso para o bundle.
 *
 * NORMALIZAÇÃO DECLARADA (aplicada aos DOIS lados de qualquer comparação)
 * ----------------------------------------------------------------------
 *   1. `\r\n` e `\r` → `\n`   (o `property-presentation` de produção tem CRLF)
 *   2. Unicode → NFC          (acento composto × pré-composto conta como diferença de bytes)
 *   3. `trim()`               (espaço/quebra no início e no fim)
 *
 * O motivo de declarar em vez de comparar bytes crus: o `guardrails` difere hoje por
 * ~1 caractere (emoji/acento) apesar de estar em paridade semântica, e o
 * `property-presentation` difere por CRLF. Sem normalização, o `--check` nasce vermelho
 * por ruído permanente — e todo mundo aprende a ignorá-lo, que é exatamente o modo de
 * falha que esta story combate. Nada além destes 3 passos é normalizado: whitespace
 * interno, maiúsculas e pontuação são diferença de verdade.
 */
import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"

/** Única org com conversas hoje. O projeto vai para multi-tenant (Epic 86) — um snapshot sem org vira armadilha. */
export const PROMPT_SNAPSHOT_ORG_ID = "00000000-0000-0000-0000-000000000001"

/** Caminho do snapshot, relativo à raiz do repo. */
export const SNAPSHOT_RELATIVE_DIR = "packages/ai/src/prompts/_production"

export const SNAPSHOT_MANIFEST_FILENAME = "manifest.json"

/**
 * Normalização declarada. Aplicada ao conteúdo vindo do banco E ao conteúdo lido do
 * arquivo, sempre nos dois lados — comparar um lado normalizado com outro cru é como
 * não normalizar.
 */
export function normalizePromptContent(raw: string): string {
  return raw.replace(/\r\n?/g, "\n").normalize("NFC").trim()
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex")
}

/** Entrada do manifest — uma por linha de `agent_prompts` (ativas E inativas). */
export type PromptSnapshotEntry = {
  slug: string
  name: string | null
  type: string | null
  is_active: boolean
  updated_at: string | null
  /** Tamanho do conteúdo NORMALIZADO (o que está no .txt). */
  char_count: number
  /** sha256 do conteúdo NORMALIZADO — bate com `shasum -a 256 {slug}.txt`. */
  sha256: string
  /** Tamanho do conteúdo CRU no banco, antes da normalização (auditoria). */
  raw_char_count: number
  /** sha256 do conteúdo CRU no banco (auditoria: prova o que a normalização mexeu). */
  raw_sha256: string
  file: string
  org_id: string
  captured_at: string
}

export type PromptSnapshotManifest = {
  story: string
  captured_at: string
  org_id: string
  source: {
    table: string
    supabase_url_host: string
    /** O snapshot é o backup: restaurar = escrever estes `content` de volta. */
    restore_note: string
  }
  normalization: {
    crlf_to_lf: boolean
    unicode: "NFC"
    trim: boolean
  }
  prompts: PromptSnapshotEntry[]
}

let cachedRepoRoot: string | null = null

/**
 * Acha a raiz do repo subindo a partir do cwd. Evita `__dirname`/`import.meta.url`,
 * que se comportam diferente entre tsx (CJS) e vitest (ESM) — já custou tempo em
 * outros scripts deste repo.
 */
export function findRepoRoot(start: string = process.cwd()): string {
  if (cachedRepoRoot) return cachedRepoRoot
  const marker = path.join("packages", "ai", "src", "prompts", "index.ts")
  let dir = path.resolve(start)
  for (;;) {
    if (existsSync(path.join(dir, marker))) {
      cachedRepoRoot = dir
      return dir
    }
    const parent = path.dirname(dir)
    if (parent === dir) {
      throw new Error(
        `Nao encontrei a raiz do repo subindo a partir de "${start}" (procurando por ${SNAPSHOT_RELATIVE_DIR}).`
      )
    }
    dir = parent
  }
}

export function getSnapshotDir(): string {
  return path.join(findRepoRoot(), SNAPSHOT_RELATIVE_DIR)
}

export function getSnapshotManifestPath(): string {
  return path.join(getSnapshotDir(), SNAPSHOT_MANIFEST_FILENAME)
}

export function snapshotFileName(slug: string): string {
  return `${slug}.txt`
}

/**
 * Slug vira nome de arquivo — então precisa ser inofensivo. Rejeita qualquer coisa
 * fora de kebab-case (inclusive `..` e `/`).
 */
export function assertSafeSlug(slug: string): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(`Slug inseguro para virar nome de arquivo: ${JSON.stringify(slug)}`)
  }
}

export function readSnapshotManifest(): PromptSnapshotManifest {
  const manifestPath = getSnapshotManifestPath()
  if (!existsSync(manifestPath)) {
    throw new Error(
      `Snapshot ausente: ${manifestPath}. Rode 'npx tsx scripts/dump-agent-prompts.ts --write'.`
    )
  }
  return JSON.parse(readFileSync(manifestPath, "utf8")) as PromptSnapshotManifest
}

/** Conteúdo normalizado de um slug do snapshot. */
export function readSnapshotContent(slug: string): string {
  assertSafeSlug(slug)
  const file = path.join(getSnapshotDir(), snapshotFileName(slug))
  if (!existsSync(file)) {
    throw new Error(`Snapshot ausente para o slug "${slug}": ${file}`)
  }
  return normalizePromptContent(readFileSync(file, "utf8"))
}

/** Todos os slugs do snapshot, lidos do diretório (não do manifest) — pega arquivo órfão. */
export function listSnapshotSlugs(): string[] {
  const dir = getSnapshotDir()
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith(".txt"))
    .map((f) => f.slice(0, -".txt".length))
    .sort()
}

/** `{ slug: conteúdo normalizado }` para todo o snapshot. */
export function loadProductionSnapshot(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const slug of listSnapshotSlugs()) {
    out[slug] = readSnapshotContent(slug)
  }
  return out
}
