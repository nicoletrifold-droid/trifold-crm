/**
 * Story 900-3b (AC2) — roda o CLI do Next com um arquivo dotenv escolhido explicitamente.
 *
 * ## Por que isto existe, se `node --env-file` já faz isso
 *
 * Não faz — **medido em 2026-08-29**, e a story prescrevia justamente essa forma:
 *
 * ```
 * $ node --env-file=.env.producao.local ./node_modules/next/dist/bin/next dev
 * node: --env-file= is not allowed in NODE_OPTIONS
 *
 * $ node --env-file=.env.development ./node_modules/next/dist/bin/next build
 * Error: Initiated Worker with invalid NODE_OPTIONS env variable:
 *        --env-file= is not allowed in NODE_OPTIONS   (ERR_WORKER_INVALID_EXEC_ARGV)
 * ```
 *
 * A causa é que o Next **re-executa a si mesmo** (dev server) e cria **Workers** (build),
 * propagando o `process.execArgv` do pai via `NODE_OPTIONS`. E `--env-file` está na lista de
 * flags que o Node proíbe em `NODE_OPTIONS`. Ou seja: `--env-file` funciona num processo
 * folha, e quebra em qualquer processo que gere filhos — que é o caso dos dois comandos que
 * a AC2 precisa.
 *
 * ## Como este wrapper contorna
 *
 * Carrega o dotenv **em processo** (sem nenhuma flag de execução, portanto sem poluir
 * `execArgv`/`NODE_OPTIONS`) e só então entrega o controle ao CLI do Next por `require`.
 * Os filhos que o Next criar herdam o `process.env` já preenchido, pelo caminho normal.
 *
 * ## Precedência: `process.env` VENCE o arquivo
 *
 * Mesma regra declarada para `scripts/lib/db-env.ts`. Uma variável já presente no ambiente
 * nunca é sobrescrita pelo arquivo — o arquivo é *fallback*. Isso mantém `VAR=x pnpm …` e
 * as variáveis injetadas pela Vercel com a última palavra, e torna o wrapper idempotente
 * caso ele seja carregado duas vezes.
 *
 * ## Sem dependência nova
 *
 * `node:util.parseEnv` é nativo (Node ≥ 20.12; aqui v25.6.1). O monorepo **não** tem
 * `dotenv` instalado na raiz — `scripts/dump-agent-prompts.ts` já registra esse fato — e
 * esta story proíbe acrescentá-lo.
 *
 * ## Uso
 *
 *   node scripts/next-com-env.mjs <arquivo-env> <subcomando-do-next> [args...]
 *   node scripts/next-com-env.mjs .env.producao.local dev --port 3000
 *   node scripts/next-com-env.mjs .env.development build
 */

import fs from "node:fs"
import path from "node:path"
import { parseEnv } from "node:util"
import { createRequire } from "node:module"

const [arquivo, ...argsDoNext] = process.argv.slice(2)

if (!arquivo || argsDoNext.length === 0) {
  console.error(
    "uso: node scripts/next-com-env.mjs <arquivo-env> <subcomando-do-next> [args...]",
  )
  process.exit(2)
}

const caminho = path.resolve(process.cwd(), arquivo)
if (!fs.existsSync(caminho)) {
  console.error(
    `[next-com-env] arquivo de ambiente não encontrado: ${caminho}\n` +
      `  Os arquivos de valor são gitignored e não vêm do clone. Veja ` +
      `packages/web/.env.development.example e scripts/README.md.`,
  )
  process.exit(1)
}

const doArquivo = parseEnv(fs.readFileSync(caminho, "utf-8"))
let carregadas = 0
for (const [chave, valor] of Object.entries(doArquivo)) {
  // `process.env` vence o arquivo — o arquivo é fallback, nunca override.
  if (process.env[chave] === undefined) {
    process.env[chave] = valor
    carregadas++
  }
}
process.stderr.write(
  `[next-com-env] ${arquivo}: ${carregadas} de ${Object.keys(doArquivo).length} variáveis ` +
    `carregadas (as demais já estavam em process.env, que vence)\n`,
)

// Entrega ao CLI do Next no MESMO processo: nenhuma flag de execução envolvida, portanto
// nada vaza para `NODE_OPTIONS` dos filhos que o Next vier a criar.
//
// `createRequire` só para RESOLVER o caminho (`next/dist/bin/next` é CJS e não expõe
// export map para import direto); a execução em si é `await import`, e o `await` de topo
// garante que o env já está em `process.env` antes de o CLI avaliar qualquer coisa.
const binDoNext = createRequire(import.meta.url).resolve("next/dist/bin/next")
process.argv = [process.argv[0], binDoNext, ...argsDoNext]
await import(binDoNext)
