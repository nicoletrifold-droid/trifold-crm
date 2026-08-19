import { describe, it, expect } from "vitest"
import { registroDoPosVisita } from "./post-visit-record"

/**
 * Story 75-350 — os testes que travam as DUAS mentiras que existiam em produção.
 *
 * Não são casos hipotéticos: cada `🔥` abaixo é um comportamento que estava no ar.
 */
describe("75-350 — registroDoPosVisita", () => {
  it("entregou: grava sent, sent_at e a mensagem na conversa", () => {
    const r = registroDoPosVisita({ sent: true, channel: "whatsapp" }, "hot")
    expect(r.status).toBe("sent")
    expect(r.gravarSentAt).toBe(true)
    expect(r.gravarMensagem).toBe(true)
    expect(r.descricao).toContain("enviou")
    expect(r.descricao).toContain("hot")
    expect(r.descricao).toContain("whatsapp")
  })

  it("🔥 fora da janela de 24h: NÃO grava mensagem na conversa", () => {
    // A porta do feedback gravava a mensagem de todo jeito — a conversa do CRM
    // mostrava uma fala da Nicole que o lead nunca recebeu.
    const r = registroDoPosVisita(
      { sent: false, channel: "whatsapp", reason: "WHATSAPP_WINDOW_CLOSED" },
      "cold"
    )
    expect(r.status).toBe("skipped")
    expect(r.gravarSentAt).toBe(false)
    expect(r.gravarMensagem).toBe(false)
    expect(r.descricao).toContain("NAO enviou")
    expect(r.descricao).toContain("fora da janela de 24h")
  })

  it("🔥 erro de API NÃO conta como enviado", () => {
    // O cron gravava `status: "sent"` para qualquer falha que não fosse a janela:
    // `skipped = !sent && reason === WHATSAPP_WINDOW_CLOSED`. Um API_ERROR da
    // Graph API entrava no banco como entregue.
    const r = registroDoPosVisita(
      { sent: false, channel: "whatsapp", reason: "API_ERROR" },
      "hot"
    )
    expect(r.status).toBe("skipped")
    expect(r.gravarSentAt).toBe(false)
    expect(r.gravarMensagem).toBe(false)
    expect(r.descricao).toContain("erro na API de envio")
  })

  it("credencial ausente também não é envio", () => {
    const r = registroDoPosVisita({
      sent: false,
      channel: "whatsapp",
      reason: "WHATSAPP_CONFIG_MISSING",
    })
    expect(r.status).toBe("skipped")
    expect(r.descricao).toContain("sem credenciais ativas")
  })

  it("Telegram entregue é entregue", () => {
    const r = registroDoPosVisita({ sent: true, channel: "telegram" }, "warm")
    expect(r.status).toBe("sent")
    expect(r.descricao).toContain("telegram")
  })

  it("sem interesse informado, a descrição não fica com 'undefined'", () => {
    const r = registroDoPosVisita({ sent: true, channel: "whatsapp" }, null)
    expect(r.descricao).toContain("nao informado")
    expect(r.descricao).not.toContain("undefined")
  })

  it("motivo desconhecido aparece cru em vez de virar silêncio", () => {
    const r = registroDoPosVisita({ sent: false, channel: "whatsapp", reason: "COISA_NOVA" })
    expect(r.descricao).toContain("COISA_NOVA")
  })
})
