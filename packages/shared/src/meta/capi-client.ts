import type { CapiEvent } from './capi-payload'

/**
 * Meta Conversions API (CAPI) HTTP client — POST to the `/events` endpoint.
 *
 * [Story 86-3]
 *
 * IDS decision (CREATE, not ADAPT `metaFetch`):
 * `metaFetch` (`./client.ts`) is a GET-oriented Marketing-API reader pinned to
 * `v21.0` that puts the token in the query string and mutates the shared
 * read-API `rateLimiter`. CAPI is a different integration: a POST with a JSON
 * body to a different Graph API version (`v25.0`), token in the body, distinct
 * dataset target, and no shared rate-limit state. Bending `metaFetch` to cover
 * both would couple two unrelated concerns and risk the read-API path. We
 * instead replicate ONLY the retry/backoff pattern here (exponential backoff +
 * jitter, network + 5xx retriable, 4xx fatal), which is small and self-contained.
 */

/** Graph API version for CAPI. Kept separate from `v21.0` used by the read-only Marketing API. */
const CAPI_API_VERSION = 'v25.0'
const MAX_RETRIES = 5
const REQUEST_TIMEOUT_MS = 30_000

export interface CapiSendResult {
  success: boolean
  eventsReceived?: number
  error?: string
}

export interface SendCapiEventsOptions {
  /** Meta "Test Events" code — routes events to the Events Manager test tool without affecting production metrics. */
  testEventCode?: string
  /**
   * Story 900-23 — dataset por organização, resolvido de `org_integrations`
   * (`provider = 'meta_capi'`, `config->>'dataset_id'`).
   *
   * **Aditivo e retrocompatível de propósito:** ausente, cai no fallback de env exatamente como
   * antes. `packages/web/src/lib/meta/form-capi.ts` (o outro chamador, fluxo do formulário da
   * landing, sem outbox nem cron) não passa nada e continua byte a byte com o comportamento de
   * hoje. O **token** (`META_CAPI_ACCESS_TOKEN`) segue global nesta onda — só o dataset é por org.
   */
  datasetId?: string
}

interface CapiSuccessResponse {
  events_received?: number
  messages?: unknown[]
  fbtrace_id?: string
}

interface CapiErrorResponse {
  error?: {
    message?: string
    code?: number
    type?: string
    fbtrace_id?: string
  }
}

function backoffDelay(attempt: number): number {
  const base = Math.min(1000 * Math.pow(2, attempt), 16_000)
  const jitter = base * 0.2 * (Math.random() * 2 - 1)
  return base + jitter
}

/**
 * POST a batch of CAPI events to `graph.facebook.com/{version}/{DATASET_ID}/events`.
 *
 * Reads `META_CAPI_ACCESS_TOKEN` and `META_CAPI_DATASET_ID` from env (provisioned
 * in Story 86-1). Retries network failures and HTTP 5xx with exponential backoff;
 * HTTP 4xx responses are treated as fatal (no retry) since they indicate a bad
 * request/token, not a transient condition.
 *
 * @returns `{ success, eventsReceived }` on success, `{ success: false, error }` otherwise.
 */
export async function sendCapiEvents(
  events: CapiEvent[],
  options?: SendCapiEventsOptions,
): Promise<CapiSendResult> {
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN
  // Mesmo raciocínio do Pixel do browser: o id do dataset é público e não vale
  // um deploy mudo. Já o token é segredo de verdade e segue obrigatório abaixo.
  // Story 900-23: o override por org vence a env; sem override, o comportamento é o de antes.
  const datasetId = options?.datasetId ?? (process.env.META_CAPI_DATASET_ID || '1337310707164669')

  if (!accessToken) {
    return { success: false, error: 'META_CAPI_ACCESS_TOKEN is not configured' }
  }
  if (!datasetId) {
    return { success: false, error: 'META_CAPI_DATASET_ID is not configured' }
  }
  if (events.length === 0) {
    return { success: true, eventsReceived: 0 }
  }

  const url = `https://graph.facebook.com/${CAPI_API_VERSION}/${datasetId}/events`
  const body: Record<string, unknown> = {
    data: events,
    access_token: accessToken,
  }
  if (options?.testEventCode) {
    body.test_event_code = options.testEventCode
  }

  let lastError: string | undefined

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, backoffDelay(attempt - 1)))
    }

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch (err) {
      // Network error / timeout — retriable.
      lastError = err instanceof Error ? err.message : String(err)
      continue
    }

    if (response.ok) {
      const data = (await response.json().catch(() => ({}))) as CapiSuccessResponse
      return { success: true, eventsReceived: data.events_received ?? events.length }
    }

    // Parse the error body for a message.
    const errorBody = (await response
      .json()
      .catch(() => ({}))) as CapiErrorResponse
    const message =
      errorBody.error?.message ?? `CAPI request failed with status ${response.status}`

    // 4xx = client error (bad request/token) — fatal, do not retry.
    if (response.status >= 400 && response.status < 500) {
      return { success: false, error: message }
    }

    // 5xx (or other non-ok) — retriable.
    lastError = message
  }

  return { success: false, error: lastError ?? 'CAPI request failed after retries' }
}
