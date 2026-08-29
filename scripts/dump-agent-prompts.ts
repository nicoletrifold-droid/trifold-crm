/**
 * Story 87-0 (Tarefa 1 · AC1/AC2/AC3) — snapshot + `--check` de `agent_prompts`.
 *
 * O QUE FAZ
 *   --write   lê `agent_prompts` de produção e regrava o snapshot versionado em
 *             packages/ai/src/prompts/_production/ (um .txt por slug + manifest.json)
 *   --check   lê o banco e compara com o snapshot commitado. Sai com código != 0 e
 *             nomeia o slug divergente. É este modo que a CI vai chamar (D5).
 *
 * O QUE NUNCA FAZ
 *   Escrever no banco. Só existe `.select()` aqui. Se algum dia aparecer um
 *   insert/update/upsert neste arquivo, é bug — o painel é a fonte da verdade
 *   (D-87-0-a) e o repositório é o espelho, não o contrário.
 *   (Pelo mesmo motivo: NÃO rode `scripts/seed-prompts.ts`, que faz upsert cego a
 *   partir das constantes do código e apagaria o trabalho de reconciliação. AC12.)
 *
 * NORMALIZAÇÃO
 *   Declarada e implementada em `packages/ai/src/prompts/snapshot.ts`
 *   (CRLF→LF, NFC, trim), aplicada aos DOIS lados da comparação. Ler o cabeçalho
 *   daquele arquivo antes de mudar qualquer coisa aqui.
 *
 * USO (na raiz do repo)
 *   npx tsx scripts/dump-agent-prompts.ts --write
 *   npx tsx scripts/dump-agent-prompts.ts --check
 *   npx tsx scripts/dump-agent-prompts.ts --check --verbose
 *
 * CREDENCIAIS
 *   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Se não estiverem no
 *   ambiente, o script lê `packages/web/.env.local` (produção). Em CI, vêm de secret.
 *
 * EXIT CODES
 *   0 = ok (snapshot escrito, ou check sem divergência)
 *   1 = divergência encontrada (`--check`)
 *   2 = erro de uso/configuração/rede
 */
import { createClient } from "@supabase/supabase-js"
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs"
import { resolverAmbiente } from "./lib/db-env"
import path from "node:path"
import {
  PROMPT_SNAPSHOT_ORG_ID,
  SNAPSHOT_RELATIVE_DIR,
  assertSafeSlug,
  findRepoRoot,
  getSnapshotDir,
  getSnapshotManifestPath,
  normalizePromptContent,
  sha256,
  snapshotFileName,
  type PromptSnapshotEntry,
  type PromptSnapshotManifest,
} from "../packages/ai/src/prompts/snapshot"

const EXIT_OK = 0
const EXIT_DIVERGED = 1
const EXIT_ERROR = 2

type Row = {
  slug: string
  name: string | null
  type: string | null
  content: string | null
  is_active: boolean
  updated_at: string | null
}

function usage(): never {
  console.error(
    [
      "Uso: npx tsx scripts/dump-agent-prompts.ts <--write|--check> [--verbose] [--org=<uuid>]",
      "",
      "  --write    regrava o snapshot em " + SNAPSHOT_RELATIVE_DIR,
      "  --check    compara banco x snapshot; exit != 0 na divergência",
      "  --verbose  imprime o diff por slug (primeira linha divergente)",
    ].join("\n")
  )
  process.exit(EXIT_ERROR)
}

/**
 * Carrega as duas credenciais do ambiente ou de packages/web/.env.local.
 * Parser mínimo de propósito: não vale uma dependência nova para ler 2 linhas, e
 * `dotenv` não está instalado na raiz deste monorepo.
 */
function loadCredentials(): { url: string; key: string } {
  // Story 900-3b (AC3): substitui o parser ad hoc de `packages/web/.env.local` (arquivo
  // renomeado). `escreve: false` — este script LÊ do banco e escreve apenas ARQUIVOS.
  const alvo = resolverAmbiente({ escreve: false })
  const url = alvo.url
  const key = alvo.serviceRoleKey

  if (!key) {
    console.error(
      `❌ Falta SUPABASE_SERVICE_ROLE_KEY para o ambiente "${alvo.ambiente}".\n` +
        "   Defina no ambiente ou em .env.teste/.env.producao."
    )
    process.exit(EXIT_ERROR)
  }
  return { url, key }
}

async function fetchRows(orgId: string): Promise<Row[]> {
  const { url, key } = loadCredentials()
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // SOMENTE LEITURA. Ativas e inativas — uma linha inativa é achado, não invisibilidade.
  const { data, error } = await supabase
    .from("agent_prompts")
    .select("slug, name, type, content, is_active, updated_at")
    .eq("org_id", orgId)
    .order("slug", { ascending: true })

  if (error) {
    console.error(`❌ Erro lendo agent_prompts: ${error.message}`)
    process.exit(EXIT_ERROR)
  }
  const rows = (data ?? []) as Row[]
  if (rows.length === 0) {
    console.error(`❌ Nenhuma linha de agent_prompts para a org ${orgId}. Abortando sem escrever.`)
    process.exit(EXIT_ERROR)
  }
  for (const row of rows) assertSafeSlug(row.slug)
  return rows
}

function toEntry(row: Row, orgId: string, capturedAt: string): PromptSnapshotEntry {
  const raw = row.content ?? ""
  const normalized = normalizePromptContent(raw)
  return {
    slug: row.slug,
    name: row.name,
    type: row.type,
    is_active: row.is_active,
    updated_at: row.updated_at,
    char_count: normalized.length,
    sha256: sha256(normalized),
    raw_char_count: raw.length,
    raw_sha256: sha256(raw),
    file: snapshotFileName(row.slug),
    org_id: orgId,
    captured_at: capturedAt,
  }
}

async function write(orgId: string): Promise<number> {
  const rows = await fetchRows(orgId)
  const capturedAt = new Date().toISOString()
  const host = new URL(loadCredentials().url).host
  const dir = getSnapshotDir()
  mkdirSync(dir, { recursive: true })

  const entries: PromptSnapshotEntry[] = []
  for (const row of rows) {
    const entry = toEntry(row, orgId, capturedAt)
    // Bytes exatos, sem newline final: assim `shasum -a 256 {slug}.txt` bate com o manifest (AC1).
    writeFileSync(path.join(dir, entry.file), normalizePromptContent(row.content ?? ""), "utf8")
    entries.push(entry)
    console.log(
      `  ✅ ${entry.slug.padEnd(24)} ${String(entry.char_count).padStart(6)} chars` +
        `${entry.is_active ? "" : "   ⚠️ INATIVO"}` +
        `${entry.raw_char_count !== entry.char_count ? `   (cru: ${entry.raw_char_count})` : ""}`
    )
  }

  // Arquivo órfão (slug deletado do banco) some do snapshot — senão o `--check` mente por omissão.
  const known = new Set(entries.map((e) => e.file))
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".txt"))) {
    if (!known.has(file)) {
      unlinkSync(path.join(dir, file))
      console.log(`  🗑️  ${file} removido (slug não existe mais no banco)`)
    }
  }

  const manifest: PromptSnapshotManifest = {
    story: "87-0",
    captured_at: capturedAt,
    org_id: orgId,
    source: {
      table: "agent_prompts",
      supabase_url_host: host,
      restore_note:
        "Este snapshot É o backup (critério de rollback da story 87-0). Restaurar = escrever estes content de volta em agent_prompts por Management API.",
    },
    normalization: { crlf_to_lf: true, unicode: "NFC", trim: true },
    prompts: entries,
  }
  writeFileSync(getSnapshotManifestPath(), JSON.stringify(manifest, null, 2) + "\n", "utf8")

  console.log(`\n📸 Snapshot escrito: ${SNAPSHOT_RELATIVE_DIR} (${entries.length} slugs)`)
  return EXIT_OK
}

function firstDifference(a: string, b: string): string {
  const aLines = a.split("\n")
  const bLines = b.split("\n")
  const max = Math.max(aLines.length, bLines.length)
  for (let i = 0; i < max; i++) {
    if (aLines[i] !== bLines[i]) {
      return [
        `      linha ${i + 1}:`,
        `        snapshot: ${JSON.stringify(aLines[i] ?? "<ausente>")}`,
        `        banco:    ${JSON.stringify(bLines[i] ?? "<ausente>")}`,
      ].join("\n")
    }
  }
  return "      (diferença fora das linhas — provável whitespace no fim)"
}

async function check(orgId: string, verbose: boolean): Promise<number> {
  const dir = getSnapshotDir()
  const manifestPath = getSnapshotManifestPath()
  if (!existsSync(manifestPath)) {
    console.error(
      `❌ Snapshot ausente (${manifestPath}). Rode --write e commite antes de usar --check.`
    )
    return EXIT_ERROR
  }

  const rows = await fetchRows(orgId)
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as PromptSnapshotManifest
  const problems: string[] = []

  if (manifest.org_id !== orgId) {
    problems.push(`manifest.org_id=${manifest.org_id} != org consultada ${orgId}`)
  }

  const snapshotSlugs = new Set(
    readdirSync(dir)
      .filter((f) => f.endsWith(".txt"))
      .map((f) => f.slice(0, -".txt".length))
  )

  for (const row of rows) {
    const dbContent = normalizePromptContent(row.content ?? "")
    const file = path.join(dir, snapshotFileName(row.slug))

    if (!snapshotSlugs.has(row.slug)) {
      problems.push(`${row.slug}: existe no banco e NÃO existe no snapshot`)
      continue
    }
    snapshotSlugs.delete(row.slug)

    const snapContent = normalizePromptContent(readFileSync(file, "utf8"))
    if (snapContent !== dbContent) {
      problems.push(
        `${row.slug}: conteúdo divergente ` +
          `(snapshot ${snapContent.length} chars / sha ${sha256(snapContent).slice(0, 12)} · ` +
          `banco ${dbContent.length} chars / sha ${sha256(dbContent).slice(0, 12)})` +
          (verbose ? `\n${firstDifference(snapContent, dbContent)}` : "")
      )
    }

    const entry = manifest.prompts.find((p) => p.slug === row.slug)
    if (!entry) {
      problems.push(`${row.slug}: arquivo existe mas está fora do manifest.json`)
    } else {
      if (entry.sha256 !== sha256(snapContent)) {
        problems.push(`${row.slug}: manifest.sha256 não bate com o arquivo do snapshot`)
      }
      // is_active MUDA o runtime (loadAgentConfig filtra is_active=true) → é divergência.
      // updated_at NÃO é divergência: save sem mudança de conteúdo não pode ficar vermelho,
      // senão o check vira ruído e todo mundo aprende a ignorá-lo.
      if (entry.is_active !== row.is_active) {
        problems.push(
          `${row.slug}: is_active divergente (snapshot ${entry.is_active} · banco ${row.is_active})`
        )
      }
    }
  }

  for (const orphan of snapshotSlugs) {
    problems.push(`${orphan}: existe no snapshot e NÃO existe no banco`)
  }

  if (problems.length > 0) {
    console.error(`❌ agent_prompts DIVERGE do snapshot (${problems.length} problema(s)):\n`)
    for (const p of problems) console.error(`   • ${p}`)
    console.error(
      "\n   O painel admin é a fonte da verdade (D-87-0-a). Se a mudança no banco é\n" +
        "   legítima, rode --write e commite o snapshot no mesmo PR."
    )
    return EXIT_DIVERGED
  }

  console.log(`✅ agent_prompts == snapshot (${rows.length} slugs, org ${orgId})`)
  return EXIT_OK
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const doWrite = args.includes("--write")
  const doCheck = args.includes("--check")
  const verbose = args.includes("--verbose")
  const orgArg = args.find((a) => a.startsWith("--org="))
  const orgId = orgArg ? orgArg.slice("--org=".length) : PROMPT_SNAPSHOT_ORG_ID

  if (doWrite === doCheck) usage() // nenhum ou os dois → uso inválido, e nunca escreve por acidente

  process.exit(doWrite ? await write(orgId) : await check(orgId, verbose))
}

main().catch((error: unknown) => {
  console.error(`❌ ${error instanceof Error ? error.message : String(error)}`)
  process.exit(EXIT_ERROR)
})
