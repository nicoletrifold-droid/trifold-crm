/**
 * Story 900-3 · AC4/AC5 — reset determinístico do Supabase de TESTE DE ISOLAMENTO.
 *
 * ⚠️ ESTE PROJETO NUNCA RECEBE DADO DE PRODUÇÃO. NUNCA.
 * ------------------------------------------------------
 * O banco que este script apaga e reconstrói existe para UMA coisa: rodar os testes
 * cross-tenant do Epic 900, que criam e apagam organizações inteiras para provar que
 * um tenant não enxerga o outro. Testes assim não podem rodar em produção — o risco de
 * um `DELETE` mal formado no teardown apagar dado real é exatamente o tipo de acidente
 * que o Epic 900 existe para eliminar, não para introduzir.
 *
 * Por consequência, e sem exceção:
 *   • NÃO copie, restaure ou importe dump de produção para cá — nem "só para depurar".
 *   • NÃO use este projeto para investigar dado real de cliente.
 *   • NÃO aponte `.env.local` para cá nem para o contrário.
 * Qualquer PII que apareça neste banco é vazamento, não conveniência.
 *
 * O QUE ELE FAZ
 * -------------
 * Reconstrói o schema do zero, na mesma ordem que `supabase db push` usaria
 * (lexicográfica por nome de arquivo), a partir de `supabase/migrations/*.sql`.
 * Reaplicar tudo é mais lento que truncate+reseed e foi escolhido de propósito: é a
 * única estratégia que também PROVA, a cada execução, que a sequência de migrations é
 * reproduzível. Essa prova é metade do valor da story.
 *
 * COMO RODAR
 *   npx tsx scripts/reset-tenancy-testdb.ts            # reset completo
 *   npx tsx scripts/reset-tenancy-testdb.ts --dry-run  # só mostra o plano
 *
 * ENV NECESSÁRIAS (nomes, nunca valores, vivem no repositório)
 *   TENANCY_TEST_SUPABASE_URL         https://<ref>.supabase.co  — define o alvo
 *   SUPABASE_MANAGEMENT_PAT           PAT da Management API (executa o SQL)
 *   TENANCY_TEST_SUPABASE_SERVICE_ROLE_KEY   usada só para esvaziar buckets
 *
 * DUAS ARMADILHAS APURADAS NA EXECUÇÃO DE 05/08/2026 — não as redescubra
 * ---------------------------------------------------------------------
 * 1. A Management API roda O ARQUIVO INTEIRO numa transação implícita. Migration que faz
 *    `ALTER TYPE ... ADD VALUE` e usa o valor novo no mesmo arquivo estoura ERRCODE 55P04.
 *    O `db push` de verdade usa psql em AUTOCOMMIT POR STATEMENT. Por isso existe o
 *    fallback statement-a-statement: sem ele, 5 arquivos falham por artefato do método e
 *    parecem defeito de migration. Já aconteceu.
 * 2. `DROP SCHEMA public CASCADE` NÃO remove policies de `storage.objects`, e
 *    `DELETE FROM storage.objects` é bloqueado por `storage.protect_delete()`. Sem
 *    derrubar as policies e esvaziar os buckets pela Storage API, as migrations 065 e 099
 *    falham com "policy already exists" — de novo, artefato do reset, não bug.
 *
 * FALHAS ESPERADAS (conhecidas, não são regressão)
 * ------------------------------------------------
 * `025_phone_normalization_part2.sql` e seu `_remote_only` recriam um índice que
 * `021_phone_normalization_part2.sql` já criou, sem `IF NOT EXISTS` — são a mesma
 * migration renumerada sem remover a antiga. O script as reporta como CONHECIDA.
 * Falha FORA dessa lista é regressão e derruba o processo com exit 1.
 */

import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

/** Refs que este script se recusa a tocar, aconteça o que acontecer. */
const REFS_PROIBIDOS = new Set(["dsopqkqjkmhytudaaolv"])

/** Falhas já diagnosticadas, com causa conhecida. Não derrubam o reset. */
const FALHAS_CONHECIDAS = new Map<string, string>([
  [
    "025_phone_normalization_part2.sql",
    "recria idx_leads_org_phone_normalized_unique que 021_phone_normalization_part2.sql já criou (sem IF NOT EXISTS)",
  ],
  [
    "025_phone_normalization_part2_remote_only.sql",
    "mesma duplicação da 025 acima",
  ],
  [
    "223_properties_nicole_enabled.sql",
    "backfill da Story 87-13 com guard de 'EXATAMENTE 2 linhas' em properties — são 2 empreendimentos REAIS de produção, que não existem num banco reconstruído do zero",
  ],
  [
    "224_properties_restaura_is_active.sql",
    "mesmo backfill de produção da 223 (par expand/restore)",
  ],
])

/**
 * NOTA sobre 223/224 — é achado, não ruído.
 * Essas migrations abortam de propósito quando o backfill não afeta o número esperado de
 * linhas, o que é um bom guard em produção e as torna INAPLICÁVEIS a um banco vazio.
 * O padrão vai se repetir: toda migration que faz backfill de dado real com guard de
 * contagem é, por construção, não-reproduzível do zero. Para o Epic 900 isso importa
 * porque `provision_org()` (900-21) precisa semear uma org nova SEM depender de nenhum
 * backfill histórico — se depender, provisionar cliente novo quebra pelo mesmo motivo.
 */

/**
 * A organização default NÃO é criada por nenhuma migration — ela foi semeada à mão em
 * produção em 01/04/2026. Sem ela, `011_noshow_stage` e `063_add_proposta_represamento_stages`
 * falham com violação de FK, porque inserem em `kanban_stages` com este `org_id` fixo.
 * Semeamos logo depois do schema base para que o banco reconstruído seja FUNCIONAL.
 * Isto é uma muleta consciente: o FR-11 do Epic 900 existe para acabar com o UUID fixo.
 */
const ORG_DEFAULT_ID = "00000000-0000-0000-0000-000000000001"
const SEED_APOS = "001_base_schema.sql"

const MIG_DIR = join(process.cwd(), "supabase", "migrations")
const DRY_RUN = process.argv.includes("--dry-run")

function exigirEnv(nome: string): string {
  const v = process.env[nome]
  if (!v || !v.trim()) {
    throw new Error(
      `Env ${nome} ausente ou vazia. Nunca grave secret por pipe/stdin — o valor vazio passa em silêncio (NFR-10).`,
    )
  }
  return v.trim()
}

/** Deriva o project ref da URL e recusa qualquer ref de produção. */
function resolverAlvo(): string {
  const url = exigirEnv("TENANCY_TEST_SUPABASE_URL")
  const m = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/i)
  if (!m) throw new Error(`TENANCY_TEST_SUPABASE_URL malformada: ${url}`)
  const ref = m[1]
  if (REFS_PROIBIDOS.has(ref)) {
    throw new Error(`ABORTADO: ${ref} é PRODUÇÃO. Este script nunca a toca.`)
  }
  return ref
}

async function runSql(ref: string, pat: string, sql: string): Promise<{ ok: boolean; msg: string }> {
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
  const msg = (await r.text()).slice(0, 800)
  return { ok: r.ok, msg }
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

async function limparStorage(ref: string, pat: string): Promise<void> {
  const srk = exigirEnv("TENANCY_TEST_SUPABASE_SERVICE_ROLE_KEY")
  const base = `https://${ref}.supabase.co/storage/v1`
  const h = { apikey: srk, Authorization: `Bearer ${srk}` }

  const r = await fetch(`${base}/bucket`, { headers: h })
  if (r.ok) {
    const buckets = (await r.json()) as Array<{ id: string }>
    for (const b of buckets) {
      await fetch(`${base}/bucket/${b.id}/empty`, { method: "POST", headers: h })
      await fetch(`${base}/bucket/${b.id}`, { method: "DELETE", headers: h })
      console.log(`  bucket removido: ${b.id}`)
    }
  }

  // policies de storage sobrevivem ao DROP SCHEMA public — ver armadilha 2 no topo
  await runSql(ref, pat, `
do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies where schemaname='storage'
  loop
    execute format('drop policy if exists %I on storage.%I', p.policyname, p.tablename);
  end loop;
end $$;`)
}

async function resetarSchema(ref: string, pat: string): Promise<void> {
  const { ok, msg } = await runSql(ref, pat, `
drop schema if exists public cascade;
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
delete from supabase_migrations.schema_migrations;`)
  if (!ok) throw new Error(`Falha ao resetar schema: ${msg}`)
}

async function main(): Promise<number> {
  const ref = resolverAlvo()
  const pat = exigirEnv("SUPABASE_MANAGEMENT_PAT")

  const arquivos = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort()
  console.log(`Alvo: ${ref} (NUNCA produção)`)
  console.log(`${arquivos.length} migrations, ordem lexicográfica\n`)

  if (DRY_RUN) {
    console.log("--dry-run: nada foi executado.")
    console.log(`Primeira: ${arquivos[0]}\nÚltima:   ${arquivos[arquivos.length - 1]}`)
    console.log(`Seed da org default depois de: ${SEED_APOS}`)
    return 0
  }

  console.log("Limpando storage...")
  await limparStorage(ref, pat)
  console.log("Resetando schema public...")
  await resetarSchema(ref, pat)

  let okInteiro = 0
  const okSplit: string[] = []
  const conhecidas: string[] = []
  const regressoes: Array<{ arquivo: string; erro: string }> = []

  for (const [idx, nome] of arquivos.entries()) {
    const sql = readFileSync(join(MIG_DIR, nome), "utf-8")
    if (!sql.trim()) continue

    let r = await runSql(ref, pat, sql)

    if (!r.ok) {
      // fallback autocommit — ver armadilha 1 no topo
      const stmts = splitStatements(sql)
      const erros: string[] = []
      for (const st of stmts) {
        const s = await runSql(ref, pat, st)
        if (!s.ok) erros.push(s.msg)
      }
      if (erros.length === 0) {
        okSplit.push(nome)
        r = { ok: true, msg: "" }
      } else if (FALHAS_CONHECIDAS.has(nome)) {
        conhecidas.push(nome)
        console.log(`[${idx + 1}/${arquivos.length}] CONHECIDA ${nome} — ${FALHAS_CONHECIDAS.get(nome)}`)
      } else {
        regressoes.push({ arquivo: nome, erro: erros[0] })
        console.error(`[${idx + 1}/${arquivos.length}] REGRESSÃO ${nome}`)
        console.error(`    ${erros[0].slice(0, 300)}`)
      }
    } else {
      okInteiro++
    }

    if (nome === SEED_APOS) {
      const seed = await runSql(ref, pat,
        `insert into organizations (id, name, slug) values ('${ORG_DEFAULT_ID}', 'Org de Teste — Epic 900', 'org-teste-epic-900')
         on conflict (id) do nothing;`)
      console.log(seed.ok ? `  seed da org default aplicado (depois de ${SEED_APOS})` : `  AVISO: seed falhou — ${seed.msg.slice(0, 200)}`)
    }
  }

  console.log("\n=== RESUMO ===")
  console.log(`OK (arquivo inteiro):   ${okInteiro}`)
  console.log(`OK (autocommit split):  ${okSplit.length}${okSplit.length ? ` — ${okSplit.join(", ")}` : ""}`)
  console.log(`Falhas CONHECIDAS:      ${conhecidas.length}`)
  console.log(`REGRESSÕES:             ${regressoes.length}`)

  if (regressoes.length) {
    console.error("\nRegressões (falha fora da lista conhecida):")
    for (const g of regressoes) console.error(`  - ${g.arquivo}`)
    return 1
  }
  console.log("\nBanco de teste reconstruído.")
  return 0
}

if (process.argv[1]?.includes("reset-tenancy-testdb")) {
  main().then((c) => process.exit(c)).catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
