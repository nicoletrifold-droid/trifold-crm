// Story 75-299 — cartão de erro das áreas internas logadas (`/dashboard` e `/broker`).
//
// Nasceu do follow-up C-1 do QA gate da 75-298: as duas áreas não tinham NENHUM
// error boundary, então qualquer exceção não tratada num server component jogava o
// usuário na página de erro genérica do Next (em inglês, sem menu, sem caminho de
// volta). Este componente concentra layout, texto, acessibilidade e o log; os dois
// `error.tsx` de rota (`app/dashboard/error.tsx` e `app/broker/error.tsx`) só o
// instanciam — um lugar só para mudar quando o `unstable_retry` virar estável.
//
// 🔴 SEM `min-h-screen` e SEM fundo de página DE PROPÓSITO: o boundary entra no lugar
// do `{children}`, DENTRO do `<main className="lg:pl-56">` + container `max-w-6xl`
// já padded dos dois layouts (`dashboard/layout.tsx:304-330` e `broker/layout.tsx:87`,
// shells idênticos). Pintar fundo aqui criaria faixa dupla e scroll extra. Os 2
// `error.tsx` do `/cliente` são tela-cheia dark-only — referência de LINGUAGEM, não
// de estilo.
//
// Tema: par claro + `dark:` em TODA cor ([[feedback-theme-convention]]). Cartão copiado
// de `app/dashboard/loading.tsx` e botão de `app/dashboard/offline/page.tsx:26-31`.

"use client"

import { useEffect } from "react"
import { AlertTriangle } from "lucide-react"

interface Props {
  error: Error & { digest?: string }
  /**
   * O que o botão "Tentar novamente" dispara. Quem decide é `pickRetry()`
   * (`@web/lib/ui/error-retry`), no arquivo de rota — ver o porquê lá.
   */
  onRetry: () => void
  title?: string
  /** Prefixo do `console.error`, ex.: `[dashboard/error]`. Só para o log. */
  scope: string
}

export function ErrorFallback({
  error,
  onRetry,
  title = "Erro ao carregar esta tela.",
  scope,
}: Props) {
  // Log SEMPRE (vai para o log da Vercel) — risco nº 2 da story: boundary que "falha
  // bonito" pode esconder bug real. O `digest` aparece na tela e no log, é o elo que o
  // suporte usa para correlacionar. Nunca `setState` em effect
  // ([[feedback-router-refresh-nao-mexe-em-state-client]]).
  //
  // Deps `[error, scope]`: a AC1 pede `[error]` (1 log por erro, não por render) e é
  // exatamente o que acontece — `scope` é literal fixo em cada arquivo de rota, nunca
  // muda entre renders. Está na lista só para não abrir warning novo de
  // `react-hooks/exhaustive-deps` (linha de base = 24 warnings, AC6).
  useEffect(() => {
    console.error(scope, error.message, error.digest)
  }, [error, scope])

  return (
    <div
      role="alert"
      className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className="mt-0.5 h-5 w-5 shrink-0 text-amber-500 dark:text-amber-400"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <div className="min-w-0 space-y-3">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-gray-900 dark:text-stone-100">
              {title}
            </h2>
            {/* Texto útil SEM depender do `message`: em produção o Next redige a
                mensagem de erro de Server Component e sobra só o `digest`. */}
            <p className="text-sm text-gray-500 dark:text-stone-400">
              Algo deu errado ao carregar o conteúdo. O restante do CRM continua
              funcionando — use o menu ao lado ou tente novamente.
            </p>
          </div>

          {error.message && (
            <p className="break-words text-xs text-gray-400 dark:text-stone-500">
              {error.message}
            </p>
          )}
          {/* `dark:text-stone-500` (e não `-600`, que é o do `offline/page.tsx`):
              conferido na tela em T4 — `stone-600` sobre `stone-900` fica ilegível, e o
              `digest` é justamente o que o suporte precisa LER para casar com o
              `console.error` no log da Vercel (risco nº 2 da story). */}
          {error.digest && (
            <p className="font-mono text-xs text-gray-500 dark:text-stone-500">
              Código: {error.digest}
            </p>
          )}

          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-700 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    </div>
  )
}
