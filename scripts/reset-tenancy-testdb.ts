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
 * COMO RODAR (Story 900-3b · AC5 — o default INVERTEU)
 *   pnpm reset:testdb                # DRY-RUN: mostra o plano e NÃO apaga nada
 *   pnpm reset:testdb --confirmar    # destrói e reconstrói de verdade
 *
 * Antes da 900-3b, rodar sem flag nenhuma DESTRUÍA o banco. Como o `pnpm dev` passou a
 * apontar para este mesmo projeto, o custo de um engano subiu: o default agora é o
 * inofensivo, e destruir exige dizer `--confirmar` em voz alta. `--dry-run` continua
 * aceito como sinônimo explícito do default.
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

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { REFS_PERMITIDOS_PRODUCAO } from "./lib/db-env"

/**
 * Story 900-3b · AC3/AC5 — allowlist no lugar da denylist.
 *
 * Aqui existia `REFS_PROIBIDOS = new Set(["dsopqkqjkmhytudaaolv"])`: uma denylist de
 * tamanho 1, que falha **aberta** — um projeto de produção criado amanhã não estaria nela
 * e passaria. `REFS_PERMITIDOS_PRODUCAO` (de `scripts/lib/db-env.ts`) é a MESMA definição
 * de "o que é produção" usada por todos os outros scripts: uma implementação só.
 */
function ehProducao(ref: string): boolean {
  return REFS_PERMITIDOS_PRODUCAO.has(ref)
}

/**
 * Story 900-3b · AC6 — `FALHAS_CONHECIDAS` deixou de ser `Map<string, string>`.
 *
 * Um motivo em texto livre não diz **por quanto tempo** a exceção é aceitável nem **de que
 * tipo** ela é. Sem `classe`, "backfill de dado real" (que nunca vai aplicar num banco
 * novo, e é permanente) fica indistinguível de "duplicata de prefixo" (que é dívida a
 * pagar). Sem `revisar_em`, a lista só cresce.
 */
type ClasseDeFalha = "duplicata-de-prefixo" | "backfill-de-dado-real" | "artefato-do-metodo"

interface FalhaConhecida {
  motivo: string
  classe: ClasseDeFalha
  desde: string
  revisar_em: string
}

/** Teto: acima disto o reset sai 1. Lista de exceções que só cresce vira lista vazia. */
const TETO_FALHAS_CONHECIDAS = 6

/** Falhas já diagnosticadas, com causa conhecida. Não derrubam o reset. */
const FALHAS_CONHECIDAS = new Map<string, FalhaConhecida>([
  [
    "025_phone_normalization_part2.sql",
    {
      motivo:
        "recria idx_leads_org_phone_normalized_unique que 021_phone_normalization_part2.sql já criou (sem IF NOT EXISTS)",
      classe: "duplicata-de-prefixo",
      desde: "2026-08-05",
      revisar_em: "2026-11-05",
    },
  ],
  [
    "025_phone_normalization_part2_remote_only.sql",
    {
      motivo: "mesma duplicação da 025 acima",
      classe: "duplicata-de-prefixo",
      desde: "2026-08-05",
      revisar_em: "2026-11-05",
    },
  ],
  [
    "223_properties_nicole_enabled.sql",
    {
      motivo:
        "backfill da Story 87-13 com guard de 'EXATAMENTE 2 linhas' em properties — são 2 empreendimentos REAIS de produção, que não existem num banco reconstruído do zero",
      classe: "backfill-de-dado-real",
      desde: "2026-08-05",
      revisar_em: "2027-02-05",
    },
  ],
  [
    "224_properties_restaura_is_active.sql",
    {
      motivo: "mesmo backfill de produção da 223 (par expand/restore)",
      classe: "backfill-de-dado-real",
      desde: "2026-08-05",
      revisar_em: "2027-02-05",
    },
  ],
])

/**
 * Story 900-3b · AC6 — asserções de estado, rodadas DEPOIS do arquivo indicado.
 *
 * Predicados ancorados por `id`, não por `slug` sozinho. O predicado único que a v0.2
 * propunha (`EXISTS (… slug='no-show' …)`) tinha dois defeitos, e o `@po` traçou os dois:
 *
 *  - Ele **reprova uma execução saudável da `236`**: a `236` §2.1 renomeia a linha `…0009`
 *    de `no-show` para `atendimento`, e a §2.2 insere `…0011` como `no-show-real`. Logo
 *    depois da `236`, NENHUMA linha tem `slug='no-show'`.
 *  - Ele é **colinear na `237`**: passaria mesmo que a `237` não fizesse nada, desde que a
 *    §2.1 da `236` não tivesse disparado (aí `…0009` ainda teria `slug='no-show'`).
 *
 * Ancorar por `id` mata os dois. E cada `EXISTS` tem modo de falha próprio: se a §2.1 não
 * disparar, o segundo cai; se a §2.2 não inserir, o primeiro cai.
 *
 * ⚠️ S10 — vermelho aqui pode ser efeito UPSTREAM, não defeito da asserção. Se
 * `011_noshow_stage.sql` falhar por violação de FK (cenário documentado em
 * `scripts/README.md`: a linha `…0009` não existe sem a org default semeada), o predicado
 * da `236` fica vermelho sem que a `236` tenha errado nada. Ao ler o resultado, cheque
 * primeiro se a `011` aplicou.
 */
const ASSERCOES = new Map<string, string>([
  [
    "236_noshow_etapa_propria.sql",
    `select (
       exists (select 1 from kanban_stages
               where id = '00000000-0000-0000-0001-000000000011'
                 and slug = 'no-show-real' and type = 'no_show')
       and exists (select 1 from kanban_stages
               where id = '00000000-0000-0000-0001-000000000009'
                 and slug = 'atendimento')
     ) as ok;`,
  ],
  [
    "237_slug_noshow_limpo.sql",
    `select exists (select 1 from kanban_stages
             where id = '00000000-0000-0000-0001-000000000011'
               and slug = 'no-show') as ok;`,
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

/**
 * Story 900-3b · AC5 — o default é o inofensivo.
 * Destruir exige `--confirmar` explícito; qualquer outra invocação é dry-run.
 */
const CONFIRMADO = process.argv.includes("--confirmar")
const DRY_RUN = !CONFIRMADO

/** Onde vai a medição de duração (S6/S13: **gitignored por default**). */
const ARQ_DURACAO = join(process.cwd(), "docs", "audits", "reset-testdb-duracao.json")

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
  if (ehProducao(ref)) {
    throw new Error(
      `ABORTADO: ${ref} está em REFS_PERMITIDOS_PRODUCAO (scripts/lib/db-env.ts), ou seja, ` +
        `é PRODUÇÃO. Este script nunca a toca.`,
    )
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

/**
 * Story 900-3b · AC5 — a confirmação carrega INFORMAÇÃO.
 *
 * "Tem certeza? [s/N]" não informa nada: quem já decidiu digitar o comando vai dizer sim.
 * O que faz alguém parar é ver que o banco que está prestes a sumir tem 8.000 leads e um
 * `created_at` de dez minutos atrás. Estes números são lidos ANTES de qualquer destruição.
 */
async function retratoAntesDeDestruir(ref: string, pat: string): Promise<void> {
  const consultas: Array<[string, string]> = [
    ["organizations", "select count(*)::int as v from organizations;"],
    ["leads", "select count(*)::int as v from leads;"],
    ["leads.max(created_at)", "select coalesce(max(created_at)::text, '(nenhum)') as v from leads;"],
  ]
  console.log("\n--- O QUE SERÁ DESTRUÍDO ---")
  console.log(`  projeto-alvo: ${ref}`)
  for (const [rotulo, sql] of consultas) {
    const r = await runSql(ref, pat, sql)
    // Banco já vazio/sem a tabela não é erro aqui: o retrato é informativo, não um gate.
    let valor = "(indisponível)"
    if (r.ok) {
      try {
        const linhas = JSON.parse(r.msg) as Array<{ v: unknown }>
        valor = String(linhas[0]?.v ?? "(vazio)")
      } catch {
        valor = "(resposta não-JSON)"
      }
    }
    console.log(`  ${rotulo.padEnd(22)} ${valor}`)
  }
  console.log("----------------------------\n")
}

interface MedicaoDeDuracao {
  arquivo: string
  ms: number
}

function percentil(ordenado: number[], p: number): number {
  if (ordenado.length === 0) return 0
  const i = Math.min(ordenado.length - 1, Math.ceil((p / 100) * ordenado.length) - 1)
  return ordenado[Math.max(0, i)] ?? 0
}

/**
 * Story 900-3b · AC5 — medição de duração por arquivo.
 *
 * **Teto que AVISA, não que falha** — a story é explícita em não introduzir timeout duro
 * aqui. Um reset lento é informação; derrubar o reset por lentidão transformaria a única
 * ferramenta de reconstrução num gate instável.
 *
 * Default S6/S13: o arquivo é **gitignored**. `docs/audits/` é diretório rastreado e a
 * precedência da casa é rastrear, então a não-decisão já seria uma decisão — este arquivo
 * é regravado a cada execução e geraria churn em todo PR que rodasse o reset. Rastreá-lo
 * exige decisão explícita registrada no Dev Agent Record, com o diff medido.
 */
function gravarDuracoes(ref: string, medicoes: MedicaoDeDuracao[], totalMs: number): void {
  const ordenado = medicoes.map((m) => m.ms).sort((a, b) => a - b)
  const relatorio = {
    gerado_em: new Date().toISOString(),
    projeto_ref: ref,
    total_ms: totalMs,
    arquivos_medidos: medicoes.length,
    p50_ms: percentil(ordenado, 50),
    p95_ms: percentil(ordenado, 95),
    top_10_mais_lentas: [...medicoes].sort((a, b) => b.ms - a.ms).slice(0, 10),
  }
  mkdirSync(join(process.cwd(), "docs", "audits"), { recursive: true })
  writeFileSync(ARQ_DURACAO, JSON.stringify(relatorio, null, 2) + "\n")
  console.log(
    `\nDuração: total ${(totalMs / 1000).toFixed(1)}s · p50 ${relatorio.p50_ms}ms · ` +
      `p95 ${relatorio.p95_ms}ms → ${ARQ_DURACAO}`,
  )
  const maisLenta = relatorio.top_10_mais_lentas[0]
  if (maisLenta && maisLenta.ms > 30_000) {
    console.warn(
      `AVISO (não falha): ${maisLenta.arquivo} levou ${(maisLenta.ms / 1000).toFixed(1)}s.`,
    )
  }
}

async function main(): Promise<number> {
  const ref = resolverAlvo()
  const pat = exigirEnv("SUPABASE_MANAGEMENT_PAT")

  // Teto de exceções — checado ANTES de qualquer trabalho, para a mensagem ser sobre a
  // lista e não sobre uma migration.
  if (FALHAS_CONHECIDAS.size > TETO_FALHAS_CONHECIDAS) {
    console.error(
      `ABORTADO: FALHAS_CONHECIDAS tem ${FALHAS_CONHECIDAS.size} entradas, acima do teto ` +
        `de ${TETO_FALHAS_CONHECIDAS}. Uma lista de exceções que só cresce é uma lista vazia.`,
    )
    return 1
  }

  const arquivos = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort()
  console.log(`Alvo: ${ref} (NUNCA produção)`)
  console.log(`${arquivos.length} migrations, ordem lexicográfica`)

  if (DRY_RUN) {
    console.log("\nDRY-RUN (default desde a Story 900-3b): NADA foi executado.")
    console.log(`Primeira: ${arquivos[0]}\nÚltima:   ${arquivos[arquivos.length - 1]}`)
    console.log(`Seed da org default depois de: ${SEED_APOS}`)
    console.log(`Falhas conhecidas cadastradas: ${FALHAS_CONHECIDAS.size}/${TETO_FALHAS_CONHECIDAS}`)
    console.log(`Asserções de estado: ${[...ASSERCOES.keys()].join(", ")}`)
    await retratoAntesDeDestruir(ref, pat)
    console.log("Para destruir e reconstruir de verdade: pnpm reset:testdb --confirmar")
    return 0
  }

  await retratoAntesDeDestruir(ref, pat)

  console.log("Limpando storage...")
  await limparStorage(ref, pat)
  console.log("Resetando schema public...")
  await resetarSchema(ref, pat)

  let okInteiro = 0
  const okSplit: string[] = []
  const conhecidas: string[] = []
  const regressoes: Array<{ arquivo: string; erro: string }> = []
  const conhecidasQueNaoFalharam: string[] = []
  const assercoesFalhas: Array<{ arquivo: string; detalhe: string }> = []
  const medicoes: MedicaoDeDuracao[] = []
  const inicioTotal = Date.now()

  for (const [idx, nome] of arquivos.entries()) {
    const sql = readFileSync(join(MIG_DIR, nome), "utf-8")
    if (!sql.trim()) continue

    const t0 = Date.now()
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
        const f = FALHAS_CONHECIDAS.get(nome)!
        console.log(
          `[${idx + 1}/${arquivos.length}] CONHECIDA ${nome} [${f.classe}] — ${f.motivo}`,
        )
      } else {
        regressoes.push({ arquivo: nome, erro: erros[0] })
        console.error(`[${idx + 1}/${arquivos.length}] REGRESSÃO ${nome}`)
        console.error(`    ${erros[0].slice(0, 300)}`)
      }
    } else {
      okInteiro++
      // AC6 — VERIFICAÇÃO NOS DOIS SENTIDOS. Uma conhecida que PAROU de falhar também é
      // sinal: ou a migration foi consertada (e a entrada tem de sair da lista), ou
      // alguém pré-adicionou uma migration saudável para o reset fechar. Nos dois casos o
      // reset sai ≠ 0 nomeando-a — o pré-adicionar não depende de ninguém reparar.
      if (FALHAS_CONHECIDAS.has(nome)) conhecidasQueNaoFalharam.push(nome)
    }

    medicoes.push({ arquivo: nome, ms: Date.now() - t0 })

    // AC6 — asserção de estado, rodada logo DEPOIS do arquivo indicado.
    const assercao = ASSERCOES.get(nome)
    if (assercao) {
      const a = await runSql(ref, pat, assercao)
      let passou = false
      if (a.ok) {
        try {
          passou = (JSON.parse(a.msg) as Array<{ ok: boolean }>)[0]?.ok === true
        } catch {
          passou = false
        }
      }
      if (passou) {
        console.log(`    ✓ asserção de estado após ${nome}`)
      } else {
        assercoesFalhas.push({ arquivo: nome, detalhe: a.ok ? a.msg.slice(0, 300) : a.msg.slice(0, 300) })
        console.error(`    ✗ ASSERÇÃO FALHOU após ${nome}`)
        console.error(`      ${a.msg.slice(0, 300)}`)
      }
    }

    if (nome === SEED_APOS) {
      const seed = await runSql(ref, pat,
        `insert into organizations (id, name, slug) values ('${ORG_DEFAULT_ID}', 'Org de Teste — Epic 900', 'org-teste-epic-900')
         on conflict (id) do nothing;`)
      console.log(seed.ok ? `  seed da org default aplicado (depois de ${SEED_APOS})` : `  AVISO: seed falhou — ${seed.msg.slice(0, 200)}`)
    }
  }

  const totalMs = Date.now() - inicioTotal

  console.log("\n=== RESUMO ===")
  console.log(`OK (arquivo inteiro):   ${okInteiro}`)
  console.log(`OK (autocommit split):  ${okSplit.length}${okSplit.length ? ` — ${okSplit.join(", ")}` : ""}`)
  console.log(`Falhas CONHECIDAS:      ${conhecidas.length}`)
  console.log(`REGRESSÕES:             ${regressoes.length}`)
  console.log(`Asserções que falharam: ${assercoesFalhas.length}`)
  console.log(`Conhecidas que NÃO falharam: ${conhecidasQueNaoFalharam.length}`)

  gravarDuracoes(ref, medicoes, totalMs)

  let codigo = 0

  if (regressoes.length) {
    console.error("\nRegressões (falha fora da lista conhecida):")
    for (const g of regressoes) console.error(`  - ${g.arquivo}`)
    codigo = 1
  }

  // AC6 — o outro sentido da verificação.
  if (conhecidasQueNaoFalharam.length) {
    console.error(
      "\nEntradas de FALHAS_CONHECIDAS que APLICARAM COM SUCESSO — a lista está mentindo:",
    )
    for (const n of conhecidasQueNaoFalharam) {
      console.error(`  - ${n} (classe: ${FALHAS_CONHECIDAS.get(n)?.classe})`)
    }
    console.error(
      "  Ou a migration foi consertada e a entrada deve SAIR da lista, ou ela foi " +
        "pré-adicionada sem medição. Nos dois casos, corrija a lista.",
    )
    codigo = 1
  }

  if (assercoesFalhas.length) {
    console.error("\nAsserções de estado que falharam:")
    for (const a of assercoesFalhas) console.error(`  - ${a.arquivo}: ${a.detalhe}`)
    console.error(
      "  ⚠️ S10: cheque primeiro se 011_noshow_stage.sql aplicou. Se a org default não foi " +
        "semeada, a linha …0009 não existe e o predicado da 236 fica vermelho SEM que a " +
        "236 tenha errado — a causa é upstream.",
    )
    codigo = 1
  }

  if (codigo === 0) console.log("\nBanco de teste reconstruído.")
  return codigo
}

if (process.argv[1]?.includes("reset-tenancy-testdb")) {
  main().then((c) => process.exit(c)).catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
