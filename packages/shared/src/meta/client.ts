import { parseMetaError, MetaOAuthException, MetaPermissionError } from './errors'
import { rateLimiter } from './rate-limiter'
import type { MetaBatchRequest, MetaBatchResponse } from './types'

const META_BASE = 'https://graph.facebook.com/v21.0'
const MAX_RETRIES = 5
const MAX_BATCH_SIZE = 50

function backoffDelay(attempt: number): number {
  const base = Math.min(1000 * Math.pow(2, attempt), 16_000)
  const jitter = base * 0.2 * (Math.random() * 2 - 1)
  return base + jitter
}

function isRetriable(error: unknown): boolean {
  if (error instanceof MetaOAuthException) return false
  if (error instanceof MetaPermissionError) return false
  return true
}

export async function metaFetch<T>(
  path: string,
  token: string,
  options?: {
    params?: Record<string, string>
    method?: 'GET' | 'POST'
    body?: Record<string, unknown>
  },
): Promise<T> {
  const method = options?.method ?? 'GET'
  const url = new URL(`${META_BASE}/${path.replace(/^\//, '')}`)

  url.searchParams.set('access_token', token)
  if (options?.params) {
    for (const [k, v] of Object.entries(options.params)) {
      url.searchParams.set(k, v)
    }
  }

  let lastError: unknown

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, backoffDelay(attempt - 1)))
    }

    let response: Response
    try {
      response = await fetch(url.toString(), {
        method,
        signal: AbortSignal.timeout(30_000),
        headers: { 'Content-Type': 'application/json' },
        body: options?.body ? JSON.stringify(options.body) : undefined,
      })
    } catch (err) {
      lastError = err
      continue
    }

    if (!response.ok) {
      let errorBody: unknown
      try {
        errorBody = await response.json()
      } catch {
        errorBody = { error: { message: response.statusText, code: response.status, type: '' } }
      }
      const apiError = parseMetaError(errorBody)
      if (!isRetriable(apiError)) throw apiError
      if (attempt === MAX_RETRIES - 1) throw apiError
      lastError = apiError
      continue
    }

    rateLimiter.update(response.headers)
    return response.json() as Promise<T>
  }

  throw lastError ?? new Error('metaFetch: max retries exceeded')
}

export async function metaBatch(
  requests: MetaBatchRequest[],
  token: string,
): Promise<MetaBatchResponse[]> {
  const results: MetaBatchResponse[] = []

  for (let i = 0; i < requests.length; i += MAX_BATCH_SIZE) {
    const chunk = requests.slice(i, i + MAX_BATCH_SIZE)

    const body = new URLSearchParams()
    body.set('access_token', token)
    body.set('batch', JSON.stringify(chunk))

    const response = await fetch(`${META_BASE}/`, {
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}))
      throw parseMetaError(errorBody)
    }

    rateLimiter.update(response.headers)
    const chunk_results = (await response.json()) as MetaBatchResponse[]
    results.push(...chunk_results)
  }

  return results
}
