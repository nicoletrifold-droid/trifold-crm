/**
 * Story 87-1 — regras de validação da edição de `agent_prompts`.
 *
 * Este módulo é PURO de propósito: nenhum import de `node:*`, nenhum acesso a banco.
 * Ele é compartilhado pela server action do painel, pelo `PUT /api/admin/agent-prompts/[slug]`
 * e pelo Client Component do editor — que não pode arrastar `node:fs` para o bundle.
 * A parte que lê o snapshot commitado (selo de paridade, AC6) mora em
 * `agent-prompts-parity.ts`, que é server-only.
 */

/** Mesmo mínimo que o `PUT` já exigia antes desta story (route.ts). */
export const MIN_CONTENT_LENGTH = 10

/**
 * Risco 2 da story: "motivo obrigatório vira campo preenchido com '.' e o histórico
 * fica inútil". Um mínimo de caracteres não impede um motivo ruim — o que faz o
 * trabalho de verdade é o motivo aparecer na tela ao lado da versão (AC3, constrangimento
 * social). O mínimo existe só para barrar o "." e o "x".
 */
export const MIN_REASON_LENGTH = 10

/** Uma linha. Motivo não é changelog — a fricção precisa ser mínima (Risco 4). */
export const MAX_REASON_LENGTH = 280

export type FieldCheck<T> = { ok: true; value: T } | { ok: false; error: string }

/**
 * Os tipos do selo de paridade moram AQUI, no módulo puro, e não junto do cálculo
 * (`agent-prompts-parity.ts`) de propósito: o Client Component precisa deles, e aquele
 * módulo importa `node:fs`/`node:crypto` via `snapshot.ts`. Hoje isso funciona porque a
 * importação é `import type` (apagada na compilação) — mas um refactor que esqueça o
 * `type` quebraria o build do cliente com um erro obscuro. Separar os tipos remove a
 * armadilha em vez de documentá-la.
 */
export type ParityStatus =
  /** O que está no banco é byte a byte o que está commitado. */
  | "em-paridade"
  /** O banco mudou e ninguém devolveu ao repositório — ou o repositório mudou sozinho. */
  | "divergente"
  /** Slug existe no banco e não existe no snapshot: nunca foi capturado. */
  | "fora-do-snapshot"

export type PromptParity = {
  slug: string
  status: ParityStatus
  /** Primeiros 12 caracteres — o mesmo recorte que o `--check` imprime. */
  shaBanco: string
  shaSnapshot: string | null
}

/**
 * O motivo é obrigatório NA APLICAÇÃO (AC2). No banco ele é opcional de propósito:
 * um `UPDATE` por SQL cru sem motivo ainda grava histórico com `change_reason` nulo
 * (Dev Notes, restrição inegociável). Motivo ausente nunca pode virar escrita perdida.
 */
export function validateChangeReason(raw: unknown): FieldCheck<string> {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return {
      ok: false,
      error:
        "Diga por que está mudando este prompt. Sem motivo o histórico não serve para nada — " +
        "foi exatamente o que custou 4 dias no episódio do cabeçalho errado.",
    }
  }

  const value = raw.trim().replace(/\s+/g, " ")

  if (value.length < MIN_REASON_LENGTH) {
    return {
      ok: false,
      error: `O motivo precisa de pelo menos ${MIN_REASON_LENGTH} caracteres (você escreveu ${value.length}).`,
    }
  }

  if (value.length > MAX_REASON_LENGTH) {
    return {
      ok: false,
      error: `O motivo passa de ${MAX_REASON_LENGTH} caracteres. Uma linha basta — o diff conta o resto.`,
    }
  }

  return { ok: true, value }
}

export function validatePromptContent(raw: unknown): FieldCheck<string> {
  if (typeof raw !== "string" || raw.trim().length < MIN_CONTENT_LENGTH) {
    return {
      ok: false,
      error: `O conteúdo do prompt é obrigatório e precisa de pelo menos ${MIN_CONTENT_LENGTH} caracteres.`,
    }
  }
  return { ok: true, value: raw.trim() }
}
