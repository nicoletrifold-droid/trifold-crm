/**
 * Story 75-367 — o relatório semanal chegou DUAS vezes (dois `emailId` no Resend,
 * `delivered` às 02:01:52Z e 02:02:49Z de 24/08). A trava de run da 75-352 existia
 * mas só o `followup` a usava.
 *
 * O que estes testes seguram é a assimetria de fail-safe, que é fácil de inverter
 * sem perceber ao copiar o `followup`:
 *
 *  · perdeu a corrida (`claimed === false`)          → não envia, loga RUN_DUPLICADA
 *  · RPC falhou (`claimed === true && runId === null`) → NÃO envia (fail-CLOSED)
 *
 * O segundo caso é o delicado: o helper compartilhado `claimCronRun` é fail-OPEN de
 * propósito (o `followup` tem uma segunda trava por lead cobrindo o caso). Aqui não
 * há segunda trava, então o fail-closed é do chamador. Se alguém "consertar" a
 * assimetria mexendo no helper, o teste de fail-open em `claim-run.test.ts` quebra;
 * se mexer só aqui, quebra este.
 *
 * Nenhuma rede real: `Resend`, `buildAnalyticsReportData` e `renderToBuffer` são mocks.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"

vi.mock("server-only", () => ({}))

const ORG = "00000000-0000-0000-0000-000000000001"

/** Resposta que o `claim_cron_run` vai devolver na chamada da vez. */
let claimResult: { data: unknown; error: { message: string } | null }
/** Organizações que o select devolve. */
let orgs: Array<{ id: string; name: string }> | null
/** Erro que o `resend.emails.send` devolve (null = entregou). */
let sendError: { message: string } | null

interface Rpc {
  fn: string
  args: Record<string, unknown>
}
let rpcs: Rpc[]
/** Assuntos dos e-mails que o Resend recebeu — o que este teste existe para observar. */
let emailsEnviados: Array<Record<string, unknown>>
let eventosLogados: Array<Record<string, unknown>>
let dadosMontados: number
let pdfsRenderizados: number

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcs.push({ fn, args })
      if (fn === "claim_cron_run") return Promise.resolve(claimResult)
      return Promise.resolve({ data: null, error: null })
    },
    from: () => ({
      select: () => Promise.resolve({ data: orgs, error: null }),
    }),
  }),
}))

vi.mock("@web/lib/logger", () => ({
  logEvent: (params: Record<string, unknown>) => {
    eventosLogados.push(params)
  },
  logEventOnce: async (params: Record<string, unknown>) => {
    eventosLogados.push(params)
    return { inserted: true }
  },
}))

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async (params: Record<string, unknown>) => {
        emailsEnviados.push(params)
        return { data: null, error: sendError }
      },
    }
  },
}))

vi.mock("@web/lib/analytics-report-data", () => ({
  buildAnalyticsReportData: async () => {
    dadosMontados++
    return {
      periodRange: "16 de ago. – 23 de ago.",
      rangeLabel: "Últimos 7 dias",
      entradas: 69,
      entradasDelta: 4,
      ativos: 51,
      visitasRealizadas: 2,
      visitou: 1,
      perdidos: 9,
    }
  },
}))

vi.mock("@react-pdf/renderer", () => ({
  renderToBuffer: async () => {
    pdfsRenderizados++
    return Buffer.from("%PDF-fake")
  },
}))

vi.mock("@web/lib/pdf/analytics-report-pdf", () => ({
  AnalyticsReportPDF: () => null,
}))

async function chamar(authorization = "Bearer segredo") {
  const { GET } = await import("./route")
  const req = { headers: new Headers({ authorization }) }
  return GET(req as never)
}

beforeEach(() => {
  vi.resetModules()
  process.env.CRON_SECRET = "segredo"
  process.env.RESEND_API_KEY = "re_fake"
  process.env.ANALYTICS_REPORT_EMAILS = "alexandre@trifold.eng.br,marcos@trifold.eng.br"
  claimResult = { data: "run-1", error: null }
  orgs = [{ id: ORG, name: "Trifold Engenharia" }]
  sendError = null
  rpcs = []
  emailsEnviados = []
  eventosLogados = []
  dadosMontados = 0
  pdfsRenderizados = 0
})

describe("GET /api/cron/analytics-report — trava de run (Story 75-367)", () => {
  it("ganhou a corrida: envia o relatório e fecha o recibo com os contadores", async () => {
    const res = await chamar()

    expect(await res.json()).toEqual({ sent: 1, errors: 0 })

    // A trava é reivindicada com o job e o intervalo desta rota.
    expect(rpcs[0]).toEqual({
      fn: "claim_cron_run",
      args: { p_job: "analytics-report", p_min_interval_seconds: 144 * 60 * 60 },
    })

    // O caminho vencedor preserva o comportamento atual: um e-mail, com anexo,
    // para a lista de destinatários, com os números do período no corpo.
    expect(emailsEnviados).toHaveLength(1)
    const email = emailsEnviados[0]!
    expect(email.to).toEqual(["alexandre@trifold.eng.br", "marcos@trifold.eng.br"])
    expect(email.subject).toBe("Resumo semanal de leads · 16 de ago. – 23 de ago.")
    expect(String(email.html)).toContain("<strong>69</strong>")
    expect((email.attachments as Array<{ contentType: string }>)[0]!.contentType).toBe(
      "application/pdf"
    )
    expect(dadosMontados).toBe(1)
    expect(pdfsRenderizados).toBe(1)

    // Recibo aguardado antes do response (AC5).
    expect(rpcs[1]).toEqual({
      fn: "finish_cron_run",
      args: { p_run_id: "run-1", p_result: { sent: 1, errors: 0 } },
    })
  })

  it("perdeu a corrida: não monta dado, não renderiza PDF, não chama o Resend", async () => {
    claimResult = { data: null, error: null }

    const res = await chamar()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      sent: 0,
      errors: 0,
      skipped_reason: "already_running",
    })

    expect(emailsEnviados).toHaveLength(0)
    expect(dadosMontados).toBe(0)
    expect(pdfsRenderizados).toBe(0)

    // O rastro é o que torna o AC1 verificável em produção: sem esta linha,
    // "chegou um e-mail só" não distingue "a trava pegou" de "o gatilho sumiu".
    const duplicada = eventosLogados.find(
      (e) => e.event_type === "ANALYTICS_REPORT_RUN_DUPLICADA"
    )
    expect(duplicada).toBeDefined()
    expect(duplicada!.category).toBe("cron")
    expect(duplicada!.metadata).toEqual({
      job: "analytics-report",
      intervalo_minimo_s: 144 * 60 * 60,
    })

    // Sem run reivindicada não há recibo a fechar.
    expect(rpcs.filter((r) => r.fn === "finish_cron_run")).toHaveLength(0)
  })

  it("RPC do claim falhou: FAIL-CLOSED — não envia nada, mesmo com o helper fail-open", async () => {
    claimResult = { data: null, error: { message: "relation cron_locks does not exist" } }

    const res = await chamar()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      sent: 0,
      errors: 0,
      skipped_reason: "claim_indisponivel",
    })

    expect(emailsEnviados).toHaveLength(0)
    expect(dadosMontados).toBe(0)
    expect(pdfsRenderizados).toBe(0)

    const indisponivel = eventosLogados.find(
      (e) => e.event_type === "ANALYTICS_REPORT_CLAIM_INDISPONIVEL"
    )
    expect(indisponivel).toBeDefined()
    expect(indisponivel!.category).toBe("cron")
    expect(indisponivel!.level).toBe("error")

    expect(rpcs.filter((r) => r.fn === "finish_cron_run")).toHaveLength(0)
  })

  it("sem organização: fecha o recibo antes de sair (finished_at não fica nulo)", async () => {
    orgs = []

    const res = await chamar()

    expect(await res.json()).toEqual({ sent: 0, message: "No organizations found" })
    expect(emailsEnviados).toHaveLength(0)
    expect(rpcs[1]).toEqual({
      fn: "finish_cron_run",
      args: { p_run_id: "run-1", p_result: { sent: 0, errors: 0 } },
    })
  })

  it("falha no envio conta em errors e ainda assim fecha o recibo", async () => {
    sendError = { message: "domain not verified" }

    const res = await chamar()

    expect(await res.json()).toEqual({ sent: 0, errors: 1 })
    expect(rpcs[1]!.args).toEqual({
      p_run_id: "run-1",
      p_result: { sent: 0, errors: 1 },
    })
  })

  it("sem authorization não reivindica a trava (nada de superfície pré-auth)", async () => {
    const res = await chamar("Bearer errado")

    expect(res.status).toBe(401)
    expect(rpcs).toHaveLength(0)
  })

  it("declara maxDuration = 300 (o render do PDF leva ~105s)", async () => {
    const mod = await import("./route")
    expect(mod.maxDuration).toBe(300)
  })
})
