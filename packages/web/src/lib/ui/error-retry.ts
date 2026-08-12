// Story 75-299 — escolha do retry de um `error.tsx`, isolada como função PURA.
//
// ── Por que isso não é preciosismo ────────────────────────────────────────────────
// Next instalado: 16.2.2. O doc do próprio pacote
// (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`)
// diz que `unstable_retry()` "will try to re-fetch and re-render the error boundary's
// children" (prop adicionada em v16.2.0), enquanto `reset()` limpa o estado de erro e
// re-renderiza os children **sem re-buscar** — e o doc é explícito: "In most cases, you
// should use unstable_retry() instead".
// O caso de uso desta story é falha TRANSITÓRIA de fetch, então só `unstable_retry`
// cumpre a promessa do rótulo "Tentar novamente". O runtime passa AS DUAS props ao
// componente do usuário (`node_modules/next/dist/esm/client/components/error-boundary.js`,
// ~linha 84-88) e o `unstable_retry` (~linha 20-23) chama `this.reset()` por dentro,
// somando o `refresh()` — ou seja, é `reset` + re-fetch.
//
// ── Por que existe o FALLBACK (e por que ele mora aqui, num `.ts` puro) ───────────
// O `tsc` NÃO valida as props de `error.tsx`: o validador que o Next gera
// (`.next/types/validator.ts`) cobre apenas `AppPageConfig`, `LayoutConfig` e
// `RouteHandlerConfig` — zero menção a `error.tsx`. Logo as props desses arquivos são
// tipadas só pela anotação que nós mesmos escrevemos. Se um Next futuro renomear ou
// remover a prop `unstable_` (é `unstable_` justamente por isso), o typecheck passa
// LIMPO, o runtime injeta `undefined` e o clique em "Tentar novamente" morreria num
// `TypeError` — em silêncio, até alguém clicar.
// Por isso `unstable_retry` é declarado OPCIONAL: é o NOSSO tipo que obriga o
// fallback. Pior cenário num upgrade = o botão degrada para o comportamento pré-16.2
// ("limpa o erro sem re-buscar") em vez de estourar.
// Sendo decisão pura, tem teste: `error-retry.test.ts` (⚠️ `.test.ts` — o
// `vitest.config.ts` só inclui `*.test.ts`; um `.test.tsx` nunca rodaria).

export interface RetryProps {
  /**
   * `unstable_retry` do Next >= 16.2 — re-busca e re-renderiza os children.
   * OPCIONAL de propósito: ver o bloco de comentário acima.
   */
  unstable_retry?: () => void
  /** `reset` do Next (desde v13) — limpa o estado de erro, mas NÃO re-busca. */
  reset: () => void
}

/**
 * Devolve a função que o botão "Tentar novamente" deve disparar:
 * `unstable_retry` quando o runtime a fornece (re-fetch de verdade), senão `reset`
 * como degradação honesta.
 */
export function pickRetry({ unstable_retry, reset }: RetryProps): () => void {
  return typeof unstable_retry === "function" ? unstable_retry : reset
}
