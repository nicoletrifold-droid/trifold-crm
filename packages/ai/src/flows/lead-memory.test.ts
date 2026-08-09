import { describe, it, expect, vi } from "vitest"
import { atualizarResumoComLastro, EVENTO_RESUMO_SEM_LASTRO, updateLeadMemory, type EventoDeResumo } from "./lead-memory"
import { createFakeSupabase } from "../chat/__fixtures__/fake-supabase"
import type { SupabaseClient } from "@supabase/supabase-js"

function createMockAnthropic(responseText: string) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: responseText }],
      }),
    },
  } as unknown as Parameters<typeof updateLeadMemory>[0]["anthropic"]
}

describe("updateLeadMemory", () => {
  it("calls Haiku with max_tokens 600 (AC4)", async () => {
    const mockAnthropic = createMockAnthropic("Resumo atualizado.")

    await updateLeadMemory({
      anthropic: mockAnthropic,
      currentSummary: null,
      userMessage: "Oi, sou a Fernanda",
      assistantMessage: "Oi Fernanda! Tudo bem?",
      collectedData: { name: "Fernanda" },
    })

    const createCall = (mockAnthropic.messages.create as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(createCall.max_tokens).toBe(600)
  })

  it("includes anti-truncation instruction in prompt (AC5)", async () => {
    const mockAnthropic = createMockAnthropic("Resumo.")

    await updateLeadMemory({
      anthropic: mockAnthropic,
      currentSummary: "Resumo anterior.",
      userMessage: "Quero 3 quartos",
      assistantMessage: "Temos opcoes de 3 quartos!",
      collectedData: { name: "Fernanda", bedrooms: 3 },
    })

    const createCall = (mockAnthropic.messages.create as ReturnType<typeof vi.fn>).mock.calls[0][0]
    const prompt = createCall.messages[0].content
    expect(prompt).toContain("NUNCA ultrapasse 80 palavras")
  })

  it("returns new summary on success (AC7)", async () => {
    const mockAnthropic = createMockAnthropic("Fernanda busca 3 quartos no Vind.")

    const result = await updateLeadMemory({
      anthropic: mockAnthropic,
      currentSummary: "Fernanda interessada.",
      userMessage: "Quero 3 quartos",
      assistantMessage: "Temos opcoes!",
      collectedData: { name: "Fernanda", bedrooms: 3 },
    })

    expect(result).toBe("Fernanda busca 3 quartos no Vind.")
  })

  it("returns currentSummary on API error", async () => {
    const mockAnthropic = {
      messages: {
        create: vi.fn().mockRejectedValue(new Error("API timeout")),
      },
    } as unknown as Parameters<typeof updateLeadMemory>[0]["anthropic"]

    const result = await updateLeadMemory({
      anthropic: mockAnthropic,
      currentSummary: "Resumo existente.",
      userMessage: "Oi",
      assistantMessage: "Ola!",
      collectedData: {},
    })

    expect(result).toBe("Resumo existente.")
  })

  it("passes currentSummary correctly to Haiku prompt (AC2/AC7)", async () => {
    const mockAnthropic = createMockAnthropic("Novo resumo.")

    await updateLeadMemory({
      anthropic: mockAnthropic,
      currentSummary: "Base correta do resumo.",
      userMessage: "Oi",
      assistantMessage: "Ola!",
      collectedData: {},
    })

    const createCall = (mockAnthropic.messages.create as ReturnType<typeof vi.fn>).mock.calls[0][0]
    const prompt = createCall.messages[0].content
    expect(prompt).toContain("Base correta do resumo.")
  })

  it("uses first-contact message when currentSummary is null", async () => {
    const mockAnthropic = createMockAnthropic("Primeiro contato.")

    await updateLeadMemory({
      anthropic: mockAnthropic,
      currentSummary: null,
      userMessage: "Oi",
      assistantMessage: "Bem-vinda!",
      collectedData: {},
    })

    const createCall = (mockAnthropic.messages.create as ReturnType<typeof vi.fn>).mock.calls[0][0]
    const prompt = createCall.messages[0].content
    expect(prompt).toContain("Primeiro contato.")
  })
})

/**
 * Story 87-7 / AC2-(i) — O ESCRITOR A, com o guarda de escrita.
 *
 * `createFakeSupabase` aplica os predicados DE VERDADE (o @qa provou isso na R8
 * da 75-279): o `.eq("id", leadId)` do update e o `.eq("lead_id")` da consulta de
 * appointments são executados, então o teste prova a gravação, não a intenção.
 */
describe("AC2-(i) — o resumo sem lastro NÃO é gravado pelo escritor A", () => {
  const HOJE = new Date("2026-08-08T13:00:00Z") // sábado, 10:00 BRT
  const RESUMO_ANTERIOR = "Lucimara busca 2 suítes no Vind, vista frente, sem vaga."
  /** Literal de produção (Lucimara, 04/08) — a frase que a story existe para barrar. */
  const RESUMO_CONTAMINADO =
    "Marcou visita ao decorado para o dia 8 (sábado), mas precisa confirmar o horário de trabalho antes de finalizar o agendamento."

  function cenario(opts: { resumoNovo: string; appointments?: Array<Record<string, unknown>> }) {
    const supabase = createFakeSupabase({
      leads: [{ id: "lead-1", ai_summary: RESUMO_ANTERIOR }],
      appointments: opts.appointments ?? [],
    })
    const eventos: EventoDeResumo[] = []
    return {
      supabase,
      eventos,
      run: () =>
        atualizarResumoComLastro({
          supabase: supabase as unknown as SupabaseClient,
          anthropic: createMockAnthropic(opts.resumoNovo),
          leadId: "lead-1",
          conversationId: "conv-1",
          currentSummary: RESUMO_ANTERIOR,
          userMessage: "Consigo confirmar depois",
          assistantMessage: "Perfeito! Deixei sua visita marcada para sábado, dia 8.",
          collectedData: { name: "Lucimara" },
          now: HOJE,
          onEvent: (e) => eventos.push(e),
        }),
    }
  }

  it("🔴 resumo contaminado + ZERO appointments → `ai_summary` continua BYTE A BYTE o anterior", async () => {
    const c = cenario({ resumoNovo: RESUMO_CONTAMINADO })
    const r = await c.run()

    expect(r.gravou).toBe(false)
    expect(r.veredicto).toBe("sem_lastro")
    expect(c.supabase.table("leads")[0]!.ai_summary).toBe(RESUMO_ANTERIOR)
  })

  it("🔴 e o evento sai pelo `onEvent`, com origem, citação e dia afirmado (AC8)", async () => {
    const c = cenario({ resumoNovo: RESUMO_CONTAMINADO })
    await c.run()

    const ev = c.eventos.find((e) => e.event_type === EVENTO_RESUMO_SEM_LASTRO)
    expect(ev, "o bloqueio precisa ser contável").toBeTruthy()
    expect(ev!.level).toBe("warn")
    expect(ev!.category).toBe("ai")
    expect(ev!.metadata!.origem).toBe("pipeline")
    expect(ev!.metadata!.veredicto).toBe("sem_lastro")
    expect(ev!.metadata!.lead_id).toBe("lead-1")
    expect(ev!.metadata!.conversation_id).toBe("conv-1")
    expect(ev!.metadata!.dia_afirmado).toBe("2026-08-08")
    expect(String(ev!.metadata!.citacao_curta)).toContain("Marcou visita ao decorado")
    expect(String(ev!.metadata!.citacao_curta).length).toBeLessThanOrEqual(120)
  })

  it("AC3 — o MESMO resumo, com appointment no dia, É gravado e não emite bloqueio", async () => {
    const c = cenario({
      resumoNovo: RESUMO_CONTAMINADO,
      appointments: [
        { id: "appt-1", lead_id: "lead-1", scheduled_at: "2026-08-08T13:00:00+00", status: "scheduled" },
      ],
    })
    const r = await c.run()

    expect(r.gravou).toBe(true)
    expect(r.veredicto).toBe("com_lastro")
    expect(c.supabase.table("leads")[0]!.ai_summary).toBe(RESUMO_CONTAMINADO)
    expect(c.eventos.find((e) => e.event_type === EVENTO_RESUMO_SEM_LASTRO)).toBeUndefined()
  })

  it("resumo que não fala de agenda é gravado normalmente, sem evento", async () => {
    const novo = "Lucimara busca 2 suítes no Vind, andar alto, e quer simulação."
    const c = cenario({ resumoNovo: novo })
    const r = await c.run()

    expect(r.gravou).toBe(true)
    expect(r.veredicto).toBe("sem_afirmacao")
    expect(c.supabase.table("leads")[0]!.ai_summary).toBe(novo)
    expect(c.eventos).toHaveLength(0)
  })

  it("`indeterminado` GRAVA (fail-open declarado) — e ainda assim é contado", async () => {
    const c = cenario({ resumoNovo: "O lead já possui visita agendada no stand." })
    const r = await c.run()

    expect(r.gravou).toBe(true)
    expect(r.veredicto).toBe("indeterminado")
    const ev = c.eventos.find((e) => e.event_type === EVENTO_RESUMO_SEM_LASTRO)
    expect(ev!.metadata!.veredicto).toBe("indeterminado")
    expect(ev!.level).toBe("info") // conta, mas não alarma
  })

  it("AC5 — o prompt do escritor A leva o bloco FATO DE AGENDA e proíbe data relativa", async () => {
    const anthropic = createMockAnthropic("Resumo qualquer.")
    const supabase = createFakeSupabase({
      leads: [{ id: "lead-1", ai_summary: null }],
      appointments: [
        { id: "appt-1", lead_id: "lead-1", scheduled_at: "2026-08-05T13:30:00+00", status: "completed" },
      ],
    })
    await atualizarResumoComLastro({
      supabase: supabase as unknown as SupabaseClient,
      anthropic,
      leadId: "lead-1",
      conversationId: "conv-1",
      currentSummary: null,
      userMessage: "Oi",
      assistantMessage: "Olá!",
      collectedData: {},
      now: HOJE,
    })

    const prompt = (anthropic.messages.create as ReturnType<typeof vi.fn>).mock.calls[0]![0]
      .messages[0].content as string
    expect(prompt).toContain("FATO DE AGENDA")
    // AC11 — appointment no passado NUNCA vira fato em tempo presente.
    expect(prompt).toContain("A última visita registrada foi em 05/08/2026.")
    expect(prompt).toContain("DATA ABSOLUTA")
    // A fala da Nicole continua entrando — ROTULADA (ratificação do @po, 08/08).
    expect(prompt).toContain("CONTEXTO (fala da Nicole — NAO e fato")
    expect(prompt).not.toContain('Nicole: "Olá!"')
  })

  it("fail-open: falha na consulta de appointments GRAVA como hoje", async () => {
    const supabase = {
      from: (t: string) =>
        t === "appointments"
          ? { select: () => { throw new Error("boom") } }
          : createFakeSupabase({ leads: [{ id: "lead-1", ai_summary: null }] }).from(t),
    }
    const r = await atualizarResumoComLastro({
      supabase: supabase as unknown as SupabaseClient,
      anthropic: createMockAnthropic(RESUMO_CONTAMINADO),
      leadId: "lead-1",
      conversationId: "conv-1",
      currentSummary: RESUMO_ANTERIOR,
      userMessage: "ok",
      assistantMessage: "ok",
      collectedData: {},
      now: HOJE,
    })
    // Bloquear por bug/indisponibilidade do guarda seria pior que o defeito.
    expect(r.gravou).toBe(true)
  })
})
