/**
 * Story 900-3b · AC4b — torna AUDÍVEL o que o repositório não consegue governar.
 *
 * ## O problema, medido
 *
 * O `project_id` de `supabase/config.toml` **não** decide o alvo dos subcomandos remotos da
 * CLI do Supabase. Quem decide é o projeto **linkado**, gravado em
 * `supabase/.temp/project-ref`. Com o `config.toml` apontando para teste, um subcomando
 * remoto sem flag ainda resolvia para o ref de produção.
 *
 * ⚠️ Esse arquivo **não era** estado de máquina, como esta story supôs por três rodadas:
 * ele estava **RASTREADO** no git, em `origin/main`, com o ref de **produção** — junto de
 * `pooler-url`, `postgres-version` e `storage-migration`. **Todo clone recebia produção
 * como projeto linkado.** A regra `supabase/.temp/` do `.gitignore` (linha 36) existia, mas
 * é **inerte para caminho já no índice** — o mesmo defeito que a AC1 desta story consertou
 * para o `.env.example` — e `git check-ignore` sem `--no-index` **mente** para arquivo
 * rastreado (sai `1`). A Story 900-3b rodou `git rm --cached supabase/.temp/`; a partir
 * daí o link é por máquina de verdade, e um clone novo simplesmente não tem link (falha
 * fechada, que é o desfecho `nao-linkado` abaixo).
 *
 * ## Por que um "check" e não um conserto
 *
 * As três saídas óbvias foram testadas pelo `@po` e nenhuma serve — inclusive apagar o
 * `.temp/project-ref`, que **não** faz a CLI cair para o `config.toml`: faz o comando errar
 * com "Cannot find project ref. Have you run `supabase link`?". Falhar fechado é melhor que
 * resolver para produção, mas não é resposta.
 *
 * O remédio é o mesmo que esta story já usou na AC2: `pnpm dev` apontando para produção
 * também era estado de máquina que o repo não governa, e a resposta não foi afirmar que
 * estava certo nem apagar nada — foi o **banner**, que torna o estado errado audível no uso.
 * Aqui é a mesma ideia, num comando que o CI e a pessoa podem rodar.
 *
 * ## Reuso obrigatório da allowlist
 *
 * "O que é produção" vem de `REFS_PERMITIDOS_PRODUCAO` (`scripts/lib/db-env.ts`), importado —
 * **nunca** reimplementado. Duas definições de produção no mesmo repositório é exatamente o
 * defeito que a AC3 existiu para matar (a denylist de tamanho 1 que falhava aberta).
 *
 * ## De onde vem o ref sugerido na correção
 *
 * Do `project_id` do próprio `supabase/config.toml` — o arquivo em que o repositório declara
 * qual **deveria** ser o default. Assim o comando sugerido não pode divergir do que o repo
 * declara, e não se cria um terceiro lugar nomeando o ref de teste. Se alguém "consertar" o
 * `config.toml` para produção, a régua estática da AC4a acende.
 *
 * ## ⚠️ Regra de evidência (E3)
 *
 * Este comando imprime **apenas o project ref**, que é identificador público. NUNCA cole em
 * arquivo rastreado a saída de um subcomando remoto de verdade (`supabase db dump`,
 * `db push`, …): medido nesta story que `supabase db dump --dry-run` imprime `PGPASSWORD` de
 * produção em texto claro.
 *
 * ## Uso
 *   pnpm supabase:check
 */

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { REFS_PERMITIDOS_PRODUCAO } from "./lib/db-env"
import { ehRefDeProducao, ehRefDeTeste } from "../packages/shared/src/constants/supabase-refs"

export type EstadoDoLink = "nao-linkado" | "teste" | "producao" | "desconhecido"

export interface ResultadoDoCheck {
  /** Código de saída do processo. Só `producao` reprova. */
  codigo: 0 | 1
  estado: EstadoDoLink
  refLinkado: string | null
  mensagem: string
}

export function caminhoDoRefLinkado(raiz: string): string {
  return join(raiz, "supabase", ".temp", "project-ref")
}

export function caminhoDoConfig(raiz: string): string {
  return join(raiz, "supabase", "config.toml")
}

/** Lê o ref linkado. `null` quando a máquina não fez `supabase link`. */
export function lerRefLinkado(raiz: string): string | null {
  const p = caminhoDoRefLinkado(raiz)
  if (!existsSync(p)) return null
  const conteudo = readFileSync(p, "utf-8").trim()
  return conteudo === "" ? null : conteudo
}

/** Lê o `project_id` declarado em `supabase/config.toml`. */
export function lerRefDesejado(raiz: string): string | null {
  const p = caminhoDoConfig(raiz)
  if (!existsSync(p)) return null
  const m = readFileSync(p, "utf-8").match(/^\s*project_id\s*=\s*"([^"]+)"/m)
  return m?.[1] ?? null
}

/**
 * Classifica o ref linkado. Função pura — é ela que o teste exercita, e é ela que garante
 * que "produção" aqui significa a mesma coisa que em `scripts/lib/db-env.ts`.
 */
export function classificar(
  refLinkado: string | null,
  refDesejado: string | null,
): ResultadoDoCheck {
  const sugestao = refDesejado
    ? `supabase link --project-ref ${refDesejado}`
    : "supabase link --project-ref <ref de teste>  (supabase/config.toml sem project_id)"

  if (refLinkado === null) {
    return {
      codigo: 0,
      estado: "nao-linkado",
      refLinkado: null,
      mensagem:
        "[supabase:check] NÃO LINKADO — não há supabase/.temp/project-ref.\n" +
        "  Este é o estado SEGURO: subcomandos remotos do `supabase` vão FALHAR com\n" +
        '  "Cannot find project ref. Have you run `supabase link`?" em vez de resolver\n' +
        "  silenciosamente para produção. O `project_id` do config.toml NÃO é fallback.\n" +
        `  Para trabalhar contra o banco de teste: ${sugestao}`,
    }
  }

  if (ehRefDeProducao(refLinkado)) {
    return {
      codigo: 1,
      estado: "producao",
      refLinkado,
      mensagem:
        `[supabase:check] ⛔ A CLI do supabase está linkada em PRODUÇÃO: ${refLinkado}\n` +
        "  Qualquer subcomando remoto SEM --project-ref vai para lá — inclusive `db push`\n" +
        "  e `db dump`. O `project_id` de supabase/config.toml NÃO vence este arquivo.\n" +
        `  Corrija com:  ${sugestao}\n` +
        `  Para falar com produção de propósito, passe --project-ref ${refLinkado} explícito.`,
    }
  }

  if (refDesejado !== null && refLinkado === refDesejado && ehRefDeTeste(refLinkado)) {
    return {
      codigo: 0,
      estado: "teste",
      refLinkado,
      mensagem: `[supabase:check] ✓ linkado no projeto de teste declarado pelo config.toml: ${refLinkado}`,
    }
  }

  // PR #524 — `desconhecido` passa a REPROVAR. Antes saía `0` para todo ref fora de
  // `REFS_PERMITIDOS_PRODUCAO`, inclusive um projeto de produção recém-criado ainda não
  // cadastrado: a CLI mandaria comandos remotos para ele e o check diria que estava tudo
  // bem. Exit `0` fica reservado para o ref de teste declarado e para o estado não-linkado
  // (que falha fechado sozinho). Allowlist que só conhece um lado libera o outro.
  return {
    codigo: 1,
    estado: "desconhecido",
    refLinkado,
    mensagem:
      `[supabase:check] ⛔ linkado em ${refLinkado}, que NÃO é o ref declarado em\n` +
      `  supabase/config.toml${refDesejado ? ` (${refDesejado})` : " (sem project_id)"} e ` +
      `não está em nenhuma allowlist conhecida.\n` +
      "  Não posso afirmar que é seguro: um projeto de PRODUÇÃO recém-criado, ainda não\n" +
      "  cadastrado, cai exatamente aqui — e receberia todo subcomando remoto sem flag.\n" +
      `  Se for mesmo o alvo desejado, cadastre o ref em\n` +
      "  packages/shared/src/constants/supabase-refs.ts. Senão, corrija com:\n" +
      `  ${sugestao}`,
  }
}

export function executar(raiz: string): ResultadoDoCheck {
  return classificar(lerRefLinkado(raiz), lerRefDesejado(raiz))
}

if (process.argv[1]?.includes("supabase-check")) {
  const r = executar(process.cwd())
  // stderr para o caso que reprova; stdout para os que passam.
  if (r.codigo === 0) console.log(r.mensagem)
  else console.error(r.mensagem)
  process.exit(r.codigo)
}
