// Story 75-299 — error boundary do `/broker` (corretor). Mesma rede de segurança do
// `app/dashboard/error.tsx`: o shell é byte a byte o mesmo (`broker/layout.tsx:87` =
// `min-h-screen bg-stone-50 dark:bg-stone-950` + `<main className="lg:pl-56">` com o
// mesmo container `max-w-6xl`), então nenhuma decisão de design nova aparece aqui.
//
// Diferença de motivação: no `/broker` a necessidade é HIPOTÉTICA, não medida — o fetch
// de `lead_tasks` em `broker/leads/page.tsx:76-82` DEGRADA (`{ data: pendingTasks }`,
// `error` descartado, consumo `?? []`) em vez de lançar. O boundary entra porque é a
// área de maior volume de uso e o valor de uma rede de segurança é justamente o erro
// que ninguém mediu.
//
// Racional completo (Next 16.2.2, doc lido, `unstable_retry` × `reset`, por que o
// fallback existe, o que o boundary NÃO cobre): ver `app/dashboard/error.tsx` e
// `lib/ui/error-retry.ts` — ponto único de mudança quando o `unstable_` estabilizar.
//
// ⚠️ Vale o mesmo limite: exceção lançada DENTRO de `broker/layout.tsx` não é pega
// (`error.tsx` não envolve o layout do próprio segmento), nem erro em event handler /
// async pós-render — é o caso do `throw` em
// `broker/_components/broker-push-prompt.tsx:22`, que roda dentro de `subscribe()`.

"use client" // error boundary TEM de ser Client Component

import { ErrorFallback } from "@web/components/ui/error-fallback"
import { pickRetry } from "@web/lib/ui/error-retry"

export default function BrokerError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  reset: () => void
  unstable_retry?: () => void // opcional DE PROPÓSITO — o `tsc` não valida props de `error.tsx`
}) {
  return (
    <ErrorFallback
      error={error}
      onRetry={pickRetry({ unstable_retry, reset })}
      scope="[broker/error]"
    />
  )
}
