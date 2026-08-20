/**
 * Story 75-352 — testes da trava de run.
 *
 * A assimetria de fail-safe é o ponto central e é fácil de inverter sem perceber:
 *
 *  · trava de RUN   → fail-OPEN  (banco fora não pode significar "ninguém recebe
 *                                 follow-up"; quem impede envio duplicado é o
 *                                 claim por lead)
 *  · claim por LEAD → fail-CLOSED (ver claim.test.ts)
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const logEventMock = vi.fn()
vi.mock("@web/lib/logger", () => ({
  logEvent: (params: Record<string, unknown>) => logEventMock(params),
}))

import { claimCronRun, finishCronRun, INTERVALO_MINIMO_FOLLOWUP_SEGUNDOS } from "./claim-run"

interface Chamada {
  fn: string
  args: Record<string, unknown>
}

function makeSupabase(
  resultado: { data: unknown; error: { message: string } | null },
  chamadas: Chamada[]
) {
  return {
    rpc(fn: string, args: Record<string, unknown>) {
      chamadas.push({ fn, args })
      return Promise.resolve(resultado)
    },
  } as never
}

describe("claimCronRun", () => {
  beforeEach(() => {
    logEventMock.mockClear()
  })

  it("primeira invocação da janela: ganha a run e recebe o run_id", async () => {
    const chamadas: Chamada[] = []
    const r = await claimCronRun(
      makeSupabase({ data: "run-1", error: null }, chamadas),
      "followup",
      INTERVALO_MINIMO_FOLLOWUP_SEGUNDOS
    )

    expect(r).toEqual({ runId: "run-1", claimed: true })
    expect(chamadas[0]!.fn).toBe("claim_cron_run")
    expect(chamadas[0]!.args).toEqual({
      p_job: "followup",
      p_min_interval_seconds: 5400,
    })
  })

  it("invocação duplicada: RPC devolve null → claimed=false, e o cron deve sair", async () => {
    const chamadas: Chamada[] = []
    const r = await claimCronRun(makeSupabase({ data: null, error: null }, chamadas), "followup", 5400)

    expect(r).toEqual({ runId: null, claimed: false })
    // Duplicata é o caso esperado do problema que a story ataca, não erro de infra.
    expect(logEventMock).not.toHaveBeenCalled()
  })

  it("RPC com erro: fail-OPEN — a run SEGUE sem trava, gritando no log", async () => {
    const chamadas: Chamada[] = []
    const r = await claimCronRun(
      makeSupabase({ data: null, error: { message: "relation cron_locks does not exist" } }, chamadas),
      "followup",
      5400
    )

    expect(r.claimed).toBe(true)
    expect(r.runId).toBeNull()
    expect(logEventMock).toHaveBeenCalledTimes(1)
    const logado = logEventMock.mock.calls[0]![0] as Record<string, unknown>
    expect(logado.level).toBe("error")
    expect(logado.event_type).toBe("CRON_LOCK_INDISPONIVEL")
  })

  it("o intervalo mínimo do follow-up é de 90 minutos (cron de 2 em 2 horas)", () => {
    expect(INTERVALO_MINIMO_FOLLOWUP_SEGUNDOS).toBe(90 * 60)
  })
})

describe("finishCronRun", () => {
  beforeEach(() => {
    logEventMock.mockClear()
  })

  it("grava o recibo com os contadores da run", async () => {
    const chamadas: Chamada[] = []
    await finishCronRun(makeSupabase({ data: null, error: null }, chamadas), "run-1", {
      messages_sent: 3,
      duplicatas_evitadas: 0,
    })

    expect(chamadas[0]!.fn).toBe("finish_cron_run")
    expect(chamadas[0]!.args).toEqual({
      p_run_id: "run-1",
      p_result: { messages_sent: 3, duplicatas_evitadas: 0 },
    })
  })

  it("sem run_id (trava indisponível) não chama o banco", async () => {
    const chamadas: Chamada[] = []
    await finishCronRun(makeSupabase({ data: null, error: null }, chamadas), null, { messages_sent: 0 })

    expect(chamadas).toHaveLength(0)
  })

  it("falha ao gravar o recibo é warn, não erro: a trava não depende dele", async () => {
    const chamadas: Chamada[] = []
    await expect(
      finishCronRun(makeSupabase({ data: null, error: { message: "timeout" } }, chamadas), "run-1", {})
    ).resolves.toBeUndefined()

    const logado = logEventMock.mock.calls[0]![0] as Record<string, unknown>
    expect(logado.level).toBe("warn")
    expect(logado.event_type).toBe("CRON_RECIBO_NAO_GRAVOU")
  })
})
