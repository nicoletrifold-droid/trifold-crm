/**
 * Story 87-1 · AC2-b — o gate de bootstrap dos scripts que ESCREVEM em `agent_prompts`.
 *
 * POR QUE ISTO EXISTE
 * -------------------
 * `agent_prompts` é a fonte da verdade dos prompts da Nicole desde a decisão D-87-0-a
 * (05/08/2026). Existem duas superfícies de escrita DESTRUTIVAS no repositório, e as duas
 * rodam sem confirmação nenhuma:
 *
 *   • `scripts/seed-prompts.ts`  — upsert dos 7 slugs a partir das CONSTANTES do código.
 *     Apaga qualquer reconciliação feita no painel. Ruim, mas recuperável (o texto do
 *     código ao menos é um prompt de verdade).
 *   • `scripts/run-seed.ts`      — o `npm run seed` documentado do repositório. Faz upsert
 *     dos 7 slugs com `"[placeholder — Story 3.x]"`. É a única superfície capaz de deixar
 *     a Nicole SEM PROMPT NENHUM.
 *
 * E o estado padrão deste repositório é `.env.local` apontando para PRODUÇÃO (CLAUDE.md).
 * Um `npm run seed` distraído é, hoje, um incidente.
 *
 * A AC12 da Story 87-0 previa este gate para `seed-prompts.ts`, foi escrita e NUNCA
 * implementada (medição M6 do @po, 10/08/2026). Esta AC a absorve e acrescenta a quarta
 * superfície, que a 87-0 não conhecia. Governança com porta dos fundos não é governança.
 *
 * COMO DESTRAVAR (quando o bootstrap for MESMO o que você quer)
 * ------------------------------------------------------------
 *   SEED_AGENT_PROMPTS_BOOTSTRAP=1 npx tsx scripts/seed-prompts.ts
 *   npx tsx scripts/seed-prompts.ts --bootstrap
 *   SEED_AGENT_PROMPTS_BOOTSTRAP=1 npm run seed
 *
 * ⚠️ Em `npm run seed` use a ENV, não a flag: o npm anexa os argumentos ao FIM da cadeia
 * (`... && tsx scripts/seed-properties.ts --bootstrap`), então `--bootstrap` nunca chega
 * ao `run-seed.ts`.
 */

export const BOOTSTRAP_ENV = "SEED_AGENT_PROMPTS_BOOTSTRAP"
export const BOOTSTRAP_FLAG = "--bootstrap"

/** Verdadeiro só com intenção explícita — nunca por default, nunca por herança de shell vazia. */
export function bootstrapLiberado(argv: string[] = process.argv.slice(2)): boolean {
  const env = process.env[BOOTSTRAP_ENV]
  const porEnv = env !== undefined && env !== "" && env !== "0" && env.toLowerCase() !== "false"
  return porEnv || argv.includes(BOOTSTRAP_FLAG)
}

export function mensagemDoGate(quemChamou: string): string {
  return [
    `⛔ ${quemChamou}: escrita em agent_prompts BLOQUEADA (Story 87-1 · AC2-b).`,
    "",
    "   Este script sobrescreve os 7 prompts de produção da Nicole — que são a fonte da",
    "   verdade desde a D-87-0-a e vivem no painel, não no código. Rodá-lo por engano",
    "   apaga o que foi reconciliado à mão (e, no caso do `npm run seed`, grava",
    "   '[placeholder — Story 3.x]' e deixa a Nicole sem prompt).",
    "",
    "   Se você quer MESMO fazer bootstrap:",
    `     ${BOOTSTRAP_ENV}=1 npx tsx scripts/seed-prompts.ts`,
    `     ${BOOTSTRAP_ENV}=1 npm run seed`,
    "",
    "   Se o que você queria era conferir/atualizar o espelho no repositório:",
    "     npm run prompts:check                                # banco x snapshot commitado",
    "     npx tsx scripts/dump-agent-prompts.ts --write        # regrava o snapshot",
    "",
    "   Se o que você queria era VOLTAR ATRÁS num prompt:",
    "     docs/runbooks/87-1-rollback-agent-prompts.md",
  ].join("\n")
}
