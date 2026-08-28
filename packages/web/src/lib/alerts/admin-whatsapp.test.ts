/**
 * Story 87-19 — testes do canal de alerta.
 *
 * O que se prova aqui é o CONTRATO best-effort (AC12): um número que falha não pode
 * levar os outros junto, e a função não pode lançar. O canal de alerta que quebra
 * junto com o incidente não serve para nada.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("server-only", () => ({}))

const enviarMock = vi.fn()
vi.mock("@web/lib/whatsapp/send-template", () => ({
  sendWhatsAppTemplate: (...a: unknown[]) => enviarMock(...a),
}))

const logSendMock = vi.fn()
vi.mock("@web/lib/whatsapp/log-send", () => ({
  logWhatsappSend: (...a: unknown[]) => logSendMock(...a),
}))

import {
  alertarAdminWhatsApp,
  carregarConfigWhatsApp,
  destinatariosConfigurados,
  formatarMomento,
  TEMPLATE_ALERTA,
} from "./admin-whatsapp"

const CONFIG = { phone_number_id: "1109406868918759", access_token: "tok" }
const admin = {} as never

beforeEach(() => {
  enviarMock.mockReset()
  logSendMock.mockReset()
  enviarMock.mockResolvedValue(undefined)
})

afterEach(() => {
  delete process.env.ALERTA_SISTEMA_PHONES
})

describe("destinatariosConfigurados", () => {
  it("devolve lista vazia quando a env não existe", () => {
    expect(destinatariosConfigurados()).toEqual([])
  })

  it("devolve lista vazia quando a env foi gravada VAZIA (gotcha do vercel env add)", () => {
    process.env.ALERTA_SISTEMA_PHONES = ""
    expect(destinatariosConfigurados()).toEqual([])
  })

  it("faz trim e descarta entradas vazias do CSV", () => {
    process.env.ALERTA_SISTEMA_PHONES = " 5544999761478 , ,5544984070700"
    expect(destinatariosConfigurados()).toEqual(["5544999761478", "5544984070700"])
  })
})

describe("carregarConfigWhatsApp", () => {
  const fakeAdmin = (data: unknown) =>
    ({
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data }) }) }),
      }),
    }) as never

  it("devolve null quando não há linha", async () => {
    expect(await carregarConfigWhatsApp(fakeAdmin(null), "org")).toBeNull()
  })

  it("devolve null quando o status não é active (AC14)", async () => {
    const row = { ...CONFIG, status: "inactive" }
    expect(await carregarConfigWhatsApp(fakeAdmin(row), "org")).toBeNull()
  })

  it("devolve null quando falta o access_token (AC14)", async () => {
    const row = { phone_number_id: "x", access_token: "", status: "active" }
    expect(await carregarConfigWhatsApp(fakeAdmin(row), "org")).toBeNull()
  })

  it("devolve a config quando está utilizável", async () => {
    const row = { ...CONFIG, status: "active" }
    expect(await carregarConfigWhatsApp(fakeAdmin(row), "org")).toEqual(CONFIG)
  })
})

describe("formatarMomento", () => {
  it("formata em America/Sao_Paulo, não em UTC", () => {
    // 09:05 UTC é 06:05 em São Paulo — o horário real do incidente.
    expect(formatarMomento("2026-08-28T09:05:41.798Z")).toContain("06:05")
    expect(formatarMomento("2026-08-28T09:05:41.798Z")).toContain("28/08")
  })

  it("não devolve quebra de linha (parâmetro de template não aceita)", () => {
    expect(formatarMomento("2026-08-28T09:05:41.798Z")).not.toMatch(/[\n\t]/)
  })
})

describe("alertarAdminWhatsApp", () => {
  const params = {
    orgId: "org",
    config: CONFIG,
    tipo: "credito" as const,
    desdeIso: "2026-08-28T09:05:41.798Z",
    ocorrencias: 7,
  }

  it("envia o template certo com os 3 parâmetros do body", async () => {
    const r = await alertarAdminWhatsApp(admin, { ...params, telefones: ["5544999761478"] })

    expect(r).toEqual({ enviados: 1, falhas: 0 })
    const chamada = enviarMock.mock.calls[0]
    if (!chamada) throw new Error("sendWhatsAppTemplate não foi chamado")
    const [, , to, template, componentes] = chamada
    expect(to).toBe("5544999761478")
    expect(template).toBe(TEMPLATE_ALERTA)
    expect(componentes[0].parameters).toHaveLength(3)
    expect(componentes[0].parameters[0].text).toContain("saldo")
    expect(componentes[0].parameters[2].text).toBe("7")
  })

  it("um número que falha NÃO impede o outro, e nada é lançado (AC12)", async () => {
    enviarMock
      .mockRejectedValueOnce(new Error("WhatsApp API 400: invalid recipient"))
      .mockResolvedValueOnce(undefined)

    const r = await alertarAdminWhatsApp(admin, {
      ...params,
      telefones: ["5500000000000", "5544999761478"],
    })

    expect(r).toEqual({ enviados: 1, falhas: 1 })
    expect(enviarMock).toHaveBeenCalledTimes(2)
  })

  it("registra o envio no whatsapp_send_log com sent e failed", async () => {
    enviarMock.mockRejectedValueOnce(new Error("boom"))
    await alertarAdminWhatsApp(admin, { ...params, telefones: ["5500000000000"] })

    expect(logSendMock).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ template: TEMPLATE_ALERTA, status: "failed" })
    )
  })

  it("lista vazia não envia nada e não lança", async () => {
    const r = await alertarAdminWhatsApp(admin, { ...params, telefones: [] })
    expect(r).toEqual({ enviados: 0, falhas: 0 })
    expect(enviarMock).not.toHaveBeenCalled()
  })
})
