import { describe, it, expect, vi, afterEach } from "vitest"
import {
  buildChronologyEvents,
  truncateChronology,
  type ChronologySources,
} from "./behavior-chronology"

const EMPTY: ChronologySources = {
  messages: [],
  activities: [],
  followUps: [],
  tasks: [],
  appointments: [],
  visitFeedback: [],
}

describe("buildChronologyEvents", () => {
  it("junta as fontes e ordena por timestamp (AC2)", () => {
    const events = buildChronologyEvents({
      ...EMPTY,
      messages: [
        { role: "user", content: "Oi, quero saber do Vind", created_at: "2026-07-01T10:00:00Z" },
        { role: "assistant", content: "Olá! Posso ajudar", created_at: "2026-07-01T10:01:00Z" },
      ],
      activities: [
        {
          type: "broker_note",
          description: "Liguei, não atendeu",
          metadata: { acao: "ligacao" },
          created_at: "2026-07-03T14:41:00Z",
          userName: "Robson Silva",
        },
        {
          type: "stage_change",
          description: 'Etapa alterada de "1º Contato" para "Atendimento"',
          metadata: null,
          created_at: "2026-07-02T09:00:00Z",
        },
      ],
      appointments: [
        {
          scheduled_at: "2026-07-10T14:00:00Z",
          status: "no_show",
          location: "Decorado Vind",
          notes: null,
          created_at: "2026-07-05T11:00:00Z",
        },
      ],
      visitFeedback: [
        {
          visited_at: "2026-07-15T15:00:00Z",
          feedback: "Gostou do 3 quartos",
          interest_after: "hot",
          next_steps: "enviar simulação",
          created_at: "2026-07-15T16:00:00Z",
        },
      ],
      tasks: [
        {
          title: "Retorno - WhatsApp",
          action_type: "whatsapp",
          due_at: "2026-07-28T12:00:00Z",
          completed_at: null,
          created_at: "2026-07-16T12:18:00Z",
        },
      ],
      followUps: [
        {
          type: "nicole_sent",
          status: "sent",
          scheduled_at: null,
          sent_at: "2026-07-04T08:00:00Z",
          message: "Follow-up automático",
          created_at: "2026-07-04T07:00:00Z",
        },
      ],
    })

    // ordenado do mais antigo ao mais recente
    const times = events.map((e) => new Date(e.at).getTime())
    expect(times).toEqual([...times].sort((a, b) => a - b))

    // todas as fontes representadas
    const sources = events.map((e) => e.source)
    expect(sources).toContain("Mensagem (Lead)")
    expect(sources).toContain("Mensagem (Nicole)")
    expect(sources).toContain("Nota do corretor")
    expect(sources).toContain("Mudança de etapa")
    expect(sources).toContain("Agendamento")
    expect(sources).toContain("Feedback de visita")
    expect(sources).toContain("Tarefa criada")
    expect(sources).toContain("Follow-up")

    // conteúdo mapeado legível
    const nota = events.find((e) => e.source === "Nota do corretor")!
    expect(nota.description).toContain("Robson Silva")
    expect(nota.description).toContain("[ligacao]")
    const visita = events.find((e) => e.source === "Agendamento")!
    expect(visita.description).toContain("no-show")
    const fb = events.find((e) => e.source === "Feedback de visita")!
    expect(fb.description).toContain("Gostou do 3 quartos")
    expect(fb.description).toContain("interesse pós-visita: hot")
  })

  it("lead raso produz cronologia curta sem inventar eventos (AC3)", () => {
    const events = buildChronologyEvents(EMPTY)
    expect(events).toEqual([])
  })
})

describe("truncateChronology", () => {
  afterEach(() => vi.restoreAllMocks())

  it("não mexe quando abaixo do teto", () => {
    const events = [
      { at: "2026-07-01T10:00:00Z", source: "Mensagem (Lead)", description: "a" },
      { at: "2026-07-02T10:00:00Z", source: "Mensagem (Nicole)", description: "b" },
    ]
    expect(truncateChronology(events, 10)).toHaveLength(2)
  })

  it("corta os antigos preservando marcos e LOGA o corte (condição @po)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const events = [
      { at: "2026-07-01T10:00:00Z", source: "Mudança de etapa", description: "marco antigo" },
      ...Array.from({ length: 10 }, (_, i) => ({
        at: `2026-07-0${Math.min(9, i + 2)}T1${i % 10}:00:00Z`,
        source: "Mensagem (Lead)",
        description: `msg ${i}`,
      })),
    ]

    const result = truncateChronology(events, 5)
    expect(result.length).toBeLessThanOrEqual(5)
    // marco antigo sobrevive ao corte
    expect(result.some((e) => e.description === "marco antigo")).toBe(true)
    // mensagens mantidas são as mais recentes
    expect(result.some((e) => e.description === "msg 9")).toBe(true)
    expect(result.some((e) => e.description === "msg 0")).toBe(false)
    // corte nunca é silencioso
    expect(warn).toHaveBeenCalledOnce()
    // ordenação preservada
    const times = result.map((e) => new Date(e.at).getTime())
    expect(times).toEqual([...times].sort((a, b) => a - b))
  })
})
