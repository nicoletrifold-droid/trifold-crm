/**
 * Story 75-289 (AC2) — a bolha do corretor não pode dizer "Enviado" para o que
 * não foi entregue.
 *
 * Regressão-alvo: em 10/08 duas mensagens ficaram com `metadata.send_error =
 * 'HTTP_401'` no banco e apareceram na tela com o ✓ de enviado. Os corretores
 * seguiram a conversa achando que o lead tinha recebido.
 */
import { describe, it, expect } from "vitest"
import { resolveDeliveryStatus } from "./delivery-status"

describe("resolveDeliveryStatus", () => {
  it("mensagem do corretor SEM erro → enviada (mantém o ✓)", () => {
    const s = resolveDeliveryStatus({ role: "broker", metadata: { sent_via: "whatsapp" } })
    expect(s.state).toBe("sent")
    expect(s.canResend).toBe(false)
    expect(s.label).toBe("")
  })

  it("REGRESSÃO 10/08: send_error HTTP_401 → 'Não entregue' + oferece reenviar", () => {
    const s = resolveDeliveryStatus({
      role: "broker",
      metadata: { sent_via: "whatsapp", send_error: "HTTP_401" },
    })
    expect(s.state).toBe("failed")
    expect(s.label).toBe("Não entregue")
    expect(s.canResend).toBe(true)
    // A dica precisa ser inequívoca — é o que corrige a leitura errada da tela.
    expect(s.hint).toContain("NÃO chegou")
  })

  it("qualquer send_error conta, não só 401 (timeout, 5xx, SEND_FAILED)", () => {
    for (const erro of ["TIMEOUT", "HTTP_500", "SEND_FAILED", "HTTP_429"]) {
      const s = resolveDeliveryStatus({ role: "broker", metadata: { send_error: erro } })
      expect(s.state, erro).toBe("failed")
      expect(s.canResend, erro).toBe(true)
    }
  })

  it("janela de 24h fechada: avisa que não entregou mas NÃO oferece reenviar", () => {
    // Reenviar texto livre fora da janela seria recusado pela Meta de novo; o
    // caminho certo é a mensagem de abertura por template.
    const s = resolveDeliveryStatus({
      role: "broker",
      metadata: { send_error: "WHATSAPP_WINDOW_CLOSED" },
    })
    expect(s.state).toBe("window_closed")
    expect(s.label).toBe("Não entregue")
    expect(s.canResend).toBe(false)
    expect(s.hint).toContain("abertura")
  })

  it("send_error vazio ou não-string não vira falha (metadata legado)", () => {
    expect(resolveDeliveryStatus({ role: "broker", metadata: { send_error: "" } }).state).toBe("sent")
    expect(resolveDeliveryStatus({ role: "broker", metadata: { send_error: "   " } }).state).toBe("sent")
    expect(resolveDeliveryStatus({ role: "broker", metadata: { send_error: null } }).state).toBe("sent")
    expect(resolveDeliveryStatus({ role: "broker", metadata: null }).state).toBe("sent")
    expect(resolveDeliveryStatus({ role: "broker" }).state).toBe("sent")
  })

  it("lead, Nicole e sistema não exibem indicador de entrega", () => {
    for (const role of ["user", "assistant", "system"]) {
      const s = resolveDeliveryStatus({ role, metadata: { send_error: "HTTP_401" } })
      expect(s.state, role).toBe("none")
      expect(s.canResend, role).toBe(false)
    }
  })
})
