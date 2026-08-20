/**
 * Story 75-352 — testes do claim atômico de follow-up.
 *
 * O que importa aqui não é o SQL (esse foi validado em produção dentro de uma
 * transação revertida), é a DECISÃO do lado TypeScript:
 *
 *  1. RPC devolve id   → segue o envio
 *  2. RPC devolve null → NÃO envia (cooldown de pé / outra run reivindicou)
 *  3. RPC dá erro      → NÃO envia (fail-closed) e grita, sem lançar
 *  4. os parâmetros vão como o comportamento antigo exigia (blockingTypes,
 *     status 'pending' do alert_broker) — errar aqui muda semântica em silêncio
 *  5. `fecharClaim` grava o desfecho na linha reivindicada e nunca lança
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const logEventMock = vi.fn()
vi.mock("@web/lib/logger", () => ({
  logEvent: (params: Record<string, unknown>) => logEventMock(params),
}))

import { claimFollowUp, fecharClaim } from "./claim"

type RpcResult = { data: unknown; error: { message: string } | null }

interface Chamada {
  fn: string
  args: Record<string, unknown>
}

function makeSupabase(resultado: RpcResult, chamadas: Chamada[]) {
  return {
    rpc(fn: string, args: Record<string, unknown>) {
      chamadas.push({ fn, args })
      return Promise.resolve(resultado)
    },
  } as never
}

/** Stub de `.from().update().eq()` que registra o payload. */
function makeSupabaseUpdate(erro: { message: string } | null, capturado: Record<string, unknown>[]) {
  return {
    from() {
      return {
        update(payload: Record<string, unknown>) {
          capturado.push(payload)
          return {
            eq(_col: string, valor: string) {
              capturado.push({ __id: valor })
              return Promise.resolve({ error: erro })
            },
          }
        },
      }
    },
  } as never
}

describe("claimFollowUp", () => {
  beforeEach(() => {
    logEventMock.mockClear()
  })

  it("cenário 1: RPC devolve id → o chamador tem permissão de enviar", async () => {
    const chamadas: Chamada[] = []
    const id = await claimFollowUp({
      supabase: makeSupabase({ data: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", error: null }, chamadas),
      orgId: "org-1",
      leadId: "lead-1",
      type: "nicole_sent",
      ruleId: "rule-1",
    })

    expect(id).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
    expect(chamadas[0]!.fn).toBe("claim_follow_up")
    expect(logEventMock).not.toHaveBeenCalled()
  })

  it("cenário 2: RPC devolve null → cooldown de pé, NÃO envia, e não é erro", async () => {
    const chamadas: Chamada[] = []
    const id = await claimFollowUp({
      supabase: makeSupabase({ data: null, error: null }, chamadas),
      orgId: "org-1",
      leadId: "lead-1",
      type: "nicole_sent",
    })

    expect(id).toBeNull()
    // Perder a corrida é o comportamento esperado, não uma falha: nada de log de erro.
    expect(logEventMock).not.toHaveBeenCalled()
  })

  it("cenário 3: RPC com erro → fail-CLOSED (null) + log de erro, sem lançar", async () => {
    const chamadas: Chamada[] = []
    const id = await claimFollowUp({
      supabase: makeSupabase({ data: null, error: { message: "function does not exist" } }, chamadas),
      orgId: "org-1",
      leadId: "lead-1",
      type: "nicole_sent",
    })

    expect(id).toBeNull()
    expect(logEventMock).toHaveBeenCalledTimes(1)
    const logado = logEventMock.mock.calls[0]![0] as Record<string, unknown>
    expect(logado.level).toBe("error")
    expect(logado.event_type).toBe("FOLLOWUP_CLAIM_FALHOU")
    // A mensagem tem de dizer que NADA foi enviado — é o que evita a leitura errada
    // de "o cron rodou, então mandou".
    expect(String(logado.message)).toContain("NADA foi enviado")
  })

  it("cenário 4a: laço principal manda blockingTypes null (qualquer tipo bloqueia) e status claimed", async () => {
    const chamadas: Chamada[] = []
    await claimFollowUp({
      supabase: makeSupabase({ data: "id-1", error: null }, chamadas),
      orgId: "org-1",
      leadId: "lead-1",
      type: "nicole_sent",
      ruleId: "rule-1",
      metadata: { stage_id: "stage-1" },
    })

    expect(chamadas[0]!.args).toMatchObject({
      p_org_id: "org-1",
      p_lead_id: "lead-1",
      p_type: "nicole_sent",
      p_rule_id: "rule-1",
      p_cooldown_hours: 48,
      p_blocking_types: null,
      p_status: "claimed",
    })
  })

  it("cenário 4b: pós-visita bloqueia só pelo próprio tipo (semântica do .eq('type','post_visit'))", async () => {
    const chamadas: Chamada[] = []
    await claimFollowUp({
      supabase: makeSupabase({ data: "id-2", error: null }, chamadas),
      orgId: "org-1",
      leadId: "lead-1",
      type: "post_visit",
      blockingTypes: ["post_visit"],
    })

    expect(chamadas[0]!.args.p_blocking_types).toEqual(["post_visit"])
  })

  it("cenário 4c: alert_broker nasce 'pending' — é o status que a tela de Alertas lê", async () => {
    const chamadas: Chamada[] = []
    await claimFollowUp({
      supabase: makeSupabase({ data: "id-3", error: null }, chamadas),
      orgId: "org-1",
      leadId: "lead-1",
      type: "alert_broker",
      status: "pending",
    })

    expect(chamadas[0]!.args.p_status).toBe("pending")
  })
})

describe("fecharClaim", () => {
  beforeEach(() => {
    logEventMock.mockClear()
  })

  it("grava o desfecho na linha reivindicada", async () => {
    const capturado: Record<string, unknown>[] = []
    await fecharClaim(makeSupabaseUpdate(null, capturado), "claim-1", {
      status: "skipped",
      sentAt: null,
      message: "oi",
      metadata: { reason: "WHATSAPP_WINDOW_CLOSED", channel: "whatsapp" },
    })

    expect(capturado[0]).toMatchObject({
      status: "skipped",
      sent_at: null,
      message: "oi",
      metadata: { reason: "WHATSAPP_WINDOW_CLOSED", channel: "whatsapp" },
    })
    expect(capturado[1]).toEqual({ __id: "claim-1" })
    expect(logEventMock).not.toHaveBeenCalled()
  })

  it("entrega de verdade grava sent + sent_at", async () => {
    const capturado: Record<string, unknown>[] = []
    await fecharClaim(makeSupabaseUpdate(null, capturado), "claim-2", {
      status: "sent",
      sentAt: "2026-08-20T12:00:00.000Z",
      message: "oi",
    })

    expect(capturado[0]).toMatchObject({ status: "sent", sent_at: "2026-08-20T12:00:00.000Z" })
  })

  it("falha no desfecho grita, mas NÃO lança — a linha já segura o cooldown", async () => {
    const capturado: Record<string, unknown>[] = []
    await expect(
      fecharClaim(makeSupabaseUpdate({ message: "timeout" }, capturado), "claim-3", { status: "sent" })
    ).resolves.toBeUndefined()

    expect(logEventMock).toHaveBeenCalledTimes(1)
    const logado = logEventMock.mock.calls[0]![0] as Record<string, unknown>
    expect(logado.event_type).toBe("FOLLOWUP_CLAIM_SEM_DESFECHO")
    expect(logado.level).toBe("error")
  })
})
