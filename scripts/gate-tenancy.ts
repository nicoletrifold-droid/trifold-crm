/**
 * Gate de Tenancy — motor de introspecção + regras R1-R9.
 *   · Stories 900-2a (motor + R1-R4) e 900-2b (R5-R9, severidade).
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
 * REGRAS IMPLEMENTADAS
 * --------------------
 *   R1  RLS desabilitada em tabela com `org_id`                            FAIL
 *   R2  cobertura de policy org-scoped por comando                         FAIL
 *   R3  tabela nova sem `org_id NOT NULL` (grandfather list congelada)     FAIL
 *   R4  policy PERMISSIVE `USING(true)` anulando as demais                 FAIL
 *   R5  view sem `security_invoker` · matview com grant                    FAIL
 *   R6  grant a `PUBLIC` em SECURITY DEFINER / relação com `org_id`        FAIL
 *   R7  SECURITY DEFINER sem `SET search_path`                             FAIL
 *   R8  SECURITY DEFINER com `p_org_id` não validado                       WARN
 *   R9  duas migrations do mesmo PR redefinindo a mesma função             FAIL
 *
 * R10/R11/R12 (drift de `sellable_modules`, `AiUsageContext`,
 * `PLATFORM_READABLE_TABLES`) dependem de artefatos de ondas futuras e são da `900-2c`,
 * junto com baseline, catraca, allowlist populada e wiring de CI.
 *
 * COMO RODAR
 *   pnpm gate:tenancy                  # introspecção ao vivo (precisa de SUPABASE_MANAGEMENT_PAT)
 *   pnpm gate:tenancy --snapshot       # força modo snapshot, sem rede
 *   TENANCY_TARGET_REF=<ref> pnpm gate:tenancy   # aponta para outro projeto
 *   GATE_TENANCY_BASE=<ref> pnpm gate:tenancy    # base do diff de migrations (R9), default origin/main
 *
 * A introspecção é **estritamente read-only** (só SELECT em catálogo). O gate nunca escreve.
 */

import { execSync } from "node:child_process"
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

/** View ou matview. Story 900-2b: a distinção por `relkind` é o ponto da regra R5. */
export interface RelationInfo {
  name: string
  /** 'v' = view · 'm' = materialized view */
  relkind: "v" | "m"
  /** ACL cru do Postgres (`relacl`), já como array de strings. */
  acl: string[]
  /** `on` | `off` | null (não aplicável a matview — ver R5). */
  securityInvoker: string | null
}

/** Função do schema public. Story 900-2b: base de R6, R7 e R8. */
export interface FunctionInfo {
  name: string
  /** Assinatura dos argumentos, para distinguir sobrecargas. */
  args: string
  securityDefiner: boolean
  /** Itens de `proconfig` (ex.: `search_path=public, pg_temp`). */
  config: string[]
  /** ACL cru (`proacl`). */
  acl: string[]
  /** Corpo da função — R8 procura `user_org_id`/`assert_org_scope` aqui. */
  body: string
}

export interface IntrospectedSchema {
  tables: TableInfo[]
  policies: PolicyInfo[]
  /** Story 900-2b — views e matviews. Opcional: snapshots gerados pela 900-2a não têm. */
  relations?: RelationInfo[]
  /** Story 900-2b — funções. Opcional pelo mesmo motivo. */
  functions?: FunctionInfo[]
  /** De onde os dados vieram — aparece no relatório para não confundir ao vivo com snapshot. */
  source: "management-api" | "snapshot"
  capturedAt: string
  projectRef: string
}

/**
 * Severidade da violação (Story 900-2b, AC8).
 *
 * `FAIL` derruba o gate (exit 1). `WARN` aparece no relatório e **não** derruba — usado hoje
 * só por R8, cuja promoção a FAIL é decisão de configuração da Onda 2, não desta story.
 */
export type Severity = "FAIL" | "WARN"

export interface Violation {
  rule: string
  /** Nome do objeto: tabela, view, matview ou função, conforme a regra. */
  table: string
  detail: string
  /** Ausente é lido como "FAIL" — mantém compatibilidade com as regras da 900-2a. */
  severity?: Severity
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

/**
 * Story 900-3c (OBS-6). O relatório é regravado a cada execução, é **rastreado** e é a
 * fixture de `scripts/gate-tenancy-auditoria.test.ts`. Rodar o gate contra um ref que não
 * seja produção o enche de dados do ambiente errado e derruba a suíte.
 */
const AVISO_DO_RELATORIO =
  "ARQUIVO GERADO — regravado a cada `pnpm gate:tenancy`. Ele é RASTREADO e é a fixture de " +
  "scripts/gate-tenancy-auditoria.test.ts: se você rodar o gate contra um ref que NÃO seja " +
  "produção (TENANCY_TARGET_REF=...), este arquivo passa a descrever o outro banco e a suíte " +
  "quebra. Restaure com `git checkout -- docs/audits/gate-tenancy-report.json` depois de medir."


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

/**
 * Views e matviews (Story 900-2b · R5).
 *
 * `security_invoker` vem de `reloptions` e **só existe para views**. Pedi-lo para matview
 * não é só inútil: `ALTER MATERIALIZED VIEW ... SET (security_invoker)` falha com ERRCODE
 * 42809. Por isso a regra precisa olhar `relkind` ANTES de prescrever qualquer coisa.
 */
const Q_RELATIONS = `
select c.relname as name,
       c.relkind::text as relkind,
       coalesce(c.relacl::text, '') as acl,
       (select option_value from pg_options_to_table(c.reloptions)
         where option_name = 'security_invoker') as security_invoker
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('v','m')
order by c.relname`

/**
 * Funções do schema public (Story 900-2b · R6, R7, R8).
 *
 * `proacl IS NULL` significa ACL DEFAULT, que para função é `EXECUTE para PUBLIC` — ou seja,
 * ausência de ACL é o caso MAIS permissivo, não o mais restrito. Normalizamos para a string
 * `=X/` (a forma explícita do mesmo grant) para que R6 não precise tratar null como exceção
 * e acabe deixando passar justamente o caso default.
 */
const Q_FUNCTIONS = `
select p.proname as name,
       pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef as security_definer,
       coalesce(array_to_string(p.proconfig, '|'), '') as config,
       coalesce(p.proacl::text, '{=X/default}') as acl,
       coalesce(p.prosrc, '') as body
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname`

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
      const [rawTables, rawPolicies, rawRelations, rawFunctions] = await Promise.all([
        runSql<Record<string, unknown>>(Q_TABLES, pat),
        runSql<Record<string, unknown>>(Q_POLICIES, pat),
        runSql<Record<string, unknown>>(Q_RELATIONS, pat),
        runSql<Record<string, unknown>>(Q_FUNCTIONS, pat),
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
        relations: rawRelations.map((r) => ({
          name: String(r.name),
          relkind: String(r.relkind) === "m" ? ("m" as const) : ("v" as const),
          acl: parseRoles(String(r.acl ?? "")),
          securityInvoker: r.security_invoker == null ? null : String(r.security_invoker),
        })),
        functions: rawFunctions.map((f) => ({
          name: String(f.name),
          args: String(f.args ?? ""),
          securityDefiner: Boolean(f.security_definer),
          config: String(f.config ?? "").split("|").filter(Boolean),
          acl: parseRoles(String(f.acl ?? "")),
          body: String(f.body ?? ""),
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

// ---------------------------------------------------------------------------
// Regras R5-R9 (Story 900-2b)
// ---------------------------------------------------------------------------

/** Uma entrada de ACL concede ao pseudo-role PUBLIC quando começa com `=`. */
function concedeAPublic(acl: string[]): boolean {
  return acl.some((e) => e.trim().startsWith("="))
}

function concedeA(acl: string[], role: string): boolean {
  return acl.some((e) => e.trim().startsWith(`${role}=`))
}

/**
 * R5 — view sem `security_invoker`, matview com grant.
 *
 * A distinção por `relkind` é o motivo de a regra existir separada: `security_invoker` é
 * opção de VIEW. Aplicá-la a matview falha com **ERRCODE 42809** — prescrever isso mandaria
 * quem for corrigir escrever um ALTER que não roda. Para matview, o controle correto é
 * REVOKE do grant.
 */
export const ruleR5: Rule = (schema) => {
  const out: Violation[] = []
  for (const r of schema.relations ?? []) {
    const exposta =
      concedeA(r.acl, "anon") || concedeA(r.acl, "authenticated") || concedeAPublic(r.acl)
    if (!exposta) continue

    if (r.relkind === "v") {
      const ligado = r.securityInvoker === "on" || r.securityInvoker === "true"
      if (!ligado) {
        out.push({ rule: "R5", table: r.name, detail: "view sem security_invoker", severity: "FAIL" })
      }
    } else {
      const quem = concedeA(r.acl, "anon")
        ? "anon"
        : concedeA(r.acl, "authenticated")
          ? "authenticated"
          : "PUBLIC"
      out.push({
        rule: "R5",
        table: r.name,
        detail: `matview com grant a ${quem} — security_invoker não se aplica (ERRCODE 42809); controle correto é revoke`,
        severity: "FAIL",
      })
    }
  }
  return out
}

/**
 * R6 — grant a `PUBLIC`, que um revoke de `anon`/`authenticated` NÃO fecha.
 *
 * ### Por que a regra olha só as SECURITY DEFINER, e não todas as funções
 *
 * Medido contra produção: **158 das 176 funções concedem EXECUTE a PUBLIC** — porque esse é
 * o **default do Postgres** para qualquer função criada sem REVOKE explícito. Reportar as 158
 * transformaria a regra em ruído, e ruído treina o time a ignorar o vermelho (a mesma
 * armadilha dos 164 falsos positivos da R2 em `900-2a`).
 *
 * O que separa o perigoso do inócuo não é o grant, é o `SECURITY DEFINER`:
 *
 * | | com PUBLIC | por quê |
 * |---|---|---|
 * | `SECURITY INVOKER` | 136 | roda com privilégio de quem chama; **RLS continua valendo** |
 * | `SECURITY DEFINER` | **22** | roda com privilégio do dono e **bypassa RLS** |
 *
 * As 22 são o achado P1 da auditoria. As 136 são o default da linguagem.
 *
 * **Isto é um refinamento deliberado da AC2**, que pede "detecta entrada de PUBLIC" sem
 * qualificar. Está registrado aqui, no Dev Agent Record e no PR para que @qa/@architect
 * possam discordar com número na mão — e, se discordarem, basta remover o filtro de
 * `securityDefiner` desta função.
 *
 * Tabelas e views com `org_id` expostas a PUBLIC são reportadas sem esse filtro: ali não há
 * equivalente do default inócuo.
 */
export const ruleR6: Rule = (schema, allowlist) => {
  const out: Violation[] = []

  for (const f of schema.functions ?? []) {
    if (!f.securityDefiner) continue // ver tabela no JSDoc
    if (!concedeAPublic(f.acl)) continue
    out.push({
      rule: "R6",
      table: `${f.name}(${f.args})`,
      detail: "SECURITY DEFINER com EXECUTE para PUBLIC — revoke só de anon/authenticated não fecha o furo",
      severity: "FAIL",
    })
  }

  const comOrgId = new Set(schema.tables.filter((t) => t.hasOrgId).map((t) => t.name))
  for (const r of schema.relations ?? []) {
    if (!concedeAPublic(r.acl)) continue
    if (!comOrgId.has(r.name) && r.relkind !== "m") continue
    if (allowlist.has(r.name)) continue
    out.push({
      rule: "R6",
      table: r.name,
      detail: "grant concedido a PUBLIC — revoke só de anon/authenticated não fecha o furo",
      severity: "FAIL",
    })
  }
  return out
}

/**
 * R7 — `SECURITY DEFINER` sem `SET search_path`.
 *
 * Sem `search_path` fixo, quem chama pode plantar um schema no caminho de resolução e fazer
 * a função executar objeto dele **com o privilégio do dono**. É o achado P13 da auditoria.
 */
export const ruleR7: Rule = (schema) =>
  (schema.functions ?? [])
    .filter((f) => f.securityDefiner)
    .filter((f) => !f.config.some((c) => c.trim().toLowerCase().startsWith("search_path=")))
    .map((f) => ({
      rule: "R7",
      table: `${f.name}(${f.args})`,
      detail: "SECURITY DEFINER sem SET search_path — vetor de hijack",
      severity: "FAIL" as const,
    }))

/**
 * R8 — `SECURITY DEFINER` que recebe `p_org_id` sem validar contra a org do chamador.
 *
 * Uma função assim aceita QUALQUER `org_id` que lhe passem e, por ser DEFINER, executa
 * ignorando RLS: é IDOR direto. A validação esperada é referência a `user_org_id()` ou
 * `assert_org_scope()` no corpo.
 *
 * **Severidade WARN nesta onda**, por decisão do epic: a promoção para FAIL é da Onda 2,
 * quando a allowlist de service-role existir para separar o legítimo do vazamento. Marcar
 * FAIL agora derrubaria o gate por casos que ainda não têm como ser isentados.
 */
export const ruleR8: Rule = (schema, allowlist) =>
  (schema.functions ?? [])
    .filter((f) => f.securityDefiner)
    .filter((f) => /\bp_org_id\b/.test(f.args))
    .filter((f) => !/\b(user_org_id|assert_org_scope)\b/.test(f.body))
    .filter((f) => !allowlist.has(f.name))
    .map((f) => ({
      rule: "R8",
      table: `${f.name}(${f.args})`,
      detail: "SECURITY DEFINER recebe p_org_id sem validar contra user_org_id()",
      severity: "WARN" as const,
    }))

/**
 * R9 — duas migrations do mesmo PR redefinindo a mesma função.
 *
 * O caso real que originou a regra: `195_sdr_na_roleta.sql` e `199_hotfix_rls_org_scope.sql`
 * ambas com `CREATE OR REPLACE FUNCTION roleta_pick_and_advance`. Quando as duas chegam
 * juntas, **o último arquivo aplicado ganha em silêncio** e a mudança da outra desaparece sem
 * erro nenhum — foi o que quase reverteu a Story 75-226.
 *
 * ### Divergência deliberada da AC5 — e o motivo é factual
 *
 * A AC5 manda comparar os arquivos contra `supabase_migrations.schema_migrations` para achar
 * "migrations com versão maior que a última aplicada". **Isso não é executável neste
 * repositório:** o registro usa timestamps (`20260710171933`) e os arquivos usam prefixos
 * sequenciais (`237_...`). Não existe ordem comum entre os dois formatos, e o registro está
 * dezenas de versões atrás (item conhecido do backlog).
 *
 * A intenção da regra — confirmada pela própria AC6, que fala em "ambos chegarem juntos num
 * mesmo PR" — é comparar **o conjunto do PR**, não o histórico. Então o corte é por git:
 * as migrations adicionadas neste branch em relação à base. Isso é preciso, funciona em CI e
 * não depende de um registro que está sabidamente quebrado.
 *
 * Sem git disponível, a regra se abstém (e diz que se absteve) em vez de comparar o
 * diretório inteiro — comparar tudo acusaria redefinições históricas legítimas, que são
 * normais ao longo de meses e não são o que a regra procura.
 */
export function extrairFuncoesRedefinidas(sql: string): string[] {
  const re = /create\s+or\s+replace\s+function\s+(?:public\.)?"?([a-z0-9_]+)"?/gi
  const nomes = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = re.exec(sql)) !== null) nomes.add(m[1].toLowerCase())
  return [...nomes]
}

/** Detecta colisão dado um conjunto `arquivo → conteúdo`. Puro, para poder testar. */
export function detectarColisoes(arquivos: Record<string, string>): Violation[] {
  const porFuncao = new Map<string, string[]>()
  for (const [arquivo, sql] of Object.entries(arquivos)) {
    for (const fn of extrairFuncoesRedefinidas(sql)) {
      porFuncao.set(fn, [...(porFuncao.get(fn) ?? []), arquivo])
    }
  }
  const out: Violation[] = []
  for (const [fn, files] of porFuncao) {
    if (files.length < 2) continue
    const ordenados = [...files].sort()
    out.push({
      rule: "R9",
      table: fn,
      detail: `migrations ${ordenados.join(" e ")} ambas redefinem ${fn} — o último aplicado ganha em silêncio`,
      severity: "FAIL",
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// R10-R12 (Story 900-2c) — registradas com flag desligada
// ---------------------------------------------------------------------------

/**
 * Onda corrente do Epic 900. Cada regra abaixo só liga quando a onda que cria o artefato
 * que ela verifica tiver acontecido. Default 0 = nenhuma delas roda.
 *
 * **Elas são stubs de propósito e não têm lógica.** Escrever a lógica agora seria inventar
 * verificação sobre tabelas que ainda não existem (`sellable_modules` nasce em `900-26`,
 * `ai_usage_events` em `900-33`, `PLATFORM_READABLE_TABLES` em `900-22`) — o teste passaria
 * por vacuidade e daria a impressão de cobertura que não existe. Ficam registradas para que
 * a numeração R1-R12 do epic seja real, e para que quem implementar tenha o ponto de entrada.
 */
const GATE_ONDA = Number.parseInt(process.env.GATE_ONDA ?? "0", 10) || 0

/** R10 — drift entre `sellable_modules` e os módulos do código. Liga na Onda 3 (`900-26`). */
export const ruleR10: Rule = () => {
  if (GATE_ONDA < 3) return []
  throw new Error("R10 ainda não implementada — story 900-26 cria `sellable_modules`.")
}

/** R11 — uso de `AiUsageContext` na fábrica dos clients de IA. Liga na Onda 4 (`900-34`). */
export const ruleR11: Rule = () => {
  if (GATE_ONDA < 4) return []
  throw new Error("R11 ainda não implementada — story 900-34 cria a medição de IA.")
}

/** R12 — `/platform` só lê `PLATFORM_READABLE_TABLES`. Liga na Onda 6 (`900-42a`). */
export const ruleR12: Rule = () => {
  if (GATE_ONDA < 6) return []
  throw new Error("R12 ainda não implementada — story 900-42a consolida a lista.")
}

export const RULES: Rule[] = [
  ruleR1, ruleR2, ruleR3, ruleR4, ruleR5,
  ruleR6, ruleR7, ruleR8, ruleR10, ruleR11, ruleR12,
]

// ---------------------------------------------------------------------------
// Baseline e catraca (Story 900-2c)
// ---------------------------------------------------------------------------

export interface Baseline {
  _aviso: string
  geradoEm: string
  projectRef: string
  /** Contagem total de violações FAIL no momento do congelamento. */
  total: number
  porRegra: Record<string, number>
  /** Chaves `regra|objeto|detalhe` das violações conhecidas. */
  chaves: string[]
}

const BASELINE_PATH = join(REPO_ROOT, "docs", "audits", "rls-gate-baseline.json")

export function chaveDe(v: Violation): string {
  return `${v.rule}|${v.table}|${v.detail}`
}

export interface ResultadoCatraca {
  ok: boolean
  motivos: string[]
  novas: Violation[]
  resolvidas: string[]
  delta: number
}

/**
 * A catraca: o número nunca sobe, e violação nova nunca passa.
 *
 * Falha se **(a)** o total de FAIL subir, **(b)** aparecer violação fora do baseline e fora
 * da allowlist, ou **(c)** existir QUALQUER violação de R3.
 *
 * ### A tensão do item (c), que o epic manda documentar
 *
 * R3 é declarada "FAIL absoluto desde o dia 1, sem baseline" — ela nunca entra na linha de
 * base, porque é a regra que impede dívida NOVA. Só que, nesta onda, o job do CI roda com
 * `continue-on-error: true`. Ou seja: **o script retorna 1, e o PR passa mesmo assim.**
 *
 * Isso é deliberado e é temporário. O exit code diz a verdade desde já; quem decide não
 * travar o PR é o wiring, não a lógica — e é a `900-18` que remove o `continue-on-error` na
 * saída da Onda 1. Registrar essa diferença importa porque, olhando só o CI verde, alguém
 * poderia concluir que R3 não está valendo. Está valendo; ainda não está travando.
 */
export function aplicarCatraca(
  violacoes: Violation[],
  baseline: Baseline | null,
): ResultadoCatraca {
  const fails = violacoes.filter((v) => severidade(v) === "FAIL")
  const motivos: string[] = []

  const r3 = fails.filter((v) => v.rule === "R3")
  if (r3.length > 0) {
    motivos.push(
      `(c) ${r3.length} violação(ões) de R3 — R3 nunca entra em baseline: ${r3.map((v) => v.table).join(", ")}`,
    )
  }

  if (!baseline) {
    return {
      ok: motivos.length === 0,
      motivos: motivos.length ? motivos : ["baseline ausente — nada a comparar (primeira execução)"],
      novas: [],
      resolvidas: [],
      delta: 0,
    }
  }

  const conhecidas = new Set(baseline.chaves)
  const atuais = new Set(fails.map(chaveDe))

  const novas = fails.filter((v) => !conhecidas.has(chaveDe(v)) && v.rule !== "R3")
  const resolvidas = baseline.chaves.filter((k) => !atuais.has(k))
  const delta = fails.length - baseline.total

  if (delta > 0) motivos.push(`(a) total de FAIL subiu: ${baseline.total} → ${fails.length} (+${delta})`)
  if (novas.length > 0) {
    motivos.push(`(b) ${novas.length} violação(ões) nova(s) fora do baseline e da allowlist`)
  }

  return { ok: motivos.length === 0, motivos, novas, resolvidas, delta }
}

export function lerBaseline(): Baseline | null {
  if (!existsSync(BASELINE_PATH)) return null
  return JSON.parse(readFileSync(BASELINE_PATH, "utf-8")) as Baseline
}

/**
 * Texto exigido pela AC6, impresso em TODA execução — inclusive quando o gate está verde.
 *
 * **Os números foram atualizados em relação ao texto original da AC**, que dizia "166 de 285
 * route handlers". Medido em 2026-08-23: são **129 de 318**. Publicar o número velho num
 * relatório que existe para ser confiável seria contraproducente — a ressalva perde força se
 * quem a lê descobre que o dado está errado. A proporção continua fazendo o mesmo ponto.
 */
export const RESSALVA_COBERTURA =
  "Este gate valida o BANCO, não o código. Ele não vê rota em service-role sem\n" +
  ".eq('org_id') — a maior superfície de risco (129 de 318 route handlers usam\n" +
  "createAdminClient e bypassam RLS). O par indispensável é a regra de ESLint da\n" +
  "story 900-14. Gate verde NÃO significa isolamento garantido."

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

/**
 * Colisões de migration no conjunto do PR (R9). Não depende do schema, e sim do git — ver
 * o JSDoc de `detectarColisoes` para a divergência deliberada da AC5.
 */
function rodarR9(): { violacoes: Violation[]; nota: string } {
  const base = process.env.GATE_TENANCY_BASE?.trim() || "origin/main"
  let lista: string[]
  try {
    lista = execSync(`git diff --name-only --diff-filter=A ${base}...HEAD -- supabase/migrations/`, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.endsWith(".sql"))
  } catch {
    return {
      violacoes: [],
      nota: `R9 absteve-se: não foi possível comparar com '${base}' (git indisponível ou base ausente).`,
    }
  }

  if (lista.length === 0) {
    return { violacoes: [], nota: `R9: nenhuma migration nova em relação a ${base}.` }
  }

  const arquivos: Record<string, string> = {}
  for (const caminho of lista) {
    try {
      arquivos[caminho.split("/").pop() ?? caminho] = readFileSync(join(REPO_ROOT, caminho), "utf-8")
    } catch {
      /* arquivo removido depois do diff — ignorar */
    }
  }
  return {
    violacoes: detectarColisoes(arquivos),
    nota: `R9: ${Object.keys(arquivos).length} migration(s) nova(s) em relação a ${base}.`,
  }
}

function severidade(v: Violation): Severity {
  return v.severity ?? "FAIL"
}

function imprimirTabela(violacoes: Violation[]): void {
  if (violacoes.length === 0) {
    console.log("Nenhuma violação de R1-R9.\n")
    return
  }
  const wSev = 4
  const wRule = Math.max(5, ...violacoes.map((v) => v.rule.length))
  const wTab = Math.max(7, ...violacoes.map((v) => v.table.length))
  console.log(`${"SEV".padEnd(wSev)}  ${"REGRA".padEnd(wRule)}  ${"OBJETO".padEnd(wTab)}  DETALHE`)
  console.log(`${"-".repeat(wSev)}  ${"-".repeat(wRule)}  ${"-".repeat(wTab)}  ${"-".repeat(50)}`)
  for (const v of violacoes) {
    console.log(
      `${severidade(v).padEnd(wSev)}  ${v.rule.padEnd(wRule)}  ${v.table.padEnd(wTab)}  ${v.detail}`,
    )
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

  const doSchema = RULES.flatMap((r) => r(schema, allowlist))
  const r9 = rodarR9()
  const violacoes = [...doSchema, ...r9.violacoes]

  imprimirTabela(violacoes)
  console.log(r9.nota)

  const porRegra = violacoes.reduce<Record<string, number>>((acc, v) => {
    acc[v.rule] = (acc[v.rule] ?? 0) + 1
    return acc
  }, {})
  const fails = violacoes.filter((v) => severidade(v) === "FAIL").length
  const warns = violacoes.length - fails

  // OBS-6 — impresso ANTES de sobrescrever o arquivo, para quem estiver olhando o terminal.
  if (schema.projectRef !== PROD_REF) {
    console.warn(
      `\n⚠️  ALVO NÃO É PRODUÇÃO (${schema.projectRef}). Este gate vai SOBRESCREVER o arquivo\n` +
        `    RASTREADO ${REPORT_PATH},\n` +
        `    que é a fixture de scripts/gate-tenancy-auditoria.test.ts — a suíte vai quebrar.\n` +
        `    Depois de medir: git checkout -- docs/audits/gate-tenancy-report.json`,
    )
  }

  console.log("\nViolações por regra:", Object.keys(porRegra).length ? porRegra : "nenhuma")
  console.log(`FAIL: ${fails}   WARN: ${warns}`)

  // ⚠️ Story 900-3c (OBS-6 do gate do @qa): este arquivo é RASTREADO **e** é a fixture de
  // `scripts/gate-tenancy-auditoria.test.ts`. Rodar o gate contra um ref que não seja
  // produção o reescreve com dados do ambiente errado e derruba a suíte — descoberto do
  // jeito caro na 900-3c. O `_aviso` viaja dentro do próprio arquivo para que quem abrir o
  // diff descubra antes, não depois.
  writeFileSync(
    REPORT_PATH,
    JSON.stringify(
      {
        _aviso: AVISO_DO_RELATORIO,
        geradoEm: new Date().toISOString(),
        fonte: schema.source,
        projectRef: schema.projectRef,
        totais: { violacoes: violacoes.length, fails, warns, porRegra },
        violacoes: violacoes.map((v) => ({ ...v, severity: severidade(v) })),
      },
      null,
      2,
    ) + "\n",
  )
  console.log(`\nRelatório JSON: ${REPORT_PATH}`)

  // ---- catraca (Story 900-2c) ------------------------------------------------
  const baseline = lerBaseline()
  const catraca = aplicarCatraca(violacoes, baseline)

  if (process.argv.includes("--write-baseline")) {
    const chaves = violacoes.filter((v) => severidade(v) === "FAIL").map(chaveDe).sort()
    writeFileSync(
      BASELINE_PATH,
      JSON.stringify(
        {
          _aviso:
            "Linha de base da dívida de isolamento. A catraca impede que o total suba e que " +
            "violação nova entre. Este arquivo só DESCE — abaixá-lo é o objetivo das Ondas 1-2. " +
            "Aumentá-lo à mão para acomodar dívida nova anula o mecanismo.",
          geradoEm: new Date().toISOString(),
          projectRef: schema.projectRef,
          total: chaves.length,
          porRegra,
          chaves,
        },
        null,
        2,
      ) + "\n",
    )
    console.log(`\nBaseline gravado: ${BASELINE_PATH} (${chaves.length} violações FAIL)`)
    console.log(RESSALVA_COBERTURA.split("\n").map((l) => `⚠️  ${l}`).join("\n"))
    return 0
  }

  console.log("\n── Catraca ──")
  if (baseline) {
    console.log(`baseline: ${baseline.total} FAIL (${baseline.geradoEm.slice(0, 10)})`)
    console.log(`agora:    ${fails} FAIL  (delta ${catraca.delta >= 0 ? "+" : ""}${catraca.delta})`)
    if (catraca.resolvidas.length) console.log(`resolvidas desde o baseline: ${catraca.resolvidas.length} ✅`)
  }
  if (catraca.ok) {
    console.log("catraca OK — nada subiu, nada novo entrou.")
  } else {
    for (const m of catraca.motivos) console.log(`CATRACA FALHOU — ${m}`)
    for (const v of catraca.novas.slice(0, 10)) console.log(`   nova: ${v.rule} ${v.table} — ${v.detail}`)
  }

  // ESTA RESSALVA NÃO É DECORATIVA — é exigência da AC6 e vale mesmo com o gate verde.
  console.log("\n" + RESSALVA_COBERTURA.split("\n").map((l) => `⚠️  ${l}`).join("\n"))

  /**
   * Exit code — e aqui a `900-2c` MUDA o comportamento cru da `900-2a`, de propósito.
   *
   * A AC9 da `900-2a` definiu "exit 1 se houver qualquer violação", e disse explicitamente
   * que "a camada de baseline/catraca que transforma isso é a `900-2c`". É esta a
   * transformação.
   *
   * Manter o exit atrelado à contagem bruta tornaria a catraca decorativa: o gate ficaria
   * permanentemente vermelho pelas 83 violações herdadas, e um PR que ACRESCENTASSE dívida
   * produziria exatamente o mesmo sinal de um PR que não mexeu em nada. Um alarme que toca
   * sempre não informa nada.
   *
   * Com baseline presente, portanto, quem manda é a catraca:
   *   • dívida conhecida e estável        → 0  (o PR não piorou nada)
   *   • total subiu / violação nova / R3   → 1  (regressão de verdade)
   *
   * Sem baseline (primeira execução, ou arquivo apagado), volta a valer a regra crua da
   * `900-2a` — nesse caso não há com o que comparar, e silenciar seria pior.
   *
   * O número absoluto continua impresso em toda execução: reduzi-lo é o objetivo das
   * Ondas 1-2, e ele não deixa de ser visível por não derrubar o build.
   */
  if (baseline) return catraca.ok ? 0 : 1
  return fails > 0 ? 1 : 0
}

if (process.argv[1]?.includes("gate-tenancy")) {
  main()
    .then((c) => process.exit(c))
    .catch((e) => {
      console.error(`\n${e instanceof Error ? e.message : e}`)
      process.exit(1)
    })
}
