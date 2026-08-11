/**
 * Story 87-1 · AC6 — selo de paridade painel × repositório.
 *
 * POR QUE ESTA É A AC QUE FALTAVA
 * -------------------------------
 * Histórico (AC1) e motivo (AC2) respondem *quem editou e por quê* — perguntas que só
 * se faz DEPOIS de alguém desconfiar. No episódio do cabeçalho `### YARDEN RESIDENCE`
 * ninguém desconfiou, porque nada sinalizou: o erro chegou à lead e levou 4 dias para
 * ser visto. O que fecha a distância entre "editei" e "a lead recebeu" é alguém ver o
 * diff. Este selo é a versão barata disso, e é a única que funciona SEM CI — que é a
 * situação real hoje (não existe `.github/workflows`; a D5 do epic 87 segue aberta).
 *
 * 🔴 POR QUE NÃO USAR `readSnapshotManifest()`
 * --------------------------------------------
 * Ela chama `findRepoRoot()` (`packages/ai/src/prompts/snapshot.ts`), que sobe o
 * filesystem a partir de `process.cwd()` procurando `packages/ai/src/prompts/index.ts`.
 * Na Vercel a árvore do repo não existe em runtime: a função LANÇA. O `manifest.json` é
 * importado estaticamente, e o bundler o embute no build — o que também é semanticamente
 * certo: o selo compara com o snapshot DAQUELE deploy, que é o que está commitado.
 *
 * `sha256` e `normalizePromptContent` são puros e vêm do mesmo módulo de propósito:
 * a normalização (CRLF→LF, NFC, trim) é declarada em UM lugar só. Reimplementá-la aqui
 * faria o selo e o `npm run prompts:check` discordarem um dia, e o selo perderia o
 * sentido justamente quando importasse.
 *
 * SERVER-ONLY: `snapshot.ts` importa `node:fs`/`node:crypto`. Este módulo não pode ser
 * importado por Client Component — a página calcula o selo no servidor e passa o
 * resultado (dados simples) como prop.
 */
import manifest from "@trifold/ai/src/prompts/_production/manifest.json"
import { normalizePromptContent, sha256 } from "@trifold/ai/src/prompts/snapshot"
import type { PromptParity } from "./agent-prompts"

export type { ParityStatus, PromptParity } from "./agent-prompts"

/** Quando o snapshot commitado foi capturado. Serve para dizer "de quando é o espelho". */
export const SNAPSHOT_CAPTURED_AT: string = manifest.captured_at

const CURTO = 12

/**
 * Compara o `content` vindo do banco com o `sha256` do snapshot commitado.
 * Por construção independente do `scripts/dump-agent-prompts.ts --check` (caminhos de
 * código diferentes, mesma normalização) — se os dois discordarem, um dos dois tem bug.
 */
export function promptParity(slug: string, content: string | null): PromptParity {
  const shaBanco = sha256(normalizePromptContent(content ?? ""))
  const entry = manifest.prompts.find((p) => p.slug === slug)

  if (!entry) {
    return {
      slug,
      status: "fora-do-snapshot",
      shaBanco: shaBanco.slice(0, CURTO),
      shaSnapshot: null,
    }
  }

  return {
    slug,
    status: entry.sha256 === shaBanco ? "em-paridade" : "divergente",
    shaBanco: shaBanco.slice(0, CURTO),
    shaSnapshot: entry.sha256.slice(0, CURTO),
  }
}
