/**
 * Story 87-16 (AC9 · T11) — afirma que TODO objeto de banco consultado pelo
 * código existe em produção, e que o `service_role` o enxerga.
 *
 * POR QUE ISTO EXISTE
 *   O MemPalace rodou quatro meses consultando `lead_facts`, `lead_memories` e
 *   `match_lead_memory` com `to_regclass` = `null`, e a suíte ficou verde o
 *   tempo todo — porque `supabase-js` NÃO lança em erro de PostgREST: resolve
 *   com `{ data: null, error }`. A story 87-16 enterra as três instâncias; este
 *   script enterra a CLASSE.
 *
 * USO (na raiz do repo)
 *   npx tsx scripts/check-db-objects.ts            # ou: npm run db:objects:check
 *   npx tsx scripts/check-db-objects.ts --verbose  # lista os 140 alvos
 *
 * EXIT CODES — e a proibição é literal
 *   0 = todos os objetos existem e têm privilégio
 *   1 = pelo menos um ausente (ou sem privilégio). Nomeia cada um com TODOS os
 *       seus `arquivo:linha` — o `grep` que o humano faria a seguir já vem pronto
 *   2 = erro de credencial, rede, consulta OU lista de alvos vazia
 *   ⛔ NUNCA `exit 0` por erro, resposta vazia ou lista vazia. Tratar falha de
 *   consulta como "nada faltando" é EXATAMENTE o defeito que esta story enterra
 *   (`if (error) return ""`). Extrator que não achou nada está quebrado — não é
 *   banco perfeito.
 *
 * O QUE ELE NUNCA FAZ
 *   Escrever. Só `SELECT` sobre catálogo (`pg_class`, `pg_proc`). Um
 *   INSERT/UPDATE/DDL neste arquivo é bug — mesma regra do cabeçalho do
 *   `dump-agent-prompts.ts`.
 *
 * ⚠️ TRÊS PONTOS CEGOS DECLARADOS (AC9-F · item 4)
 *   Uma régua que finge cobertura total é a próxima crença que alguém acredita
 *   existir. Esta NÃO cobre:
 *
 *   1. STORAGE. Os buckets (`nicole-media`, `obra-fotos`, `pastas`, …) moram em
 *      `storage.buckets`, outro catálogo e outro mecanismo. Ficam fora da
 *      população por decisão escrita — a exclusão é por DONO da chamada
 *      (`storage.from(...)`), em `NON_DATABASE_FROM_OWNERS`.
 *   2. EXPOSIÇÃO DO PostgREST (`db-schemas`). Afirmamos catálogo + privilégio.
 *      Um objeto que existe, tem grant e não está no schema exposto passa VERDE
 *      aqui e quebra em runtime.
 *   3. `.from(variável)` / `.rpc(variável)`. Não é resolvível estaticamente. Os
 *      dois sítios de PRODUÇÃO hoje são:
 *        packages/web/src/lib/api-utils.ts:35        supabase.from(tableName)  ← softDelete()
 *        packages/web/src/app/dashboard/fvs/page.tsx:20  admin.from(table)
 *      Custo medido hoje: 0 de 140 — os 7 nomes que passam por ali já entram na
 *      lista por outro sítio literal, conferido nome a nome.
 *
 * POPULAÇÃO VARRIDA — é REGRA, não auto-exceção
 *   Só código de PRODUÇÃO: `packages/{ai,web,shared}/src/**\/*.{ts,tsx}` menos
 *   `*.test.ts(x)`, `__fixtures__/` e `__mocks__/`. Motivo medido: a fixture da
 *   mutação M1 é, por construção, um nome que o extrator TEM de colher e que a
 *   produção TEM de não ter ⇒ `EXIT=1` permanente sobre um objeto que ninguém
 *   consulta. Pôr o arquivo de teste numa lista de ignore seria a auto-exceção
 *   que a story proíbe duas vezes (Armadilha 3, Risco 8). Custo medido da regra:
 *   1.163 → 972 arquivos, e os alvos continuam os mesmos.
 *
 * CREDENCIAIS
 *   SUPABASE_ACCESS_TOKEN (ou `~/.supabase/access-token`, do `supabase login`)
 *   + SUPABASE_PROJECT_REF (ou derivado de NEXT_PUBLIC_SUPABASE_URL em
 *   `packages/web/.env.local`). É PAT de Management API porque a afirmação é
 *   sobre CATÁLOGO — `supabase-js` não alcança `pg_class`.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import {
  collectReferencedObjects,
  type ReferencedObject,
  type SkippedReference,
} from "../packages/shared/src/db/referenced-objects"

const EXIT_OK = 0
const EXIT_AUSENTE = 1
const EXIT_ERRO = 2

/** Raízes varridas. Mexer aqui muda o denominador — declare no gate se mexer. */
const SOURCE_ROOTS = ["packages/ai/src", "packages/web/src", "packages/shared/src"]

const MANAGEMENT_API = "https://api.supabase.com/v1/projects"

interface CatalogRow {
  nome: string
  tipo: "relation" | "rpc"
  existe: boolean
  privilegio: boolean
}

function repoRoot(): string {
  let dir = __dirname
  for (let i = 0; i < 10; i++) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir
    dir = path.dirname(dir)
  }
  console.error("❌ Não achei a raiz do repositório (pnpm-workspace.yaml).")
  process.exit(EXIT_ERRO)
}

function isExcluded(file: string): boolean {
  return (
    /\.test\.tsx?$/.test(file) ||
    file.includes(`${path.sep}__fixtures__${path.sep}`) ||
    file.includes(`${path.sep}__mocks__${path.sep}`)
  )
}

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(full) && !isExcluded(full)) out.push(full)
  }
  return out
}

function loadCredentials(root: string): { token: string; projectRef: string } {
  let token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) {
    const tokenPath = path.join(process.env.HOME ?? "", ".supabase", "access-token")
    if (existsSync(tokenPath)) {
      const raw = readFileSync(tokenPath, "utf8").trim()
      if (raw.startsWith("{")) {
        try {
          token = JSON.parse(raw).access_token
        } catch {
          console.error(`❌ ${tokenPath} não é JSON válido.`)
          process.exit(EXIT_ERRO)
        }
      } else {
        token = raw
      }
    }
  }

  let projectRef = process.env.SUPABASE_PROJECT_REF
  if (!projectRef) {
    const envPath = path.join(root, "packages", "web", ".env.local")
    if (existsSync(envPath)) {
      for (const line of readFileSync(envPath, "utf8").split("\n")) {
        const match = /^\s*NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.*)$/.exec(line)
        if (!match) continue
        const url = match[1].trim().replace(/^["']|["']$/g, "")
        const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(url)
        if (ref) projectRef = ref[1]
      }
    }
  }

  if (!token || !projectRef) {
    console.error(
      [
        "❌ Faltam credenciais para afirmar contra produção.",
        "   SUPABASE_ACCESS_TOKEN (ou ~/.supabase/access-token, via `supabase login`)",
        "   SUPABASE_PROJECT_REF  (ou NEXT_PUBLIC_SUPABASE_URL em packages/web/.env.local)",
      ].join("\n")
    )
    process.exit(EXIT_ERRO)
  }
  return { token, projectRef }
}

/** Identificador seguro para ir dentro de um literal SQL. Paranoia barata. */
function assertSafeName(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    console.error(`❌ Nome de objeto fora do formato esperado, abortando: ${JSON.stringify(name)}`)
    process.exit(EXIT_ERRO)
  }
  return name
}

/**
 * UMA consulta somente-leitura sobre o catálogo.
 *
 * 🔴 `to_regclass`/`pg_class`, NUNCA `information_schema.tables`: o
 * `information_schema` NÃO enxerga materialized view. Medido em produção:
 * 122 objetos por `information_schema` × 123 por `pg_class`, e o que falta é
 * `meta_campaign_roas` (`relkind='m'`), consultada em
 * `packages/web/src/app/api/meta-ads/campaigns/[campaign_id]/route.ts:397`.
 * A régua errada nasceria com 1 falso vermelho — e falso vermelho é como
 * controle vira ruído e ruído vira desligado.
 */
function buildQuery(objects: ReferencedObject[]): string {
  const values = objects
    .map((o) => `('${assertSafeName(o.name)}','${o.kind}')`)
    .join(",")

  return `
with alvo(nome, tipo) as (values ${values}),
rel as (
  select a.nome,
         a.tipo,
         to_regclass('public.' || quote_ident(a.nome)) is not null as existe,
         coalesce(
           has_table_privilege('service_role', to_regclass('public.' || quote_ident(a.nome)), 'SELECT'),
           false
         ) as privilegio
    from alvo a
   where a.tipo = 'relation'
),
fn as (
  select a.nome,
         a.tipo,
         exists (
           select 1 from pg_proc p
            where p.proname = a.nome and p.pronamespace = 'public'::regnamespace
         ) as existe,
         coalesce((
           select bool_or(has_function_privilege('service_role', p.oid, 'EXECUTE'))
             from pg_proc p
            where p.proname = a.nome and p.pronamespace = 'public'::regnamespace
         ), false) as privilegio
    from alvo a
   where a.tipo = 'rpc'
)
select nome, tipo, existe, privilegio from rel
union all
select nome, tipo, existe, privilegio from fn
order by tipo, nome;`
}

async function runQuery(token: string, projectRef: string, query: string): Promise<CatalogRow[]> {
  let response: Response
  try {
    response = await fetch(`${MANAGEMENT_API}/${projectRef}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    })
  } catch (err) {
    console.error(`❌ Erro de rede consultando o catálogo: ${(err as Error).message}`)
    process.exit(EXIT_ERRO)
  }

  const body = await response.text()
  if (!response.ok) {
    console.error(`❌ Management API respondeu ${response.status}: ${body.slice(0, 500)}`)
    process.exit(EXIT_ERRO)
  }

  let rows: unknown
  try {
    rows = JSON.parse(body)
  } catch {
    console.error(`❌ Resposta não é JSON: ${body.slice(0, 500)}`)
    process.exit(EXIT_ERRO)
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    // Resposta vazia NÃO é "nada faltando". É consulta que não respondeu.
    console.error(`❌ Consulta devolveu resposta vazia ou inesperada: ${body.slice(0, 500)}`)
    process.exit(EXIT_ERRO)
  }
  return rows as CatalogRow[]
}

function reportSkipped(skipped: SkippedReference[]): void {
  const dinamicos = skipped.filter((s) => s.reason === "nao-literal")
  if (dinamicos.length === 0) return
  console.log(`\n⚠️  Ponto cego 3 — ${dinamicos.length} sítio(s) com argumento não-literal (fora da população):`)
  for (const s of dinamicos) console.log(`     ${s.file}:${s.line}  ${s.snippet.replace(/\s+/g, " ")}`)
}

async function main(): Promise<number> {
  const verbose = process.argv.includes("--verbose")
  const root = repoRoot()

  const files: string[] = []
  for (const rel of SOURCE_ROOTS) {
    const dir = path.join(root, rel)
    if (!existsSync(dir)) {
      console.error(`❌ Raiz de varredura inexistente: ${rel}`)
      return EXIT_ERRO
    }
    walk(dir, files)
  }

  const { objects, skipped } = collectReferencedObjects(
    files.map((file) => ({ file: path.relative(root, file), source: readFileSync(file, "utf8") }))
  )

  if (objects.length === 0) {
    console.error(
      "❌ Lista de alvos VAZIA. Extrator que não achou nada está quebrado — não é banco perfeito."
    )
    return EXIT_ERRO
  }

  const relacoes = objects.filter((o) => o.kind === "relation")
  const rpcs = objects.filter((o) => o.kind === "rpc")
  const sitios = objects.reduce((acc, o) => acc + o.sites.length, 0)

  const { token, projectRef } = loadCredentials(root)
  console.log(`🔎 db:objects:check — projeto ${projectRef}`)
  console.log(
    `   população: ${files.length} arquivos de produção` +
      ` (packages/{ai,web,shared}/src, sem *.test.ts(x)/__fixtures__/__mocks__)`
  )
  console.log(
    `   alvos: ${relacoes.length} relações + ${rpcs.length} RPCs = ${objects.length} objetos, ${sitios} sítios`
  )

  const rows = await runQuery(token, projectRef, buildQuery(objects))
  const byKey = new Map(rows.map((r) => [`${r.tipo}:${r.nome}`, r]))

  const ausentes: ReferencedObject[] = []
  const semPrivilegio: ReferencedObject[] = []
  const naoRespondidos: ReferencedObject[] = []

  for (const obj of objects) {
    const row = byKey.get(`${obj.kind}:${obj.name}`)
    if (!row) {
      naoRespondidos.push(obj)
      continue
    }
    if (!row.existe) ausentes.push(obj)
    else if (!row.privilegio) semPrivilegio.push(obj)
  }

  if (naoRespondidos.length > 0) {
    // Alvo sem linha de resposta é consulta incompleta, não objeto saudável.
    console.error(`\n❌ ${naoRespondidos.length} alvo(s) sem linha na resposta do catálogo:`)
    for (const o of naoRespondidos) console.error(`     ${o.kind} ${o.name}`)
    return EXIT_ERRO
  }

  if (verbose) {
    console.log("")
    for (const obj of objects) console.log(`   ✅ ${obj.kind.padEnd(8)} ${obj.name}`)
  }

  if (ausentes.length === 0 && semPrivilegio.length === 0) {
    console.log(`\n🟢 OK — ${objects.length} de ${objects.length} objetos existem em produção com privilégio para service_role.`)
    reportSkipped(skipped)
    return EXIT_OK
  }

  for (const [titulo, lista] of [
    ["NÃO EXISTEM em produção", ausentes],
    ["existem mas SEM privilégio para service_role", semPrivilegio],
  ] as const) {
    if (lista.length === 0) continue
    console.error(`\n🔴 ${lista.length} objeto(s) ${titulo}:`)
    for (const obj of lista) {
      console.error(`\n   ${obj.kind === "rpc" ? "RPC" : "relação"} ${obj.name}  (${obj.sites.length} sítio(s))`)
      for (const site of obj.sites) console.error(`     ${site.file}:${site.line}`)
    }
  }
  console.error(
    `\n❌ ${ausentes.length + semPrivilegio.length} de ${objects.length} objetos reprovados.` +
      ` ${objects.length - ausentes.length - semPrivilegio.length} de ${objects.length} OK.`
  )
  reportSkipped(skipped)
  return EXIT_AUSENTE
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    // Erro não previsto NUNCA vira verde.
    console.error(`❌ Falha inesperada: ${err instanceof Error ? err.stack : String(err)}`)
    process.exit(EXIT_ERRO)
  })
