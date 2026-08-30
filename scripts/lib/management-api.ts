/**
 * Story 900-3c · AC2 — o transporte SQL da Management API, numa implementação só.
 *
 * ## Extração, não duplicação — e a razão é o conhecimento caro, não a estética
 *
 * `runSql()` e `splitStatements()` nasceram dentro de `scripts/reset-tenancy-testdb.ts`
 * (Story 900-3, linhas 252 e 268 antes desta extração). `pnpm db:status` e `pnpm db:apply`
 * precisam exatamente do mesmo transporte. Copiar seria barato hoje e caro na primeira vez
 * que uma das cópias aprendesse algo que a outra não aprendeu — e as duas já carregam
 * conhecimento que custou uma execução real para descobrir:
 *
 *   • **`User-Agent` obrigatório.** Sem um `User-Agent` explícito, o WAF da Supabase responde
 *     `error code: 1010` — HTML, não JSON, com status de erro genérico. Levou uma sessão de
 *     depuração para achar. Se uma cópia perdesse o header, o sintoma seria "a Management API
 *     está fora do ar".
 *   • **O fallback statement-a-statement.** A Management API roda o arquivo inteiro numa
 *     transação implícita; `supabase db push` usa psql em AUTOCOMMIT POR STATEMENT. Migration
 *     que faz `ALTER TYPE … ADD VALUE` e usa o valor novo no mesmo arquivo estoura `55P04` por
 *     artefato do método, não por defeito. `splitStatements` existe para dividir o arquivo
 *     respeitando strings, dollar-quotes e comentários — cinco arquivos deste repositório
 *     dependem disso para aplicar.
 *
 * ## O que NÃO foi unificado, de propósito
 *
 * `scripts/gate-tenancy.ts` tem uma função **homônima** `runSql<T>(sql, pat)` — assinatura
 * diferente (`(sql, pat)` contra `(ref, pat, sql)`), transporte diferente, de outra story
 * (900-2a). Ela introspecciona schema; esta aplica DDL. Unificá-las acoplaria dois mecanismos
 * que servem propósitos diferentes, e está explicitamente fora do escopo da 900-3c.
 */

/** Resposta do endpoint de query da Management API. */
export interface RespostaSql {
  ok: boolean
  msg: string
}

/**
 * Limite de `msg` do `runSql`. Herdado do `reset-tenancy-testdb.ts`, onde `msg` é
 * mensagem de erro para log: 267 execuções × corpo inteiro afogariam a saída.
 */
const LIMITE_PADRAO_DA_MSG = 800

/**
 * Executa SQL no projeto `ref` via Management API. **Trunca a resposta em 800 caracteres.**
 *
 * ⚠️ O header `User-Agent` não é decorativo: sem ele o WAF responde `error code: 1010`.
 *
 * ⚠️ **Não use esta função para LER dados.** O truncamento é adequado para mensagem de erro
 * e para consulta de uma linha, mas corta o JSON no meio quando o resultado é grande — e o
 * sintoma é "a tabela existe mas a leitura falhou", que parece problema de banco e é
 * problema de transporte. Foi exatamente isso que aconteceu ao ler o ledger de 268 linhas na
 * Story 900-3c. Para ler, use `runSqlJson`, que não trunca.
 */
export async function runSql(ref: string, pat: string, sql: string): Promise<RespostaSql> {
  const r = await runSqlBruto(ref, pat, sql)
  return { ok: r.ok, msg: r.msg.slice(0, LIMITE_PADRAO_DA_MSG) }
}

/** Como `runSql`, mas devolve o corpo INTEIRO da resposta. */
export async function runSqlBruto(ref: string, pat: string, sql: string): Promise<RespostaSql> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${pat}`,
      "Content-Type": "application/json",
      // sem User-Agent explícito o WAF responde "error code: 1010"
      "User-Agent": "trifold-tenancy-reset",
    },
    body: JSON.stringify({ query: sql }),
  })
  return { ok: r.ok, msg: await r.text() }
}

/**
 * `runSqlBruto` + `JSON.parse` da resposta, para as consultas de leitura.
 *
 * Devolve `null` quando a chamada falhou OU quando o corpo não é JSON — os dois casos são
 * "não consegui ler", e quem chama precisa distinguir isso de "li e veio vazio" (`[]`).
 * Nunca lança: o chamador decide o que fazer com `null`.
 *
 * `msg` volta truncada, porque quem a consome a usa para mensagem de erro; as linhas
 * parseadas vêm do corpo inteiro.
 */
export async function runSqlJson<T>(
  ref: string,
  pat: string,
  sql: string,
): Promise<{ linhas: T[] | null; msg: string }> {
  const r = await runSqlBruto(ref, pat, sql)
  const msg = r.msg.slice(0, LIMITE_PADRAO_DA_MSG)
  if (!r.ok) return { linhas: null, msg }
  try {
    const parsed = JSON.parse(r.msg) as T[]
    return { linhas: Array.isArray(parsed) ? parsed : null, msg }
  } catch {
    return { linhas: null, msg }
  }
}

/** Escapa uma string para literal SQL (`'…'`), dobrando aspas simples. */
export function citarLiteral(valor: string): string {
  return `'${valor.replace(/'/g, "''")}'`
}

/** Divide SQL em statements de topo, respeitando strings, dollar-quotes e comentários. */
export function splitStatements(sql: string): string[] {
  const out: string[] = []
  let buf = ""
  let i = 0
  let inS = false
  let inD = false
  let inLineC = false
  let inBlockC = false
  let dollarTag: string | null = null

  while (i < sql.length) {
    const c = sql[i]
    const n2 = sql.slice(i, i + 2)

    if (inLineC) { buf += c; if (c === "\n") inLineC = false; i++; continue }
    if (inBlockC) { if (n2 === "*/") { buf += n2; i += 2; inBlockC = false; continue } buf += c; i++; continue }
    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) { buf += dollarTag; i += dollarTag.length; dollarTag = null; continue }
      buf += c; i++; continue
    }
    if (inS) { buf += c; if (c === "'") inS = false; i++; continue }
    if (inD) { buf += c; if (c === '"') inD = false; i++; continue }

    if (n2 === "--") { inLineC = true; buf += n2; i += 2; continue }
    if (n2 === "/*") { inBlockC = true; buf += n2; i += 2; continue }
    if (c === "'") { inS = true; buf += c; i++; continue }
    if (c === '"') { inD = true; buf += c; i++; continue }
    if (c === "$") {
      const j = sql.indexOf("$", i + 1)
      if (j !== -1) {
        const corpo = sql.slice(i + 1, j)
        if (corpo === "" || /^[A-Za-z0-9_]+$/.test(corpo)) {
          dollarTag = sql.slice(i, j + 1)
          buf += dollarTag
          i = j + 1
          continue
        }
      }
    }
    if (c === ";") {
      buf += c
      if (buf.replace(/;/g, "").trim()) out.push(buf.trim())
      buf = ""
      i++
      continue
    }
    buf += c
    i++
  }
  if (buf.replace(/;/g, "").trim()) out.push(buf.trim())
  return out
}
