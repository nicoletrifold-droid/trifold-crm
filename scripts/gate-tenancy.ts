/**
 * Story 900-2a — Gate de Tenancy: motor de introspecção + regras R1-R4.
 *
 * O QUE ISTO É
 * ------------
 * A primeira medição objetiva e repetível de isolamento multi-tenant deste projeto. Até
 * hoje a única medida era uma auditoria manual pontual (`docs/audits/rls-multi-tenant-audit.md`),
 * que envelhece no dia seguinte. Este gate lê o schema real e reporta violações.
 *
 * O QUE ELE **NÃO** COBRE — e a ressalva importa mais que o relatório
 * -------------------------------------------------------------------
 * Este gate mede o BANCO. Ele não vê a aplicação. Hoje 129 dos 318 route handlers usam
 * `createAdminClient()` (service-role), que **bypassa RLS inteiramente**. Um gate verde
 * aqui significa "as policies estão no lugar", NUNCA "não há vazamento cross-tenant".
 * Tratar verde como garantia de isolamento seria exatamente a falsa segurança contra a
 * qual a auditoria alerta. A superfície service-role é assunto das stories 900-14/900-15
 * (`createOrgScopedAdminClient` + regra de ESLint), não deste script.
 *
 * ESCOPO DESTA FATIA (900-2a)
 * ---------------------------
 * Motor + R1, R2, R3, R4. As regras R5-R9 (matview/relkind, grant PUBLIC, search_path,
 * p_org_id, colisão de migration) são da `900-2b` e entram SEM alterar este motor — ver o
 * contrato da interface `Rule` abaixo. Baseline, catraca, allowlist populada e wiring de
 * CI são da `900-2c`.
 *
 * COMO RODAR
 *   pnpm gate:tenancy                  # introspecção ao vivo (precisa de SUPABASE_MANAGEMENT_PAT)
 *   pnpm gate:tenancy --snapshot       # força modo snapshot, sem rede
 *   TENANCY_TARGET_REF=<ref> pnpm gate:tenancy   # aponta para outro projeto
 *
 * A introspecção é **estritamente read-only** (só SELECT em catálogo). O gate nunca escreve.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"

// ---------------------------------------------------------------------------
// Tipos — o contrato entre este motor e as regras que a 900-2b vai acrescentar
// ---------------------------------------------------------------------------

export interface TableInfo {
  name: string
  rowsecurity: boolean
  hasOrgId: boolean
  /** `org_id` existe E é NOT NULL. R3 exige as duas coisas. */
  orgIdNotNull: boolean
}

export interface PolicyInfo {
  table: string
  /** SELECT | INSERT | UPDATE | DELETE | ALL */
  cmd: string
  permissive: boolean
  roles: string[]
  qual: string
  withCheck: string
}

export interface IntrospectedSchema {
  tables: TableInfo[]
  policies: PolicyInfo[]
  /** De onde os dados vieram — aparece no relatório para não confundir ao vivo com snapshot. */
  source: "management-api" | "snapshot"
  capturedAt: string
  projectRef: string
}

export interface Violation {
  rule: string
  table: string
  detail: string
}

/**
 * CONTRATO PARA QUEM IMPLEMENTAR A `900-2b` (regras R5-R9).
 *
 * Uma regra é uma função pura de schema para violações. Ela NÃO faz I/O, NÃO consulta a
 * rede e NÃO decide severidade — severidade é uniforme (FAIL) nesta fatia, e a lógica de
 * baseline/catraca que relativiza isso é da `900-2c`.
 *
 * Para acrescentar uma regra:
 *   1. escreva `const ruleR5: Rule = (schema) => [...]`
 *   2. acrescente-a ao array `RULES` abaixo
 *   3. não altere `introspect()`, `Violation` nem `IntrospectedSchema`
 *
 * Se uma regra nova precisar de um dado que `IntrospectedSchema` não tem (R5 precisa de
 * `pg_class.relkind`, R6 de `relacl`/`proacl`), **acrescente o campo ao tipo e à query de
 * introspecção** — mas mantenha os campos existentes, porque as regras R1-R4 dependem deles.
 * Campo novo é aditivo; renomear campo existente quebra este contrato.
 */
export type Rule = (schema: IntrospectedSchema, allowlist: Set<string>) => Violation[]

// ---------------------------------------------------------------------------
// Introspecção
// ---------------------------------------------------------------------------

const PROD_REF = "dsopqkqjkmhytudaaolv"
const TARGET_REF = process.env.TENANCY_TARGET_REF?.trim() || PROD_REF
const REPO_ROOT = process.cwd()
const SNAPSHOT_PATH = join(REPO_ROOT, "docs", "audits", "schema-snapshot.json")
const KNOWN_TABLES_PATH = join(REPO_ROOT, "docs", "audits", "tenancy-known-tables.json")
const ALLOWLIST_PATH = join(REPO_ROOT, "docs", "audits", "tenancy-allowlist.yml")
const REPORT_PATH = join(REPO_ROOT, "docs", "audits", "gate-tenancy-report.json")

const Q_TABLES = `
select t.tablename as name,
       c.relrowsecurity as rowsecurity,
       (oc.column_name is not null) as has_org_id,
       coalesce(oc.is_nullable = 'NO', false) as org_id_not_null
from pg_tables t
join pg_class c on c.relname = t.tablename
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
left join information_schema.columns oc
  on oc.table_schema = 'public' and oc.table_name = t.tablename and oc.column_name = 'org_id'
where t.schemaname = 'public'
order by t.tablename`

const Q_POLICIES = `
select tablename as table, cmd, permissive, roles::text as roles,
       coalesce(qual, '') as qual, coalesce(with_check, '') as with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname`

async function runSql<T>(sql: string, pat: string): Promise<T[]> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${TARGET_REF}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${pat}`,
      "Content-Type": "application/json",
      // sem User-Agent o WAF responde "error code: 1010", que não parece erro de auth
      "User-Agent": "trifold-gate-tenancy",
    },
    body: JSON.stringify({ query: sql }),
  })
  if (!r.ok) throw new Error(`Management API ${r.status}: ${(await r.text()).slice(0, 300)}`)
  return (await r.json()) as T[]
}

/** `{public,authenticated}` (formato do Postgres) → `["public","authenticated"]` */
function parseRoles(raw: string): string[] {
  return raw.replace(/^\{|\}$/g, "").split(",").map((s) => s.trim()).filter(Boolean)
}

export async function introspect(forceSnapshot = false): Promise<IntrospectedSchema> {
  const pat = process.env.SUPABASE_MANAGEMENT_PAT?.trim()

  if (!forceSnapshot && pat) {
    try {
      const [rawTables, rawPolicies] = await Promise.all([
        runSql<Record<string, unknown>>(Q_TABLES, pat),
        runSql<Record<string, unknown>>(Q_POLICIES, pat),
      ])
      return {
        tables: rawTables.map((t) => ({
          name: String(t.name),
          rowsecurity: Boolean(t.rowsecurity),
          hasOrgId: Boolean(t.has_org_id),
          orgIdNotNull: Boolean(t.org_id_not_null),
        })),
        policies: rawPolicies.map((p) => ({
          table: String(p.table),
          cmd: String(p.cmd),
          permissive: String(p.permissive).toUpperCase() === "PERMISSIVE",
          roles: parseRoles(String(p.roles ?? "")),
          qual: String(p.qual ?? ""),
          withCheck: String(p.with_check ?? ""),
        })),
        source: "management-api",
        capturedAt: new Date().toISOString(),
        projectRef: TARGET_REF,
      }
    } catch (e) {
      // Falha de rede/API não pode virar "gate verde" — degrada para snapshot, e avisa alto.
      console.warn(`⚠️  Introspecção ao vivo falhou: ${e instanceof Error ? e.message : e}`)
      console.warn("⚠️  Caindo para o snapshot versionado.")
    }
  } else if (!forceSnapshot && !pat) {
    console.warn("⚠️  SUPABASE_MANAGEMENT_PAT ausente — rodando em MODO SNAPSHOT.")
    console.warn("⚠️  O resultado reflete o schema da última captura, não o de agora.")
  }

  if (!existsSync(SNAPSHOT_PATH)) {
    throw new Error(
      `Sem PAT e sem snapshot em ${SNAPSHOT_PATH}. Gere um com: pnpm gate:tenancy:snapshot`,
    )
  }
  const snap = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf-8")) as IntrospectedSchema
  return { ...snap, source: "snapshot" }
}

// ---------------------------------------------------------------------------
// Allowlist (formato lido aqui; arquivo populado é da 900-2c)
// ---------------------------------------------------------------------------

/**
 * Lê `tenancy-allowlist.yml` se existir. Parser deliberadamente mínimo — o formato é uma
 * lista de `- table: nome` com `reason:` obrigatório —, para não puxar dependência de YAML
 * só por causa disso. A `900-2c`, que popula o arquivo de verdade e valida `reason:`,
 * decide se troca por um parser completo.
 *
 * Entrada SEM `reason:` preenchido é ignorada de propósito: allowlist sem justificativa é
 * exatamente o buraco que a allowlist deveria fechar.
 */
export function loadAllowlist(): Set<string> {
  if (!existsSync(ALLOWLIST_PATH)) return new Set()
  const out = new Set<string>()
  let current: string | null = null
  let reason = false
  for (const line of readFileSync(ALLOWLIST_PATH, "utf-8").split("\n")) {
    const t = line.match(/^\s*-\s*table:\s*(\S+)/)
    if (t) {
      if (current && reason) out.add(current)
      current = t[1].replace(/['"]/g, "")
      reason = false
      continue
    }
    if (current && /^\s+reason:\s*\S+/.test(line)) reason = true
  }
  if (current && reason) out.add(current)
  return out
}

// ---------------------------------------------------------------------------
// Regras R1-R4
// ---------------------------------------------------------------------------

/** Uma expressão de policy "fala de org" se menciona org_id em qualquer forma. */
function mencionaOrg(expr: string): boolean {
  return /org_id/i.test(expr)
}

/** R1 — RLS desabilitada em tabela que carrega org_id. */
export const ruleR1: Rule = (schema) =>
  schema.tables
    .filter((t) => t.hasOrgId && !t.rowsecurity)
    .map((t) => ({
      rule: "R1",
      table: t.name,
      detail: "RLS desabilitada em tabela com org_id",
    }))

/**
 * Qual expressão o Postgres REALMENTE aplica para um comando, dada uma policy.
 *
 * A sutileza que faz toda a diferença aqui, e que gerou 164 falsos positivos na primeira
 * versão desta regra: **quando `WITH CHECK` é omitido, o Postgres usa a expressão do `USING`
 * também para validar as linhas novas** (INSERT/UPDATE). O padrão dominante deste projeto é
 * exatamente esse — `FOR ALL USING (org_id = user_org_id())` com `with_check` nulo — de modo
 * que checar `with_check` isoladamente reportaria como desprotegida praticamente toda tabela
 * que na verdade está protegida.
 *
 * Um gate que grita em 164 tabelas corretas é pior que nenhum gate: ele treina o time a
 * ignorar o vermelho.
 *
 * Retorna `null` quando a policy não se aplica ao comando.
 */
function expressaoAplicada(p: PolicyInfo, cmd: string): string | null {
  if (p.cmd !== cmd && p.cmd !== "ALL") return null
  switch (cmd) {
    case "SELECT":
    case "DELETE":
      // Só leem linhas existentes — apenas USING vale.
      return p.qual
    case "INSERT":
      // Policy FOR INSERT só tem WITH CHECK. Policy FOR ALL sem WITH CHECK cai no USING.
      return p.withCheck || p.qual
    case "UPDATE":
      // USING escolhe a linha, WITH CHECK valida o resultado; sem WITH CHECK, USING faz os dois.
      return p.qual || p.withCheck
    default:
      return null
  }
}

/**
 * R2 — cobertura de policy org-scoped por comando (SELECT/INSERT/UPDATE/DELETE).
 *
 * Uma policy `ALL` cobre os quatro comandos se a expressão que o Postgres de fato aplica
 * àquele comando mencionar `org_id` — ver `expressaoAplicada`.
 */
export const ruleR2: Rule = (schema, allowlist) => {
  const out: Violation[] = []
  const comandos = ["SELECT", "INSERT", "UPDATE", "DELETE"] as const

  for (const t of schema.tables) {
    if (!t.hasOrgId || allowlist.has(t.name)) continue
    if (!t.rowsecurity) continue // já reportado por R1; não duplicar ruído

    const daTabela = schema.policies.filter((p) => p.table === t.name)
    for (const cmd of comandos) {
      const cobre = daTabela.some((p) => {
        const expr = expressaoAplicada(p, cmd)
        return expr !== null && mencionaOrg(expr)
      })
      if (!cobre) {
        out.push({ rule: "R2", table: t.name, detail: `sem policy org-scoped para ${cmd}` })
      }
    }
  }
  return out
}

/**
 * R3 — tabela nova sem `org_id NOT NULL`.
 *
 * FAIL absoluto, sem baseline: é a única regra desenhada para não ter válvula de escape.
 * A grandfather list (`tenancy-known-tables.json`) NUNCA cresce — ver `assertKnownTablesIntegro`.
 */
export const ruleR3: Rule = (schema, allowlist) => {
  const known = loadKnownTables()
  return schema.tables
    .filter((t) => !known.has(t.name) && !t.orgIdNotNull && !allowlist.has(t.name))
    .map((t) => ({
      rule: "R3",
      table: t.name,
      detail: "tabela nova sem org_id NOT NULL (isente pela allowlist com reason:, nunca por known-tables)",
    }))
}

/**
 * R4 — policy permissiva `USING(true)` anula as demais.
 *
 * Reproduz o achado P3 da auditoria (`system_events`). No Postgres, policies PERMISSIVE se
 * combinam por OR: uma única `USING(true)` torna todas as outras irrelevantes. Note que
 * praticamente toda policy deste projeto tem `roles = {public}`, então o discriminante real
 * é o `qual` ser literalmente `true` — o filtro de role está aqui por fidelidade ao epic,
 * não porque separe muita coisa.
 */
export const ruleR4: Rule = (schema) => {
  const comOrg = new Set(schema.tables.filter((t) => t.hasOrgId).map((t) => t.name))
  return schema.policies
    .filter((p) => comOrg.has(p.table))
    .filter((p) => p.permissive)
    .filter((p) => p.qual.trim().toLowerCase() === "true")
    .filter((p) => p.roles.some((r) => r === "public" || r === "authenticated"))
    .map((p) => ({
      rule: "R4",
      table: p.table,
      detail: `policy permissiva USING(true) em ${p.cmd} anula as demais`,
    }))
}

export const RULES: Rule[] = [ruleR1, ruleR2, ruleR3, ruleR4]

// ---------------------------------------------------------------------------
// Grandfather list — o arquivo que nunca cresce
// ---------------------------------------------------------------------------

interface KnownTablesFile {
  _aviso: string
  congeladoEm: string
  projectRef: string
  /** Guarda de integridade: contagem + hash simples das entradas. */
  contagem: number
  checksum: string
  tabelas: string[]
}

/** Hash estável e simples (FNV-1a) — não é criptografia, é detecção de edição manual. */
export function checksumTabelas(tabelas: string[]): string {
  let h = 0x811c9dc5
  for (const ch of [...tabelas].sort().join(",")) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, "0")
}

function readKnownTablesFile(): KnownTablesFile | null {
  if (!existsSync(KNOWN_TABLES_PATH)) return null
  return JSON.parse(readFileSync(KNOWN_TABLES_PATH, "utf-8")) as KnownTablesFile
}

/**
 * Recusa rodar se a grandfather list foi editada à mão.
 *
 * Sem esta guarda, o primeiro dev que vir R3 vermelho resolve acrescentando uma linha aqui
 * — e mata a regra em silêncio para sempre. O efeito líquido pretendido é: editar este
 * arquivo à mão é VISIVELMENTE anômalo, não silencioso.
 */
export function assertKnownTablesIntegro(): void {
  const f = readKnownTablesFile()
  if (!f) return
  if (f.tabelas.length !== f.contagem || checksumTabelas(f.tabelas) !== f.checksum) {
    throw new Error(
      `tenancy-known-tables.json foi EDITADO À MÃO.\n` +
        `  esperado: ${f.contagem} tabelas, checksum ${f.checksum}\n` +
        `  encontrado: ${f.tabelas.length} tabelas, checksum ${checksumTabelas(f.tabelas)}\n\n` +
        `Este arquivo é uma grandfather list CONGELADA e não deve crescer nunca.\n` +
        `Tabela nova legítima sem org_id vai para docs/audits/tenancy-allowlist.yml\n` +
        `com reason: preenchido — que é revisável em diff. Reverta a edição.`,
    )
  }
}

function loadKnownTables(): Set<string> {
  const f = readKnownTablesFile()
  return new Set(f?.tabelas ?? [])
}

// ---------------------------------------------------------------------------
// Saída
// ---------------------------------------------------------------------------

function imprimirTabela(violacoes: Violation[]): void {
  if (violacoes.length === 0) {
    console.log("Nenhuma violação de R1-R4.\n")
    return
  }
  const wRule = Math.max(5, ...violacoes.map((v) => v.rule.length))
  const wTab = Math.max(7, ...violacoes.map((v) => v.table.length))
  console.log(`${"REGRA".padEnd(wRule)}  ${"TABELA".padEnd(wTab)}  DETALHE`)
  console.log(`${"-".repeat(wRule)}  ${"-".repeat(wTab)}  ${"-".repeat(50)}`)
  for (const v of violacoes) {
    console.log(`${v.rule.padEnd(wRule)}  ${v.table.padEnd(wTab)}  ${v.detail}`)
  }
  console.log()
}

export async function main(): Promise<number> {
  const forceSnapshot = process.argv.includes("--snapshot")

  assertKnownTablesIntegro()

  const schema = await introspect(forceSnapshot)
  const allowlist = loadAllowlist()

  console.log(`Gate de tenancy — R1-R4  (fonte: ${schema.source}, projeto: ${schema.projectRef})`)
  console.log(`${schema.tables.length} tabelas, ${schema.policies.length} policies, ` +
              `${schema.tables.filter((t) => t.hasOrgId).length} com org_id`)
  if (allowlist.size) console.log(`allowlist: ${allowlist.size} tabela(s) isenta(s)`)
  console.log()

  const violacoes = RULES.flatMap((r) => r(schema, allowlist))
  imprimirTabela(violacoes)

  const porRegra = violacoes.reduce<Record<string, number>>((acc, v) => {
    acc[v.rule] = (acc[v.rule] ?? 0) + 1
    return acc
  }, {})
  console.log("Violações por regra:", Object.keys(porRegra).length ? porRegra : "nenhuma")

  writeFileSync(
    REPORT_PATH,
    JSON.stringify(
      {
        geradoEm: new Date().toISOString(),
        fonte: schema.source,
        projectRef: schema.projectRef,
        totais: { violacoes: violacoes.length, porRegra },
        violacoes,
      },
      null,
      2,
    ) + "\n",
  )
  console.log(`\nRelatório JSON: ${REPORT_PATH}`)

  // ESTA RESSALVA NÃO É DECORATIVA — ver cabeçalho do arquivo.
  console.log(
    "\n⚠️  Este gate mede o BANCO. 129 dos 318 route handlers usam service-role e\n" +
    "   bypassam RLS — gate verde NÃO significa ausência de vazamento cross-tenant.",
  )

  return violacoes.length > 0 ? 1 : 0
}

if (process.argv[1]?.includes("gate-tenancy")) {
  main()
    .then((c) => process.exit(c))
    .catch((e) => {
      console.error(`\n${e instanceof Error ? e.message : e}`)
      process.exit(1)
    })
}
