// Story 75-299 — error boundary do `/dashboard` (gerente). Antes desta story a área
// não tinha NENHUM boundary: `fetchAllLeads` faz `if (error) throw error`
// (`lib/analytics/fetch-all-leads.ts:46`) e é chamado do server component
// `app/dashboard/leads/page.tsx` no caminho `?tasks=` da 75-298 — esse throw ia direto
// para a página de erro genérica do Next (inglês, sem menu, sem volta).
//
// ── Next 16.2.2 · doc lido antes de escrever (exigência do `packages/web/AGENTS.md`) ──
// `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`
// (o repo é pnpm: o `next` real vive em `node_modules/.pnpm/next@16.2.2…`; o caminho
// acima é o symlink que funciona).
//
// 1) O retry NÃO é `reset()` como 1ª escolha: `reset` limpa o estado de erro e
//    re-renderiza os children **sem re-buscar**, e o caso de uso aqui é falha
//    transitória de fetch — o botão "Tentar novamente" não cumpriria o rótulo.
//    `unstable_retry()` re-busca (`reset` + `refresh()` por dentro). O doc é explícito:
//    "In most cases, you should use unstable_retry() instead".
// 2) `unstable_retry` é tipado OPCIONAL e a escolha passa por `pickRetry()` porque o
//    `tsc` não valida props de `error.tsx` (`.next/types/validator.ts` cobre só
//    page/layout/route handler). Ver o comentário longo em `lib/ui/error-retry.ts`.
// 3) ⚠️ LIMITE: `error.tsx` envolve `page`/`loading`/`not-found` e os layouts
//    ANINHADOS abaixo, mas **não** o `layout.tsx` deste mesmo segmento — uma exceção
//    lançada dentro de `dashboard/layout.tsx` continua escapando para a tela genérica
//    do Next. Só `global-error.tsx` pegaria, e ele está FORA de escopo (raio maior,
//    mexe no layout raiz). Também não pega erro em event handler nem em async
//    pós-render.
// 4) Em produção o Next redige a `message` de erro de Server Component (genérica, para
//    não vazar detalhe sensível) e sobra o `digest` — é ele que casa com o
//    `console.error` no log da Vercel. A UI não promete detalhe que não terá.

"use client" // error boundary TEM de ser Client Component

import { ErrorFallback } from "@web/components/ui/error-fallback"
import { pickRetry } from "@web/lib/ui/error-retry"

export default function DashboardError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  reset: () => void
  unstable_retry?: () => void // opcional DE PROPÓSITO — ver nota (2) acima
}) {
  return (
    <ErrorFallback
      error={error}
      onRetry={pickRetry({ unstable_retry, reset })}
      scope="[dashboard/error]"
    />
  )
}
