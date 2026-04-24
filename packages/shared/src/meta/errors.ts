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

  if (type === 'OAuthException') {
    return new MetaOAuthException(message, code, subcode)
  }

  // code 4 = Application-level throttle, code 17 = User-level throttle
  if (code === 4 || code === 17 || code === 32 || code === 613) {
    return new MetaRateLimitError(message, code, subcode)
  }

  // code 200-299 = Permission errors
  if (code >= 200 && code <= 299) {
    return new MetaPermissionError(message, code, subcode)
  }

  return new MetaAPIError(message, code, subcode, type)
}
