/**
 * Story 900-64 — qual marca a barra lateral mostra: a da empresa ou a da Trifold.
 *
 * ## Por que a decisão mora FORA do componente
 *
 * `sidebar-nav.tsx` é `"use client"` e o harness que o mede (`sidebar-nav.test.ts`) usa
 * `renderToStaticMarkup` — não há `jsdom` nem Testing Library no repositório, e o `include` do
 * `vitest.config.ts` casa `*.test.ts` (um `.test.tsx` existiria e nunca rodaria). Markup estático
 * **não executa handler de evento**: o `onError` de uma imagem quebrada nunca dispara ali.
 *
 * Com a decisão numa função pura, o caso "a imagem falhou ⇒ volta para a marca da Trifold"
 * (`imgFailed: true`) é medido diretamente, sem `<img>` de verdade. O que continua **sem**
 * carrasco automatizado é a FIAÇÃO (`onError` ⇒ `setImgFailed(true)` ⇒ esta função) — o mock de
 * `next/image` do harness descarta `onError`, e isso está declarado como lacuna nomeada na AC4 da
 * story. Ninguém pode dizer que a fiação está coberta.
 *
 * ## A direção da falha
 *
 * Todo desfecho ruim (sem logo, URL vazia, host fora do `remotePatterns` do `next.config.ts`,
 * arquivo removido do balde) desemboca na marca da Trifold — que é o estado de HOJE para 100% das
 * empresas. Nunca em espaço vazio.
 */

/** O asset de HOJE, servido de `packages/web/public`. É o fallback de toda superfície. */
export const LOGO_DA_TRIFOLD = "/logo-trifold.webp"

/** O texto alternativo de HOJE, byte a byte (`sidebar-nav.tsx`, desktop e mobile). */
export const ALT_DA_TRIFOLD = "Trifold"

/**
 * Texto alternativo quando a empresa tem logo mas não tem nome utilizável.
 *
 * `organizations.name` é `NOT NULL` no schema, mas string em branco passa por `NOT NULL` — e um
 * `alt=""` marca a imagem como decorativa para leitor de tela, apagando a marca justamente de
 * quem só tem o texto.
 */
export const ALT_GENERICO_DA_EMPRESA = "Logo da empresa"

export interface MarcaDaBarra {
  src: string
  alt: string
  isCustom: boolean
}

/**
 * A marca a exibir, dado o que o layout leu de `organizations` e se a imagem já falhou.
 *
 * `trim()` nos dois campos de propósito: `""` e `"   "` são o mesmo "não tem" que `null`, e a
 * coluna não impede nenhum dos dois.
 */
export function resolveSidebarBrand(input: {
  orgLogoUrl?: string | null
  orgName?: string | null
  imgFailed: boolean
}): MarcaDaBarra {
  const url = (input.orgLogoUrl ?? "").trim()

  if (input.imgFailed || url === "") {
    return { src: LOGO_DA_TRIFOLD, alt: ALT_DA_TRIFOLD, isCustom: false }
  }

  const nome = (input.orgName ?? "").trim()
  return { src: url, alt: nome === "" ? ALT_GENERICO_DA_EMPRESA : nome, isCustom: true }
}
