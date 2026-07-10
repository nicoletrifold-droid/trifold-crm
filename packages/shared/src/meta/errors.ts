export class MetaAPIError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly subcode: number | undefined,
    public readonly type: string,
  ) {
    super(message)
    this.name = 'MetaAPIError'
  }
}

export class MetaOAuthException extends MetaAPIError {
  constructor(message: string, code: number, subcode?: number) {
    super(message, code, subcode, 'OAuthException')
    this.name = 'MetaOAuthException'
  }
}

export class MetaRateLimitError extends MetaAPIError {
  constructor(message: string, code: number, subcode?: number) {
    super(message, code, subcode, 'RateLimitError')
    this.name = 'MetaRateLimitError'
  }
}

export class MetaPermissionError extends MetaAPIError {
  constructor(message: string, code: number, subcode?: number) {
    super(message, code, subcode, 'PermissionError')
    this.name = 'MetaPermissionError'
  }
}

interface MetaErrorShape {
  message: string
  type: string
  code: number
  error_subcode?: number
}

export function parseMetaError(response: unknown): MetaAPIError {
  const err = (response as { error?: MetaErrorShape })?.error ?? (response as MetaErrorShape)
  const message = err?.message ?? 'Unknown Meta API error'
  const type = err?.type ?? ''
  const code = err?.code ?? 0
  const subcode = err?.error_subcode

  // code 4 = Application-level throttle, code 17 = User-level throttle. A Graph API do Meta
  // costuma devolver esses códigos de rate-limit com type "OAuthException" (quirk conhecido) —
  // por isso essa checagem vem ANTES da checagem de OAuthException. Checar type primeiro fazia
  // um rate-limit transiente ser classificado como token morto, travando a conta permanentemente
  // sem retry (incidente de 2026-07-06: token válido, mas conta ficou 4 dias em status='error').
  if (code === 4 || code === 17 || code === 32 || code === 613) {
    return new MetaRateLimitError(message, code, subcode)
  }

  // code 190 = "Invalid OAuth 2.0 Access Token" é o único código que representa token de fato
  // revogado/expirado. Outros erros com type OAuthException e code diferente de 190 não são
  // tratados como fatais — caem em MetaAPIError (retriable) em vez de matar a conta de primeira.
  if (type === 'OAuthException' && code === 190) {
    return new MetaOAuthException(message, code, subcode)
  }

  // code 200-299 = Permission errors
  if (code >= 200 && code <= 299) {
    return new MetaPermissionError(message, code, subcode)
  }

  return new MetaAPIError(message, code, subcode, type)
}
