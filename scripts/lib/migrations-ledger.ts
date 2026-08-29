/**
 * Story 900-3c · AC1/AC2 — a lógica compartilhada por `pnpm db:status` e `pnpm db:apply`.
 *
 * ## O que este módulo decide, e o que ele deliberadamente NÃO decide
 *
 * Ele responde a uma pergunta só: **para cada arquivo de `supabase/migrations/`, qual é o
 * estado dele em relação ao ledger `trifold_migrations_aplicadas` deste banco?** Quatro
 * estados, e a fronteira entre eles é o `sha256`:
 *
 *   • `aplicada`             — está no ledger e o hash do arquivo em disco bate.
 *   • `PENDENTE`             — não está no ledger.
 *   • `ALTERADA-APÓS-APLICAR`— está no ledger e o hash **não** bate: o arquivo mudou depois
 *                              de ter sido aplicado. É o caso mais perigoso dos quatro, e é
 *                              o único que bloqueia `db:apply` inteiro.
 *   • `ÓRFÃ-no-banco`        — está no ledger e o arquivo não existe mais em disco.
 *
 * Ele **não** decide exit code, não imprime relatório e não pergunta nada ao operador. Isso é
 * dos dois CLIs — e é o que permite que `db:status` seja relatório (sai 0 com qualquer
 * veredito de conteúdo) e `db:apply` seja gate (sai 1 com `ALTERADA-APÓS-APLICAR`) sem que os
 * dois divirjam sobre o que cada estado significa.
 *
 * ## O espelho em `docs/audits/migrations-aplicadas.json` é chaveado por ambiente
 *
 * Um arquivo só, dois ambientes. Sem a chave por ambiente, rodar `db:status` contra teste
 * sobrescreveria o retrato de produção no diff do PR — e o diff é a razão de o arquivo
 * existir (o banco é a verdade; o JSON é o que aparece na revisão). `gravarEspelho()` lê o
 * arquivo, troca **só** a chave do ambiente corrente e regrava.
 *
 * `aplicada_em` **não** entra no espelho de propósito: ele muda a cada `reset:testdb` e
 * produziria um diff de 268 linhas em todo PR que rodasse o reset, afogando a informação que
 * interessa (mudou de estado? mudou de hash?). O timestamp continua no banco, que é a fonte.
 */

import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { citarLiteral, runSqlJson } from "./management-api"
import type { Ambiente } from "./db-env"

export const TABELA_LEDGER = "trifold_migrations_aplicadas"

/** Onde o runbook de aplicação manual mora — citado em toda mensagem de tabela ausente. */
export const RUNBOOK = "docs/runbooks/aplicar-245-registro-migrations.md"

export const DIR_MIGRATIONS = join(process.cwd(), "supabase", "migrations")

const ARQ_ESPELHO = join(process.cwd(), "docs", "audits", "migrations-aplicadas.json")

export type EstadoDeMigration =
  | "aplicada"
  | "PENDENTE"
  | "ALTERADA-APÓS-APLICAR"
  | "ÓRFÃ-no-banco"

export interface LinhaDoLedger {
  arquivo: string
  sha256: string
  aplicada_em: string
  via: string
}

export interface VereditoDeArquivo {
  arquivo: string
  estado: EstadoDeMigration
  /** Hash do arquivo em disco. `null` para `ÓRFÃ-no-banco` (não há arquivo). */
  sha256_local: string | null
  /** Hash registrado no banco. `null` para `PENDENTE` (não há registro). */
  sha256_registrado: string | null
  via: string | null
}

export interface Relatorio {
  ambiente: Ambiente
  ref: string
  gerado_em: string
  vereditos: VereditoDeArquivo[]
  totais: Record<EstadoDeMigration, number>
}

/** SHA-256 hex do conteúdo do arquivo, byte a byte (sem normalizar quebra de linha). */
export function sha256Do(conteudo: Buffer | string): string {
  return createHash("sha256").update(conteudo).digest("hex")
}

/** Nomes dos `.sql` de `supabase/migrations/`, em ordem lexicográfica — a mesma do reset. */
export function listarArquivosDeMigration(): string[] {
  return readdirSync(DIR_MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
}

export function lerMigration(arquivo: string): string {
  return readFileSync(join(DIR_MIGRATIONS, arquivo), "utf-8")
}

/**
 * A tabela do ledger existe neste banco?
 *
 * `to_regclass` devolve `null` em vez de lançar quando o objeto não existe — é a forma que
 * não precisa de tratamento de exceção para a pergunta mais comum deste módulo.
 *
 * Devolve `null` quando **a consulta** falhou (rede, PAT inválido, projeto errado): "não
 * consegui perguntar" não é "a tabela não existe", e confundir os dois é como um relatório
 * vira falso-negativo silencioso.
 */
export async function tabelaExiste(
  ref: string,
  pat: string,
): Promise<{ existe: boolean | null; msg: string }> {
  const { linhas, msg } = await runSqlJson<{ existe: boolean }>(
    ref,
    pat,
    `select to_regclass('public.${TABELA_LEDGER}') is not null as existe;`,
  )
  if (linhas === null) return { existe: null, msg }
  return { existe: linhas[0]?.existe === true, msg }
}

/** Lê o ledger inteiro. `null` quando a consulta falhou. */
export async function lerLedger(
  ref: string,
  pat: string,
): Promise<{ linhas: LinhaDoLedger[] | null; msg: string }> {
  return runSqlJson<LinhaDoLedger>(
    ref,
    pat,
    `select arquivo, sha256, aplicada_em::text as aplicada_em, via
       from public.${TABELA_LEDGER}
      order by arquivo;`,
  )
}

/**
 * Cruza os arquivos em disco com as linhas do ledger.
 *
 * Função pura: recebe as duas listas, devolve o veredito. É ela que os testes exercitam —
 * sem rede, sem banco.
 */
export function classificar(
  arquivosEmDisco: string[],
  hashPorArquivo: Map<string, string>,
  ledger: LinhaDoLedger[],
): VereditoDeArquivo[] {
  const registrado = new Map(ledger.map((l) => [l.arquivo, l]))
  const vereditos: VereditoDeArquivo[] = []

  for (const arquivo of arquivosEmDisco) {
    const local = hashPorArquivo.get(arquivo) ?? null
    const reg = registrado.get(arquivo)
    if (!reg) {
      vereditos.push({
        arquivo,
        estado: "PENDENTE",
        sha256_local: local,
        sha256_registrado: null,
        via: null,
      })
      continue
    }
    vereditos.push({
      arquivo,
      estado: reg.sha256 === local ? "aplicada" : "ALTERADA-APÓS-APLICAR",
      sha256_local: local,
      sha256_registrado: reg.sha256,
      via: reg.via,
    })
  }

  const emDisco = new Set(arquivosEmDisco)
  for (const l of ledger) {
    if (emDisco.has(l.arquivo)) continue
    vereditos.push({
      arquivo: l.arquivo,
      estado: "ÓRFÃ-no-banco",
      sha256_local: null,
      sha256_registrado: l.sha256,
      via: l.via,
    })
  }

  return vereditos.sort((a, b) => a.arquivo.localeCompare(b.arquivo))
}

export function contarTotais(vereditos: VereditoDeArquivo[]): Record<EstadoDeMigration, number> {
  const totais: Record<EstadoDeMigration, number> = {
    aplicada: 0,
    PENDENTE: 0,
    "ALTERADA-APÓS-APLICAR": 0,
    "ÓRFÃ-no-banco": 0,
  }
  for (const v of vereditos) totais[v.estado] += 1
  return totais
}

/** Monta o relatório completo lendo disco + banco. `null` se o ledger não pôde ser lido. */
export async function montarRelatorio(
  ambiente: Ambiente,
  ref: string,
  pat: string,
): Promise<{ relatorio: Relatorio | null; msg: string }> {
  const { linhas, msg } = await lerLedger(ref, pat)
  if (linhas === null) return { relatorio: null, msg }

  const arquivos = listarArquivosDeMigration()
  const hashes = new Map<string, string>()
  for (const a of arquivos) hashes.set(a, sha256Do(readFileSync(join(DIR_MIGRATIONS, a))))

  const vereditos = classificar(arquivos, hashes, linhas)
  return {
    relatorio: {
      ambiente,
      ref,
      gerado_em: new Date().toISOString(),
      vereditos,
      totais: contarTotais(vereditos),
    },
    msg,
  }
}

const AVISO_ESPELHO =
  "O BANCO É A VERDADE; este arquivo é o retrato que aparece no diff de PR. Regenerado por " +
  "`pnpm db:status`, uma chave por ambiente — cada execução só reescreve a chave do ambiente " +
  "que ela consultou, para que um `db:status` contra teste não apague o retrato de produção. " +
  "`aplicada_em` NÃO entra aqui de propósito: ele muda a cada reset e afogaria o diff."

interface Espelho {
  _aviso: string
  teste?: unknown
  producao?: unknown
  [k: string]: unknown
}

/**
 * Regrava **só** a chave do ambiente corrente em `docs/audits/migrations-aplicadas.json`.
 *
 * `caminho` é parametrizável para que o teste possa exercer a regra "uma execução contra
 * teste não apaga o retrato de produção" sem escrever no arquivo rastreado do repositório.
 */
export function gravarEspelho(relatorio: Relatorio, caminho: string = ARQ_ESPELHO): string {
  let atual: Espelho = { _aviso: AVISO_ESPELHO }
  if (existsSync(caminho)) {
    try {
      atual = JSON.parse(readFileSync(caminho, "utf-8")) as Espelho
    } catch {
      // Espelho corrompido não pode impedir o relatório: ele é derivado, o banco é a fonte.
    }
  }
  atual._aviso = AVISO_ESPELHO
  atual[relatorio.ambiente] = {
    gerado_em: relatorio.gerado_em,
    projeto_ref: relatorio.ref,
    totais: relatorio.totais,
    arquivos: relatorio.vereditos.map((v) => ({
      arquivo: v.arquivo,
      estado: v.estado,
      sha256: v.sha256_registrado ?? v.sha256_local,
      via: v.via,
    })),
  }
  mkdirSync(dirname(caminho), { recursive: true })
  writeFileSync(caminho, JSON.stringify(atual, null, 2) + "\n")
  return caminho
}

/** `INSERT … ON CONFLICT` de uma linha do ledger. Usado por `db:apply` e pelo reset. */
export function sqlDeRegistro(arquivo: string, sha256: string, via: string): string {
  return (
    `insert into public.${TABELA_LEDGER} (arquivo, sha256, via) values ` +
    `(${citarLiteral(arquivo)}, ${citarLiteral(sha256)}, ${citarLiteral(via)}) ` +
    `on conflict (arquivo) do update set sha256 = excluded.sha256, ` +
    `aplicada_em = now(), via = excluded.via;`
  )
}

/**
 * `INSERT` em lote de todos os arquivos de `supabase/migrations/` com o `via` dado.
 *
 * Usado pelo `reset:testdb` (`via='reset'`) e pelo backfill do runbook
 * (`via='backfill-onda-1'`). Um único statement: 268 POSTs à Management API custariam
 * minutos, e o ledger não precisa de granularidade transacional por arquivo.
 */
export function sqlDeRegistroEmLote(
  entradas: Array<{ arquivo: string; sha256: string }>,
  via: string,
): string {
  if (entradas.length === 0) return ""
  const valores = entradas
    .map((e) => `(${citarLiteral(e.arquivo)}, ${citarLiteral(e.sha256)}, ${citarLiteral(via)})`)
    .join(",\n  ")
  return (
    `insert into public.${TABELA_LEDGER} (arquivo, sha256, via) values\n  ${valores}\n` +
    `on conflict (arquivo) do update set sha256 = excluded.sha256, ` +
    `aplicada_em = now(), via = excluded.via;`
  )
}
