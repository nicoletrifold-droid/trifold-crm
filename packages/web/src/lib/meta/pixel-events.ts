/**
 * Disparo de eventos no Meta Pixel (browser) — Story 86-9.
 *
 * O par server-side de cada evento vive em `api/formulario/[token]/route.ts`.
 * Os dois compartilham o MESMO `event_id`, e é isso que faz o Meta contar o
 * evento uma vez só, com a união dos sinais dos dois lados. Se os ids
 * divergirem, a contagem infla e a campanha passa a otimizar por um número
 * inflado — pior do que não ter o evento.
 *
 * Nenhuma função aqui lança. Bloqueador de anúncios, `fbq` ausente ou env não
 * configurada são estados normais: o formulário segue funcionando.
 */

declare global {
  interface Window {
    fbq?: (
      comando: 'init' | 'track' | 'trackCustom',
      nome: string,
      params?: Record<string, unknown>,
      opcoes?: { eventID?: string },
    ) => void
  }
}

/** Nomes dos eventos padrão do Meta usados no funil do formulário. */
export const PIXEL_EVENTS = {
  PAGE_VIEW: 'PageView',
  VIEW_CONTENT: 'ViewContent',
  INITIATE_CHECKOUT: 'InitiateCheckout',
  LEAD: 'Lead',
  COMPLETE_REGISTRATION: 'CompleteRegistration',
} as const

export const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() ?? ''

/** Gera o id compartilhado entre o disparo do browser e o da CAPI. */
export function novoEventId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // segue para o fallback
  }
  return `e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

/**
 * Dados de identidade para o Advanced Matching (AC8).
 *
 * ⚠️ Vão em TEXTO PURO: o script do Pixel hasheia sozinho, no browser, antes de
 * enviar. Hashear aqui produziria o hash de um hash e o Meta não casaria nada.
 * (O servidor faz o oposto — lá o hash é obrigatório, porque fala direto com a
 * API sem o SDK no meio.)
 */
export interface IdentidadePixel {
  external_id?: string
  fn?: string
  ln?: string
  ph?: string
  em?: string
}

/**
 * Registra os dados de identidade no Pixel via re-chamada de `fbq('init')`.
 *
 * O Meta suporta esse "late matching": chamar `init` de novo com os dados que
 * apareceram depois do carregamento (aqui, quando a pessoa digita nome e
 * telefone). Não dispara evento nenhum — só enriquece os próximos.
 */
export function pixelIdentificar(identidade: IdentidadePixel): void {
  try {
    if (typeof window === 'undefined' || !window.fbq || !PIXEL_ID) return

    const limpo = Object.fromEntries(
      Object.entries(identidade).filter(([, v]) => typeof v === 'string' && v.length > 0),
    )
    if (Object.keys(limpo).length === 0) return

    window.fbq('init', PIXEL_ID, limpo)
  } catch {
    // tracking nunca derruba o formulário
  }
}

/** Dispara um evento padrão no Pixel com o `eventID` de deduplicação. */
export function pixelTrack(
  evento: string,
  eventId: string,
  params: Record<string, unknown> = {},
): void {
  try {
    if (typeof window === 'undefined' || !window.fbq || !PIXEL_ID) return
    window.fbq('track', evento, params, { eventID: eventId })
  } catch {
    // tracking nunca derruba o formulário
  }
}
