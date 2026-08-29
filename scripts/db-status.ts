/**
 * Story 900-3c · AC2 — `pnpm db:status`: o que está aplicado neste banco, e o que não está.
 *
 * ## O CONTRATO DE EXIT CODE, E POR QUE ELE É ASSIMÉTRICO
 *
 *   • **`0`** sempre que a tabela `trifold_migrations_aplicadas` **existir**, qualquer que
 *     seja o veredito por arquivo — inclusive com `PENDENTE` e `ALTERADA-APÓS-APLICAR` na
 *     lista. Este comando é **relatório, não gate**. Quem bloqueia é o `db:apply`.
 *   • **`1`** apenas quando a tabela **não existir**, nomeando-a e apontando o runbook. Isso
 *     é pré-condição de infraestrutura, não veredito de conteúdo.
 *
 * A assimetria é o ponto. Se "tabela ausente" saísse `0`, o relatório mostraria **todos** os
 * arquivos como `PENDENTE` — indistinguível de um banco vazio de verdade, e a mensagem certa
 * ("rode o runbook") viraria uma lista de 268 falsos pendentes que ninguém lê. Se qualquer
 * `PENDENTE` saísse `1`, o comando viraria um gate e não poderia mais ser rodado à toa.
 *
 * ## USO
 *
 *   pnpm db:status                          # ambiente de teste (default do repositório)
 *   TRIFOLD_ENV=producao pnpm db:status     # produção — LEITURA, não exige TRIFOLD_ALLOW_PROD
 *   pnpm db:status --json /tmp/status.json  # grava o relatório completo em JSON
 *
 * `--json` existe para o job de CI da AC4: ele precisa cruzar os arquivos do PR com o
 * veredito, e raspar texto de terminal é a forma frágil de fazer isso. O arquivo JSON é
 * escrito **onde o chamador mandar**, e não se confunde com o espelho rastreado.
 *
 * ## ESTE COMANDO ESCREVE NO DISCO (e isso não é contradição com "leitura pura")
 *
 * `db:status` regenera `docs/audits/migrations-aplicadas.json`, que é rastreado. "Leitura
 * pura" vale para o **banco**: nenhum `INSERT`, `UPDATE`, `DELETE` ou DDL sai daqui. No CI,
 * a árvore fica suja e isso é inofensivo por desenho — o job não commita o espelho nem falha
 * por causa dele.
 */

import { writeFileSync } from "node:fs"
import { resolverAmbiente } from "./lib/db-env"
import {
  RUNBOOK,
  TABELA_LEDGER,
  gravarEspelho,
  montarRelatorio,
  tabelaExiste,
  type EstadoDeMigration,
  type VereditoDeArquivo,
} from "./lib/migrations-ledger"

function exigirPat(): string {
  const v = process.env.SUPABASE_MANAGEMENT_PAT
  if (!v || !v.trim()) {
    throw new Error(
      "Env SUPABASE_MANAGEMENT_PAT ausente ou vazia. É ela que autentica na Management API.",
    )
  }
  return v.trim()
}

function caminhoDoJson(argv: string[]): string | null {
  const i = argv.indexOf("--json")
  if (i === -1) return null
  const caminho = argv[i + 1]
  if (!caminho || caminho.startsWith("--")) {
    throw new Error("--json exige um caminho de arquivo: --json /tmp/db-status.json")
  }
  return caminho
}

const ORDEM_DE_EXIBICAO: EstadoDeMigration[] = [
  "ALTERADA-APÓS-APLICAR",
  "PENDENTE",
  "ÓRFÃ-no-banco",
]

function imprimirRelatorio(vereditos: VereditoDeArquivo[]): void {
  for (const estado of ORDEM_DE_EXIBICAO) {
    const desteEstado = vereditos.filter((v) => v.estado === estado)
    if (desteEstado.length === 0) continue
    console.log(`\n${estado} (${desteEstado.length}):`)
    for (const v of desteEstado) console.log(`  ${v.arquivo}${v.via ? ` [via=${v.via}]` : ""}`)
  }
}

async function main(): Promise<number> {
  const alvo = resolverAmbiente()
  const pat = exigirPat()
  const json = caminhoDoJson(process.argv)

  const { existe, msg } = await tabelaExiste(alvo.ref, pat)
  if (existe === null) {
    console.error(
      `ABORTADO: não consegui consultar o projeto ${alvo.ref} pela Management API. ` +
        `Isto NÃO é "a tabela não existe" — é "não consegui perguntar".\n  Resposta: ${msg.slice(0, 300)}`,
    )
    return 1
  }
  if (!existe) {
    console.error(
      `ABORTADO: a tabela ${TABELA_LEDGER} não existe no projeto ${alvo.ref} ` +
        `(ambiente "${alvo.ambiente}").\n` +
        `  Ela é criada por supabase/migrations/245_registro_de_migrations.sql, que precisa ser ` +
        `aplicada À MÃO uma vez em cada ambiente.\n` +
        `  Runbook: ${RUNBOOK}`,
    )
    return 1
  }

  const { relatorio, msg: msgLedger } = await montarRelatorio(alvo.ambiente, alvo.ref, pat)
  if (!relatorio) {
    console.error(
      `ABORTADO: a tabela ${TABELA_LEDGER} existe, mas a leitura falhou.\n  Resposta: ${msgLedger.slice(0, 300)}`,
    )
    return 1
  }

  console.log(`\nAmbiente: ${relatorio.ambiente} · projeto ${relatorio.ref}`)
  console.log(
    `aplicada ${relatorio.totais.aplicada} · PENDENTE ${relatorio.totais.PENDENTE} · ` +
      `ALTERADA-APÓS-APLICAR ${relatorio.totais["ALTERADA-APÓS-APLICAR"]} · ` +
      `ÓRFÃ-no-banco ${relatorio.totais["ÓRFÃ-no-banco"]}`,
  )
  imprimirRelatorio(relatorio.vereditos)

  const espelho = gravarEspelho(relatorio)
  console.log(`\nEspelho regenerado (chave "${relatorio.ambiente}"): ${espelho}`)

  if (json) {
    writeFileSync(json, JSON.stringify(relatorio, null, 2) + "\n")
    console.log(`Relatório JSON: ${json}`)
  }

  // Relatório, não gate: qualquer veredito de CONTEÚDO sai 0. Ver o contrato no cabeçalho.
  return 0
}

if (process.argv[1]?.includes("db-status")) {
  main()
    .then((c) => process.exit(c))
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    })
}
