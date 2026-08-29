import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendCapiEvents } from './capi-client'
import { buildVisitouEvent, buildCapiUserData, type CapiEvent } from './capi-payload'

function makeEvent(): CapiEvent {
  return buildVisitouEvent({
    eventId: 'visit_lead-1',
    eventTime: 1700000000,
    userData: buildCapiUserData({ leadId: 'lead-1' }),
  })
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response
}

describe('sendCapiEvents', () => {
  const OLD_ENV = { ...process.env }

  beforeEach(() => {
    process.env.META_CAPI_ACCESS_TOKEN = 'test-token'
    process.env.META_CAPI_DATASET_ID = '1337310707164669'
    vi.restoreAllMocks()
  })

  afterEach(() => {
    process.env = { ...OLD_ENV }
    vi.restoreAllMocks()
  })

  it('POSTs to the v25.0 /events endpoint of the dataset and returns eventsReceived on success', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { events_received: 1, fbtrace_id: 'abc' }))

    const result = await sendCapiEvents([makeEvent()])

    expect(result).toEqual({ success: true, eventsReceived: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://graph.facebook.com/v25.0/1337310707164669/events')
    expect(init?.method).toBe('POST')

    const parsedBody = JSON.parse(init?.body as string)
    expect(parsedBody.access_token).toBe('test-token')
    expect(parsedBody.data).toHaveLength(1)
    expect(parsedBody.test_event_code).toBeUndefined()
  })

  it('includes test_event_code in the body when provided', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { events_received: 1 }))

    await sendCapiEvents([makeEvent()], { testEventCode: 'TEST12345' })

    const parsedBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    expect(parsedBody.test_event_code).toBe('TEST12345')
  })

  it('omits test_event_code from the body when not provided', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { events_received: 1 }))

    await sendCapiEvents([makeEvent()])

    const parsedBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    expect('test_event_code' in parsedBody).toBe(false)
  })

  it('returns success=false with the Meta error message on a 4xx (fatal, no retry)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(400, {
        error: { message: 'Invalid parameter', code: 100, type: 'GraphMethodException' },
      }),
    )

    const result = await sendCapiEvents([makeEvent()])

    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid parameter')
    // 4xx is fatal → exactly one attempt.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries on 5xx and eventually succeeds', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(500, { error: { message: 'server' } }))
      .mockResolvedValueOnce(jsonResponse(200, { events_received: 1 }))

    const result = await sendCapiEvents([makeEvent()])

    expect(result).toEqual({ success: true, eventsReceived: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retries on network/timeout errors and returns the last error after exhausting retries', async () => {
    vi.useFakeTimers()
    try {
      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('The operation timed out'))

      const promise = sendCapiEvents([makeEvent()])
      // Drive the backoff sleeps between the 5 attempts without real waiting.
      await vi.runAllTimersAsync()
      const result = await promise

      expect(result.success).toBe(false)
      expect(result.error).toBe('The operation timed out')
      expect(fetchMock).toHaveBeenCalledTimes(5)
    } finally {
      vi.useRealTimers()
    }
  })

  it('returns an error when META_CAPI_ACCESS_TOKEN is missing (no fetch)', async () => {
    delete process.env.META_CAPI_ACCESS_TOKEN
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    const result = await sendCapiEvents([makeEvent()])

    expect(result.success).toBe(false)
    expect(result.error).toContain('META_CAPI_ACCESS_TOKEN')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // Story 86-9 — o dataset deixou de ser obrigatório: passou a ter valor padrão
  // no código, porque o id é PÚBLICO (aparece no HTML de qualquer site com Pixel)
  // e uma env faltando derrubaria o rastreamento em silêncio no meio de campanha
  // paga. O token continua obrigatório — esse sim é segredo (teste acima).
  it('cai no dataset padrão quando META_CAPI_DATASET_ID não está configurado', async () => {
    delete process.env.META_CAPI_DATASET_ID
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ events_received: 1 }), { status: 200 }),
    )

    const result = await sendCapiEvents([makeEvent()])

    expect(result.success).toBe(true)
    // A URL tem de apontar para o dataset da Trifold, não para 'undefined'.
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('/1337310707164669/events')
  })

  it('returns success with 0 events received when given an empty batch (no fetch)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    const result = await sendCapiEvents([])

    expect(result).toEqual({ success: true, eventsReceived: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('Story 900-23 — datasetId por organização (aditivo)', () => {
  const OLD_ENV = { ...process.env }

  beforeEach(() => {
    process.env.META_CAPI_ACCESS_TOKEN = 'test-token'
    process.env.META_CAPI_DATASET_ID = 'DA_ENV'
    vi.restoreAllMocks()
  })

  afterEach(() => {
    process.env = { ...OLD_ENV }
    vi.restoreAllMocks()
  })

  it('o datasetId das options tem prioridade sobre a env', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { events_received: 1 }))

    await sendCapiEvents([makeEvent()], { datasetId: 'DA_ORG' })

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('https://graph.facebook.com/v25.0/DA_ORG/events')
  })

  it('sem datasetId nas options, o comportamento é o de antes (env/fallback)', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { events_received: 1 }))

    await sendCapiEvents([makeEvent()])

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('https://graph.facebook.com/v25.0/DA_ENV/events')
  })
})
