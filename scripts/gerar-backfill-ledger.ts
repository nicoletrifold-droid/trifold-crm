/**
 * Story 900-3c · AC1 (Task 1.3) — gera o SQL de backfill do ledger. **Não aplica nada.**
 *
 * ## Por que isto é um gerador e não um `.sql` congelado no repositório
 *
 * O backfill precisa de uma linha por arquivo de `supabase/migrations/`, cada uma com o
 * `sha256` do **conteúdo atual** daquele arquivo. São 268 linhas e 268 hashes: escrever à
 * mão é impossível, e congelar o resultado num arquivo versionado o faria mentir na primeira
 * migration nova que entrasse — o backfill congelado registraria um hash que não é mais o do
 * arquivo, produzindo `ALTERADA-APÓS-APLICAR` falso no primeiro `db:status`.
 *
 * O runbook manda rodar este gerador **no momento da aplicação**, contra a árvore que está
 * sendo aplicada. É a mesma razão pela qual a Task 1.1 remede o número da migration em vez
 * de herdá-lo do documento.
 *
 * ## `via='backfill-onda-1'` é uma DECLARAÇÃO, não uma prova
 *
 * Ninguém observou essas 267 migrations rodarem. O que se sabe é que o schema de produção
 * corresponde a elas. O valor do campo `via` diz isso em voz alta, para que ninguém leia o
 * ledger como se fosse um log de execução. `via='apply'` (gravado por `pnpm db:apply`) e
 * `via='reset'` (gravado pelo `reset:testdb`) são observação direta; este não é.
 *
 * ## USO
 *
 *   npx tsx scripts/gerar-backfill-ledger.ts                    # imprime o SQL
 *   npx tsx scripts/gerar-backfill-ledger.ts --excluir 245_registro_de_migrations.sql
 *
 * `--excluir` existe para o caso em que a própria migration do ledger não deve entrar no
 * lote declarativo — por exemplo quando ela vai ser registrada por `pnpm db:apply`, que
 * observa a aplicação de verdade.
 *
 * Este script **não abre conexão nenhuma**. Ele lê o disco e escreve na saída padrão.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  DIR_MIGRATIONS,
  listarArquivosDeMigration,
  sha256Do,
  sqlDeRegistroEmLote,
} from "./lib/migrations-ledger"

function excluidos(argv: string[]): Set<string> {
  const fora = new Set<string>()
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--excluir" && argv[i + 1]) fora.add(argv[i + 1] as string)
  }
  return fora
}

function main(): number {
  const fora = excluidos(process.argv)
  const arquivos = listarArquivosDeMigration().filter((a) => !fora.has(a))
  const entradas = arquivos.map((arquivo) => ({
    arquivo,
    sha256: sha256Do(readFileSync(join(DIR_MIGRATIONS, arquivo))),
  }))

  process.stderr.write(
    `[backfill] ${entradas.length} arquivo(s)` +
      (fora.size ? ` (excluídos: ${[...fora].join(", ")})` : "") +
      "\n",
  )
  process.stdout.write(
    `-- Story 900-3c — backfill de trifold_migrations_aplicadas (via='backfill-onda-1').\n` +
      `-- Gerado por scripts/gerar-backfill-ledger.ts em ${new Date().toISOString()}.\n` +
      `-- DECLARAÇÃO de que estes arquivos já rodaram neste banco, não prova de execução.\n` +
      sqlDeRegistroEmLote(entradas, "backfill-onda-1") +
      "\n",
  )
  return 0
}

if (process.argv[1]?.includes("gerar-backfill-ledger")) {
  process.exit(main())
}
