import { describe, it, expect, vi, beforeEach } from "vitest"

// O lib de calendário lê env vars no topo do módulo — mock antes de importar o helper.
const createCalendarEvent = vi.fn()
const updateCalendarEvent = vi.fn()
const deleteCalendarEvent = vi.fn()

vi.mock("@web/lib/google-calendar", () => ({
  createCalendarEvent: (...a: unknown[]) => createCalendarEvent(...a),
  updateCalendarEvent: (...a: unknown[]) => updateCalendarEvent(...a),
  deleteCalendarEvent: (...a: unknown[]) => deleteCalendarEvent(...a),
}))

const { mirrorCreate, mirrorUpdate, mirrorDelete } = await import("./google-mirror")

/**
 * Fake mínimo do PostgREST: registra os `.update()` que aconteceram e devolve a metadata
 * configurada no `.single()`. Precisa encadear igual ao cliente real.
 */
function fakeDb(existingMetadata: Record<string, unknown> | null = null) {
  const updates: Record<string, unknown>[] = []
  const client = {
    from: () => ({
      update: (fields: Record<string, unknown>) => {
        updates.push(fields)
        return { eq: () => Promise.resolve({ data: null, error: null }) }
      },
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: { metadata: existingMetadata }, error: null }),
        }),
      }),
    }),
  }
  return { client: client as never, updates }
}

const APPT = {
  id: "appt-1",
  scheduled_at: "2026-08-10T18:00:00.000Z",
  duration_minutes: 60,
  location: "Stand Trifold",
  notes: "cliente pediz manhã",
  client_name: "Maria",
  team: "house" as const,
}

beforeEach(() => {
  createCalendarEvent.mockReset()
  updateCalendarEvent.mockReset()
  deleteCalendarEvent.mockReset()
})

describe("mirrorCreate", () => {
  it("cria o evento e persiste o google_event_id", async () => {
    createCalendarEvent.mockResolvedValue("ev-123")
    const { client, updates } = fakeDb()

    const id = await mirrorCreate(client, APPT)

    expect(id).toBe("ev-123")
    expect(updates).toEqual([{ google_event_id: "ev-123" }])
  })

  it("passa a janela certa: fim = início + duration_minutes", async () => {
    createCalendarEvent.mockResolvedValue("ev-1")
    const { client } = fakeDb()

    await mirrorCreate(client, { ...APPT, duration_minutes: 90 })

    const arg = createCalendarEvent.mock.calls[0]![0] as { startAt: Date; endAt: Date }
    expect(arg.endAt.getTime() - arg.startAt.getTime()).toBe(90 * 60000)
  })

  it("sem duration_minutes assume 60 (compromisso de 1h)", async () => {
    createCalendarEvent.mockResolvedValue("ev-1")
    const { client } = fakeDb()

    await mirrorCreate(client, { ...APPT, duration_minutes: null })

    const arg = createCalendarEvent.mock.calls[0]![0] as { startAt: Date; endAt: Date }
    expect(arg.endAt.getTime() - arg.startAt.getTime()).toBe(60 * 60000)
  })

  it("repassa o team para o lib (é lá que o prefixo [IMOB] é aplicado, num só lugar)", async () => {
    createCalendarEvent.mockResolvedValue("ev-1")
    const { client } = fakeDb()

    await mirrorCreate(client, { ...APPT, team: "imob" })

    expect((createCalendarEvent.mock.calls[0]![0] as { team?: string }).team).toBe("imob")
  })

  it("AC7 — falha do Google NÃO lança e fica registrada em metadata.google_sync", async () => {
    createCalendarEvent.mockResolvedValue(null)
    const { client, updates } = fakeDb()

    const id = await mirrorCreate(client, APPT)

    expect(id).toBeNull()
    const meta = updates[0]!.metadata as Record<string, unknown>
    const sync = meta.google_sync as Record<string, unknown>
    expect(sync.ok).toBe(false)
    expect(sync.action).toBe("create")
  })

  it("🔥 ao registrar a falha, PRESERVA a metadata que já existia", async () => {
    createCalendarEvent.mockResolvedValue(null)
    // Metadata real de visita vinda do link da imobiliária (Story 81-6 usa na tela).
    const { client, updates } = fakeDb({
      origem: "link_imob",
      imobiliaria_nome: "Imobiliária Alfa",
      corretor_parceiro: { nome: "João", telefone: "44999" },
    })

    await mirrorCreate(client, { ...APPT, team: "imob" })

    const meta = updates[0]!.metadata as Record<string, unknown>
    expect(meta.origem).toBe("link_imob")
    expect(meta.imobiliaria_nome).toBe("Imobiliária Alfa")
    expect(meta.corretor_parceiro).toEqual({ nome: "João", telefone: "44999" })
    expect((meta.google_sync as Record<string, unknown>).ok).toBe(false)
  })

  it("exceção inesperada também não lança para fora", async () => {
    createCalendarEvent.mockRejectedValue(new Error("boom"))
    const { client } = fakeDb()

    await expect(mirrorCreate(client, APPT)).resolves.toBeNull()
  })
})

describe("mirrorUpdate — a lacuna do café na hora errada", () => {
  it("AC2 — com evento existente, MOVE (patch) em vez de recriar", async () => {
    updateCalendarEvent.mockResolvedValue(true)
    const { client } = fakeDb()

    await mirrorUpdate(client, { ...APPT, google_event_id: "ev-9" })

    expect(updateCalendarEvent).toHaveBeenCalledTimes(1)
    expect(updateCalendarEvent.mock.calls[0]![0]).toBe("ev-9")
    expect(createCalendarEvent).not.toHaveBeenCalled()
  })

  it("sem google_event_id (appointment da época em que estava desligado) CRIA", async () => {
    createCalendarEvent.mockResolvedValue("ev-novo")
    const { client, updates } = fakeDb()

    await mirrorUpdate(client, { ...APPT, google_event_id: null })

    expect(createCalendarEvent).toHaveBeenCalledTimes(1)
    expect(updateCalendarEvent).not.toHaveBeenCalled()
    expect(updates).toEqual([{ google_event_id: "ev-novo" }])
  })

  it("evento sumiu do Google (patch falha) → recria, para a visita não ficar fora do calendário", async () => {
    updateCalendarEvent.mockResolvedValue(false)
    createCalendarEvent.mockResolvedValue("ev-recriado")
    const { client, updates } = fakeDb()

    await mirrorUpdate(client, { ...APPT, google_event_id: "ev-morto" })

    expect(createCalendarEvent).toHaveBeenCalledTimes(1)
    expect(updates).toEqual([{ google_event_id: "ev-recriado" }])
  })
})

describe("mirrorDelete", () => {
  it("apaga no Google e limpa a coluna (id morto faria remarcação futura falhar)", async () => {
    deleteCalendarEvent.mockResolvedValue(undefined)
    const { client, updates } = fakeDb()

    await mirrorDelete(client, "appt-1", "ev-5")

    expect(deleteCalendarEvent).toHaveBeenCalledWith("ev-5")
    expect(updates).toEqual([{ google_event_id: null }])
  })

  it("sem evento é no-op — não chama o Google nem escreve no banco", async () => {
    const { client, updates } = fakeDb()

    await mirrorDelete(client, "appt-1", null)

    expect(deleteCalendarEvent).not.toHaveBeenCalled()
    expect(updates).toEqual([])
  })
})
