/**
 * Story 900-3c · AC2 — `pnpm db:apply`: aplica as migrations `PENDENTE` e registra no ledger.
 *
 * ## AS TRÊS GUARDAS, E O MODO DE FALHA DE CADA UMA
 *
 * 1. **`ALTERADA-APÓS-APLICAR` bloqueia o comando INTEIRO** (exit 1, nomeando os arquivos),
 *    antes de aplicar qualquer coisa. Não é "pula esse e aplica os outros": um arquivo que
 *    mudou depois de ter rodado significa que o banco e o repositório discordam sobre o que
 *    já aconteceu, e aplicar mais coisa por cima dessa discordância é como se produz um
 *    banco que ninguém sabe reconstruir. Este é o caso que o `sha256` do ledger existe para
 *    pegar.
 *
 * 2. **Em produção o operador digita O REF DO PROJETO, não `y`.** "Tem certeza? [s/N]" é
 *    respondido no automático por quem já digitou o comando. Digitar `dsopqkqjkmhytudaaolv`
 *    exige ler o que está na tela. Mesma lição da confirmação informativa do `reset:testdb`.
 *
 * 3. **`--yes` só é aceito com `TRIFOLD_ENV=teste`.** Em produção ele é recusado com exit 1 —
 *    não ignorado em silêncio. Um `--yes` que "não faz nada" em produção é pior que um erro:
 *    quem o escreveu acredita que a confirmação foi dispensada.
 *
 * Acima das três, as guardas de `scripts/lib/db-env.ts`: `TRIFOLD_ALLOW_PROD=1` obrigatório
 * para escrever em produção, e a allowlist de refs que falha fechada nos dois sentidos.
 *
 * ## USO
 *
 *   pnpm db:apply                                   # teste, com confirmação interativa
 *   pnpm db:apply --yes                             # teste, sem prompt
 *   TRIFOLD_ENV=producao TRIFOLD_ALLOW_PROD=1 pnpm db:apply    # produção: digita o ref
 *
 * ## ORDEM E TRANSPORTE
 *
 * Ordem lexicográfica de nome de arquivo — a mesma que `supabase db push` usaria e a mesma
 * que `reset:testdb` já usa. Transporte: `runSql` de `scripts/lib/management-api.ts`, com o
 * fallback statement-a-statement quando o arquivo inteiro falha (a Management API roda o
 * arquivo numa transação implícita; `ALTER TYPE … ADD VALUE` seguido de uso do valor novo
 * estoura `55P04` por artefato do método).
 *
 * O registro no ledger acontece **por arquivo, logo após o sucesso dele**. Se o quinto de
 * dez falhar, os quatro anteriores ficam registrados — que é a verdade sobre o banco.
 */

import { createInterface } from "node:readline/promises"
import { resolverAmbiente } from "./lib/db-env"
import { runSql, splitStatements } from "./lib/management-api"
import {
  RUNBOOK,
  TABELA_LEDGER,
  gravarEspelho,
  lerMigration,
  montarRelatorio,
  sha256Do,
  sqlDeRegistro,
  tabelaExiste,
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

async function perguntar(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return (await rl.question(prompt)).trim()
  } finally {
    rl.close()
  }
}

async function main(): Promise<number> {
  const temYes = process.argv.includes("--yes")
  // `escreve: true` liga as guardas de produção do db-env: TRIFOLD_ALLOW_PROD=1 e
  // SUPABASE_SERVICE_ROLE_KEY presentes. A recusa nomeia qual delas barrou.
  const alvo = resolverAmbiente({ escreve: true })
  const pat = exigirPat()

  if (alvo.ambiente === "producao" && temYes) {
    console.error(
      `ABORTADO: --yes só é aceito com TRIFOLD_ENV=teste. Em produção (${alvo.ref}) a ` +
        `confirmação é digitar o ref do projeto, e ela não pode ser dispensada por flag.`,
    )
    return 1
  }

  const { existe, msg } = await tabelaExiste(alvo.ref, pat)
  if (existe === null) {
    console.error(
      `ABORTADO: não consegui consultar o projeto ${alvo.ref} pela Management API.\n` +
        `  Resposta: ${msg.slice(0, 300)}`,
    )
    return 1
  }
  if (!existe) {
    console.error(
      `ABORTADO: a tabela ${TABELA_LEDGER} não existe no projeto ${alvo.ref}. ` +
        `Aplique supabase/migrations/245_registro_de_migrations.sql à mão primeiro.\n` +
        `  Runbook: ${RUNBOOK}`,
    )
    return 1
  }

  const { relatorio, msg: msgLedger } = await montarRelatorio(alvo.ambiente, alvo.ref, pat)
  if (!relatorio) {
    console.error(`ABORTADO: não consegui ler ${TABELA_LEDGER}.\n  Resposta: ${msgLedger.slice(0, 300)}`)
    return 1
  }

  // GUARDA 1 — bloqueia o comando inteiro, antes de aplicar qualquer coisa.
  const alteradas = relatorio.vereditos.filter((v) => v.estado === "ALTERADA-APÓS-APLICAR")
  if (alteradas.length > 0) {
    console.error(
      `ABORTADO: ${alteradas.length} migration(s) mudaram DEPOIS de terem sido aplicadas em ` +
        `${alvo.ref}. Nada foi aplicado.`,
    )
    for (const a of alteradas) console.error(`  - ${a.arquivo}`)
    console.error(
      "  O banco e o repositório discordam sobre o que já rodou. Reverta a edição do arquivo, " +
        "ou crie uma migration NOVA com a correção — nunca edite uma que já aplicou.",
    )
    return 1
  }

  const pendentes = relatorio.vereditos
    .filter((v) => v.estado === "PENDENTE")
    .map((v) => v.arquivo)
    .sort()

  console.log(`\nAmbiente: ${alvo.ambiente} · projeto ${alvo.ref}`)
  if (pendentes.length === 0) {
    console.log("Nada a aplicar: nenhuma migration PENDENTE.")
    gravarEspelho(relatorio)
    return 0
  }

  console.log(`${pendentes.length} migration(s) PENDENTE(s), em ordem lexicográfica:`)
  for (const p of pendentes) console.log(`  ${p}`)

  // GUARDAS 2 e 3 — a confirmação.
  if (alvo.ambiente === "producao") {
    const resposta = await perguntar(
      `\n⚠️  PRODUÇÃO. Para confirmar, digite o ref do projeto (${alvo.ref}): `,
    )
    if (resposta !== alvo.ref) {
      console.error(`ABORTADO: "${resposta}" não é o ref do projeto. Nada foi aplicado.`)
      return 1
    }
  } else if (!temYes) {
    const resposta = await perguntar(`\nAplicar em ${alvo.ref} (ambiente teste)? [s/N] `)
    if (resposta.toLowerCase() !== "s" && resposta.toLowerCase() !== "sim") {
      console.error("ABORTADO pelo operador. Nada foi aplicado.")
      return 1
    }
  }

  let aplicadas = 0
  for (const arquivo of pendentes) {
    const sql = lerMigration(arquivo)
    if (!sql.trim()) {
      console.log(`  ${arquivo}: vazio, pulado`)
      continue
    }
    let r = await runSql(alvo.ref, pat, sql)
    if (!r.ok) {
      // fallback autocommit — ver o cabeçalho de scripts/lib/management-api.ts
      const erros: string[] = []
      for (const st of splitStatements(sql)) {
        const s = await runSql(alvo.ref, pat, st)
        if (!s.ok) erros.push(s.msg)
      }
      if (erros.length === 0) r = { ok: true, msg: "" }
      else {
        console.error(`\nFALHOU: ${arquivo}`)
        console.error(`  ${erros[0].slice(0, 400)}`)
        console.error(`\n${aplicadas} migration(s) aplicada(s) antes da falha, todas registradas.`)
        return 1
      }
    }

    const reg = await runSql(
      alvo.ref,
      pat,
      sqlDeRegistro(arquivo, sha256Do(Buffer.from(sql, "utf-8")), "apply"),
    )
    if (!reg.ok) {
      console.error(
        `\nFALHOU AO REGISTRAR ${arquivo} no ledger — o SQL APLICOU, mas o registro não ` +
          `entrou. Registre à mão antes de rodar de novo, senão a próxima execução tenta ` +
          `reaplicar.\n  ${reg.msg.slice(0, 400)}`,
      )
      return 1
    }
    aplicadas += 1
    console.log(`  ✓ ${arquivo}`)
  }

  console.log(`\n${aplicadas} migration(s) aplicada(s) e registrada(s) (via='apply').`)

  const { relatorio: depois } = await montarRelatorio(alvo.ambiente, alvo.ref, pat)
  if (depois) gravarEspelho(depois)
  return 0
}

if (process.argv[1]?.includes("db-apply")) {
  main()
    .then((c) => process.exit(c))
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    })
}
