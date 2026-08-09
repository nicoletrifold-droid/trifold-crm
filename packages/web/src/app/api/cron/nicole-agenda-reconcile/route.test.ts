/**
 * Story 87-3 — testes do cron de reconciliação fala × banco.
 *
 * O módulo puro (`packages/ai/src/flows/agenda-reconcile.ts`) já é testado no
 * pacote `ai`. Aqui prova-se só o que é da camada web e o que a AC4 exige:
 * auth, `?dry=1` sem efeito colateral, dedupe por `message_id` entre rodadas do
 * mesmo dia, e o alerta que NOMEIA o lead com o deep link.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const telegramMock = vi.fn()
vi.mock("@web/lib/telegram", () => ({
  sendTelegramAdminAlert: (...a: unknown[]) => telegramMock(...a),
}))

const logEventMock = vi.fn()
vi.mock("@web/lib/logger", () => ({
  logEvent: (...a: unknown[]) => logEventMock(...a),
}))

/** Eventos já em `system_events` — é daqui que o dedupe por `message_id` lê. */
let eventosExistentes: Array<{ metadata: Record<string, unknown> | null }> = []

function makeBuilder(table: string) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    gte: () => builder,
    then: (resolve: (v: { data: unknown; error: unknown }) => void) => {
      if (table === "system_events") return resolve({ data: eventosExistentes, error: null })
      return resolve({ data: [], error: null })
    },
  }
  return builder
}

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (t: string) => makeBuilder(t) }),
}))

const RELATORIO = {
  unidade: "fala" as const,
  janela: { desde: "2026-06-08T00:00:00.000Z", ate: "2026-08-07T00:00:00.000Z", dias: 60 },
  total_disparos: 30,
  descartes: { ligacao: 1, transicao_humana: 0, data_invalida: 0 },
  lembrete: 5,
  denominador: 24,
  com_lastro: 3,
  reparo_humano: 9,
  sem_lastro: 12,
  lastro_pct: 12.5,
  lastro_frouxo_pct: 50,
  lastro_frouxo_rotulo: "NÃO é lastro — inclui conserto humano posterior",
  sensibilidade: {
    ordem_normativa: { com_lastro: 3, lembrete: 5, denominador: 24, lastro_pct: 12.5 },
    lembrete_primeiro: { com_lastro: 0, lembrete: 8, denominador: 21, lastro_pct: 0 },
  },
  mensagens_lidas: 1157,
  linhas: [],
  alertas: [
    {
      lead_id: "lead-celia",
      lead_nome: "Célia",
      conversation_id: "c-celia",
      message_id: "m-celia",
      falado_em_brt: "2026-06-28 10:37",
      afirmado_para_brt: "2026-07-04 09:00",
      dia_afirmado_brt: "2026-07-04",
      trecho: "Perfeito! Agendei sua visita para este sábado às 9h.",
    },
  ],
}

const reconciliarMock = vi.fn(
  async (_supabase: unknown, _opts: { desde: Date; ate: Date; orgId?: string | null }) => RELATORIO
)
vi.mock("@trifold/ai", () => ({
  reconciliarAgenda: (...a: Parameters<typeof reconciliarMock>) => reconciliarMock(...a),
}))

const { GET } = await import("./route")

function req(qs = "", auth = "Bearer segredo") {
  return new Request(`https://x.test/api/cron/nicole-agenda-reconcile${qs}`, {
    headers: auth ? { authorization: auth } : {},
  }) as unknown as Parameters<typeof GET>[0]
}

beforeEach(() => {
  process.env.CRON_SECRET = "segredo"
  eventosExistentes = []
  telegramMock.mockClear()
  logEventMock.mockClear()
  reconciliarMock.mockClear()
})

describe("cron nicole-agenda-reconcile", () => {
  it("401 sem o Bearer do CRON_SECRET", async () => {
    const res = await GET(req("", "Bearer errado"))
    expect(res.status).toBe(401)
    expect(reconciliarMock).not.toHaveBeenCalled()
  })

  it("AC4-(ii) — ?dry=1 NÃO emite evento nem alerta", async () => {
    const res = await GET(req("?days=60&dry=1"))
    const body = await res.json()
    expect(body.dry).toBe(true)
    expect(body.lastro_pct).toBe(12.5)
    // O modo em que o baseline é produzido não pode ter efeito colateral.
    expect(logEventMock).not.toHaveBeenCalled()
    expect(telegramMock).not.toHaveBeenCalled()
  })

  it("emite o evento por caso, o resumo diário com o número, e o alerta nomeado", async () => {
    const res = await GET(req())
    const body = await res.json()
    expect(body.alertas_novos).toBe(1)

    const tipos = logEventMock.mock.calls.map((c) => (c[0] as { event_type: string }).event_type)
    expect(tipos).toContain("NICOLE_AFIRMACAO_SEM_LASTRO")
    expect(tipos).toContain("NICOLE_LASTRO_DIARIO")

    // O resumo diário publica o NÚMERO — é dele que o PM2 do Epic 88 sai. E ele
    // publica a SENSIBILIDADE da precedência junto (AC3-i-b-c).
    const resumo = logEventMock.mock.calls
      .map((c) => c[0] as { event_type: string; metadata: Record<string, unknown> })
      .find((e) => e.event_type === "NICOLE_LASTRO_DIARIO")!
    expect(resumo.metadata.unidade).toBe("fala")
    expect(resumo.metadata.lastro_pct).toBe(12.5)
    expect(resumo.metadata.denominador).toBe(24)
    expect(resumo.metadata.lembrete).toBe(5)
    expect(resumo.metadata.sensibilidade).toEqual(RELATORIO.sensibilidade)

    // O alerta NOMEIA o lead, a data, o horário afirmado e traz o deep link —
    // é o que faz valer a pena abrir mesmo com ~1 em 3 sendo falso positivo.
    expect(telegramMock).toHaveBeenCalledTimes(1)
    const msg = String(telegramMock.mock.calls[0]![0])
    expect(msg).toContain("Célia")
    expect(msg).toContain("2026-07-04 09:00")
    expect(msg).toContain("/dashboard/leads/lead-celia")
  })

  it("AC4-(i) — a segunda rodada do mesmo dia NÃO duplica evento nem alerta", async () => {
    await GET(req())
    expect(telegramMock).toHaveBeenCalledTimes(1)

    // Simula o que a primeira rodada deixou em `system_events`.
    eventosExistentes = [{ metadata: { message_id: "m-celia" } }]
    telegramMock.mockClear()
    logEventMock.mockClear()

    const res = await GET(req())
    const body = await res.json()
    expect(body.alertas_novos).toBe(0)
    expect(body.alertas_deduplicados).toBe(1)
    expect(telegramMock).not.toHaveBeenCalled()
    const tipos = logEventMock.mock.calls.map((c) => (c[0] as { event_type: string }).event_type)
    expect(tipos).not.toContain("NICOLE_AFIRMACAO_SEM_LASTRO")
    // O resumo diário continua saindo — é a métrica, não o alarme.
    expect(tipos).toContain("NICOLE_LASTRO_DIARIO")
  })

  it("?days é limitado e a janela é passada ao módulo", async () => {
    await GET(req("?days=9999"))
    const arg = reconciliarMock.mock.calls[0]![1]
    const dias = Math.round((arg.ate.getTime() - arg.desde.getTime()) / 86400_000)
    expect(dias).toBe(180) // MAX_DIAS
  })
})
