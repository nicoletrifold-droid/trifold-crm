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
export async function pixelIdentificar(identidade: IdentidadePixel): Promise<void> {
  try {
    const limpo = Object.fromEntries(
      Object.entries(identidade).filter(([, v]) => typeof v === 'string' && v.length > 0),
    )
    if (Object.keys(limpo).length === 0) return

    if (!(await quandoPixelPronto())) return
    window.fbq?.('init', PIXEL_ID, limpo)
  } catch {
    // tracking nunca derruba o formulário
  }
}

/**
 * Espera o script do Pixel existir de verdade.
 *
 * [Defeito 86.9-QA-001]
 *
 * O `fbevents.js` é carregado com `strategy="afterInteractive"`, que roda DEPOIS
 * da hidratação — e os `useEffect` do formulário rodam NA hidratação. Ou seja,
 * no primeiro disparo `window.fbq` ainda não existe. Sem esta espera, o
 * `ViewContent` do browser era descartado em silêncio e o par server-side saía
 * sem o cookie `_fbp`, que só nasce quando o script roda. Seria a story
 * entregando exatamente o sintoma que veio corrigir (fbp em 9,2%).
 *
 * O teto de tentativas existe para quem usa bloqueador de anúncios: ali o script
 * nunca chega, e ficar sondando para sempre vazaria um timer por página.
 */
const INTERVALO_MS = 100
const MAX_TENTATIVAS = 50 // 5s — além disso, o script não vem mais (bloqueador)

export function quandoPixelPronto(): Promise<boolean> {
  if (typeof window === 'undefined' || !PIXEL_ID) return Promise.resolve(false)
  if (window.fbq) return Promise.resolve(true)

  return new Promise((resolve) => {
    let tentativas = 0
    const timer = setInterval(() => {
      if (window.fbq) {
        clearInterval(timer)
        resolve(true)
        return
      }
      if (++tentativas >= MAX_TENTATIVAS) {
        clearInterval(timer)
        resolve(false)
      }
    }, INTERVALO_MS)
  })
}

/**
 * Dispara um evento padrão no Pixel com o `eventID` de deduplicação.
 *
 * Aguarda o Pixel carregar antes de desistir — ver `quandoPixelPronto`.
 * Resolve `true` quando o evento saiu, `false` quando o Pixel nunca apareceu.
 */
export async function pixelTrack(
  evento: string,
  eventId: string,
  params: Record<string, unknown> = {},
): Promise<boolean> {
  try {
    if (!(await quandoPixelPronto())) return false
    window.fbq?.('track', evento, params, { eventID: eventId })
    return true
  } catch {
    // tracking nunca derruba o formulário
    return false
  }
}
