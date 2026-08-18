/**
 * Leitura dos sinais de atribuição do Meta no browser: `_fbp`, `_fbc` e `fbclid`.
 *
 * [Story 86-9 — AC3]
 *
 * Estes três campos são a diferença entre "o Meta recebeu a conversão" e "o Meta
 * sabe de qual anúncio veio a conversão". No baseline medido em 17/08/2026 o
 * `fbp` estava presente em apenas 9,2% dos eventos do dataset — é a maior
 * lacuna isolada da nota de correspondência.
 *
 * Nada aqui pode lançar: um bloqueador de anúncios que remove os cookies não
 * pode derrubar o formulário de captação de lead.
 */

const FBCLID_SESSION_KEY = 'trifold_fbclid'

export interface AtribuicaoBrowser {
  /** Cookie `_fbp` — id do browser, criado pelo próprio Pixel. Texto puro. */
  fbp?: string
  /** Cookie `_fbc` — id do clique no anúncio. Texto puro. */
  fbc?: string
  /** `fbclid` bruto da URL, preservado para o servidor. */
  fbclid?: string
}

function lerCookie(nome: string): string | undefined {
  try {
    const escapado = nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = document.cookie.match(new RegExp(`(?:^|; )${escapado}=([^;]*)`))
    return match?.[1] ? decodeURIComponent(match[1]) : undefined
  } catch {
    return undefined
  }
}

/**
 * Lê o `fbclid` da URL e o guarda na sessão.
 *
 * O formulário navega entre passos sem recarregar, mas basta um refresh para a
 * query string sumir. Sem persistir, o clique pago perderia a atribuição no meio
 * do preenchimento — justamente no POST que cria o lead.
 */
function lerFbclid(): string | undefined {
  try {
    const daUrl = new URLSearchParams(window.location.search).get('fbclid')
    if (daUrl) {
      try {
        window.sessionStorage.setItem(FBCLID_SESSION_KEY, daUrl)
      } catch {
        // storage indisponível — seguimos com o valor da URL mesmo assim
      }
      return daUrl
    }
    return window.sessionStorage.getItem(FBCLID_SESSION_KEY) ?? undefined
  } catch {
    return undefined
  }
}

/**
 * Coleta os sinais de atribuição disponíveis neste momento.
 *
 * O `_fbc` é criado pelo Pixel quando há `fbclid` na URL, mas há uma corrida:
 * na primeira renderização o script do Meta pode ainda não ter rodado. Quando o
 * cookie falta e o `fbclid` existe, montamos o valor no formato oficial
 * `fb.1.{timestamp}.{fbclid}` — sem isso, o clique pago chega sem atribuição.
 *
 * O `_fbp` NUNCA é fabricado à mão: ele é sempre gerado pelo script oficial.
 */
export function coletarAtribuicao(): AtribuicaoBrowser {
  if (typeof window === 'undefined') return {}

  try {
    const fbclid = lerFbclid()
    const fbp = lerCookie('_fbp')
    const fbc = lerCookie('_fbc') ?? (fbclid ? `fb.1.${Date.now()}.${fbclid}` : undefined)

    return {
      ...(fbp ? { fbp } : {}),
      ...(fbc ? { fbc } : {}),
      ...(fbclid ? { fbclid } : {}),
    }
  } catch {
    return {}
  }
}
