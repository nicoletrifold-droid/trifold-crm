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
 *   npx tsx scripts/gerar-backfill-ledger.ts --sobrescrever     # sem a guarda de ledger vazio
 *
 * Por padrão o SQL vem com uma guarda `RAISE EXCEPTION` que o **aborta se o ledger não
 * estiver vazio** — a janela do Passo 2 do runbook. Fora dela, o lote reescreveria as 268
 * linhas com `via='backfill-onda-1'`, trocando proveniência observada por declaração
 * retroativa em massa. `--sobrescrever` remove a guarda, e o SQL gerado diz isso em voz alta.
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

/**
 * `--excluir` **falha alto** quando o valor falta ou quando o nome não existe em
 * `supabase/migrations/` (CodeRabbit, PR #525).
 *
 * Antes, os dois casos eram ignorados em silêncio: `--excluir` sem valor não excluía nada, e
 * um nome com erro de digitação era listado no diagnóstico mas também não excluía nada. O
 * efeito é o pior possível para este script — a migration que o operador queria manter fora
 * do lote declarativo entra nele com `via='backfill-onda-1'`, declarada aplicada sem que
 * ninguém tenha visto, que é exatamente o que o campo `via` existe para impedir.
 */
function excluidos(argv: string[], disponiveis: string[]): Set<string> {
  const fora = new Set<string>()
  const conhecidos = new Set(disponiveis)
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== "--excluir") continue
    const valor = argv[i + 1]
    if (!valor || valor.startsWith("--")) {
      throw new Error("--excluir exige o nome do arquivo: --excluir 245_registro_de_migrations.sql")
    }
    if (!conhecidos.has(valor)) {
      throw new Error(
        `--excluir ${valor}: não existe em supabase/migrations/. Excluir um nome que não ` +
          `existe não exclui nada, e o arquivo que você queria de fora entraria no lote ` +
          `declarado como aplicado.`,
      )
    }
    fora.add(valor)
  }
  return fora
}

function main(): number {
  const sobrescrever = process.argv.includes("--sobrescrever")
  const todos = listarArquivosDeMigration()
  const fora = excluidos(process.argv, todos)
  const arquivos = todos.filter((a) => !fora.has(a))
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
      (sobrescrever
        ? `-- ⚠️ --sobrescrever: SEM a guarda de ledger vazio. Este lote vai SUBSTITUIR sha256 e\n` +
          `-- via das linhas existentes, trocando proveniência observada (reset/apply) por\n` +
          `-- declaração retroativa. Use só se você souber exatamente por quê.\n`
        : `-- Guarda embutida: aborta se o ledger não estiver vazio (Passo 2 do runbook). Fora\n` +
          `-- dessa janela, use o "Procedimento de exceção" do runbook, não este lote.\n`) +
      sqlDeRegistroEmLote(entradas, "backfill-onda-1", { sobrescrever }) +
      "\n",
  )
  return 0
}

if (process.argv[1]?.includes("gerar-backfill-ledger")) {
  try {
    process.exit(main())
  } catch (e) {
    process.stderr.write(`${e instanceof Error ? e.message : e}\n`)
    process.exit(1)
  }
}
