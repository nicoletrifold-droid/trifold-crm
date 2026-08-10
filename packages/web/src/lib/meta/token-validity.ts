/**
 * Story 75-289 (AC8) — a validade da credencial da Meta fica VISÍVEL.
 *
 * O incidente de 10/08 foi descoberto pelo prejuízo. Depois dele, a org passou a
 * usar um System User token com expiração "Nunca" — mas nada na tela dizia isso, e
 * um token de 60 dias parece idêntico a um permanente até o dia em que morre.
 *
 * `debug_token` responde `expires_at: 0` para token que nunca expira e um timestamp
 * unix para token com prazo. É essa a única evidência confiável.
 */

export interface TokenValidity {
  /** false = a Meta recusou o token (é o estado de incidente). */
  valid: boolean
  /** true = `expires_at` 0/ausente → não expira. */
  neverExpires: boolean
  /** ISO do vencimento, ou null quando não expira / não foi possível saber. */
  expiresAt: string | null
  /** Tipo devolvido pela Meta (`SYSTEM_USER`, `USER`, …). */
  tokenType: string | null
  /** Texto pronto para a tela. */
  label: string
  /** Preenchido quando não deu para consultar (rede/timeout) — ≠ token inválido. */
  unknownReason?: string
}

interface DebugTokenData {
  is_valid?: boolean
  expires_at?: number
  type?: string
  scopes?: string[]
}

/**
 * Traduz a resposta do `debug_token` no que a tela mostra. PURO — testável sem rede.
 */
export function interpretDebugToken(data: DebugTokenData | null | undefined): TokenValidity {
  if (!data || data.is_valid === false) {
    return {
      valid: false,
      neverExpires: false,
      expiresAt: null,
      tokenType: data?.type ?? null,
      label: "Inválido — a Meta está recusando esta credencial",
    }
  }

  // 0 e ausente significam a mesma coisa aqui: sem prazo.
  const exp = data.expires_at
  if (!exp) {
    return {
      valid: true,
      neverExpires: true,
      expiresAt: null,
      tokenType: data.type ?? null,
      label: "Válido · nunca expira",
    }
  }

  const date = new Date(exp * 1000)
  const dias = Math.floor((date.getTime() - Date.now()) / 86_400_000)
  return {
    valid: true,
    neverExpires: false,
    expiresAt: date.toISOString(),
    tokenType: data.type ?? null,
    label:
      dias <= 0
        ? `Válido, mas EXPIRA hoje (${date.toLocaleDateString("pt-BR")})`
        : `Válido · expira em ${dias} dia${dias === 1 ? "" : "s"} (${date.toLocaleDateString("pt-BR")})`,
  }
}

/**
 * Consulta a Meta sobre o token. Nunca lança e NUNCA devolve o token.
 *
 * Falha de rede é reportada como "não foi possível verificar" — deliberadamente
 * distinto de "token inválido". Confundir os dois é a classe de erro que esta
 * story existe para não repetir: "o banco caiu" virando "está tudo bem".
 */
export async function fetchTokenValidity(
  accessToken: string | null | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<TokenValidity | null> {
  if (!accessToken) return null
  try {
    const res = await fetchImpl(
      `https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(
        accessToken
      )}&access_token=${encodeURIComponent(accessToken)}`,
      { signal: AbortSignal.timeout(6000) }
    )
    const json = (await res.json()) as { data?: DebugTokenData; error?: { message?: string } }
    if (!res.ok && !json?.data) {
      // 400 com `error` costuma ser token morto; sem corpo útil, é indefinido.
      return json?.error
        ? { ...interpretDebugToken(null), label: "Inválido — a Meta está recusando esta credencial" }
        : {
            valid: false,
            neverExpires: false,
            expiresAt: null,
            tokenType: null,
            label: "Não foi possível verificar",
            unknownReason: `HTTP ${res.status}`,
          }
    }
    return interpretDebugToken(json.data)
  } catch (err) {
    return {
      valid: false,
      neverExpires: false,
      expiresAt: null,
      tokenType: null,
      label: "Não foi possível verificar",
      unknownReason: err instanceof Error ? err.message : "erro desconhecido",
    }
  }
}
