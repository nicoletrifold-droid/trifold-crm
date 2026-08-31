/**
 * Story 900-51 · AC11/Task 13.4 — os dois alertas, nos DOIS sentidos cada.
 *
 * "Dispara quando deveria" sozinho é meia régua: um `return true` constante passaria. Cada
 * `describe` abaixo tem o par completo, e o controle negativo é sempre o caso mais PRÓXIMO do
 * positivo (mesma linha, um campo trocado) — não um caso obviamente diferente.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

const enviarMock = vi.fn<(mensagem: string) => Promise<void>>(async () => {})
vi.mock("@web/lib/telegram", () => ({
  sendTelegramAdminAlert: (mensagem: string) => enviarMock(mensagem),
}))

import {
  ACAO_ESCRITA_DE_SEGREDO,
  ACAO_REATRIBUICAO_CROSS_ORG,
  dispararAlertasDeAuditoria,
  ehEscritaDePageIdPorCliente,
  ehReatribuicaoCrossOrg,
  linhasQueMerecemAlerta,
  montarTextoDoAlerta,
  motivosDeAlerta,
  type LinhaDeAuditoria,
} from "./alertas-page-id"

function linha(over: Partial<LinhaDeAuditoria> = {}): LinhaDeAuditoria {
  return {
    id: "aud-1",
    actor_type: "org_admin",
    org_id: "org-B",
    action: ACAO_ESCRITA_DE_SEGREDO,
    metadata: { provider: "meta_ads", page_id: "132027046650861", actor_label: "Fulano" },
    ...over,
  }
}

beforeEach(() => enviarMock.mockClear())

describe("Alerta 1 — page_id gravado por `org_admin`", () => {
  it("DISPARA quando `actor_type = 'org_admin'` e há page_id", () => {
    expect(ehEscritaDePageIdPorCliente(linha())).toBe(true)
  })

  it("NÃO dispara quando o mesmo ato veio de `platform_admin` (a Trifold configurando)", () => {
    // Controle negativo mínimo: MESMA linha, só o `actor_type` muda. Se a régua olhasse para
    // "existe page_id" e não para quem escreveu, este caso ficaria verde no lugar errado.
    expect(ehEscritaDePageIdPorCliente(linha({ actor_type: "platform_admin" }))).toBe(false)
  })

  it("NÃO dispara para escrita de `org_admin` SEM page_id (sienge, telegram, meta_capi)", () => {
    expect(
      ehEscritaDePageIdPorCliente(
        linha({ metadata: { provider: "sienge", actor_label: "Fulano" } }),
      ),
    ).toBe(false)
  })

  it("`page_id` vazio não conta como page_id", () => {
    expect(ehEscritaDePageIdPorCliente(linha({ metadata: { page_id: "" } }))).toBe(false)
  })
})

describe("Alerta 2 — o page_id mudou de org", () => {
  it("DISPARA na ação que a RPC grava quando encontra o mesmo page_id em outra org", () => {
    const l = linha({
      action: ACAO_REATRIBUICAO_CROSS_ORG,
      metadata: { page_id: "111", org_id_anterior: "org-A", actor_label: "Fulano" },
    })
    expect(ehReatribuicaoCrossOrg(l)).toBe(true)
  })

  it("NÃO dispara numa escrita comum de page_id (controle negativo)", () => {
    expect(ehReatribuicaoCrossOrg(linha())).toBe(false)
  })

  it("DISPARA também quando o ator é `platform_admin` — reatribuição é evento dos dois lados", () => {
    // Este é o par que distingue o alerta 2 do alerta 1: se alguém reimplementasse o 2 em cima do
    // `actor_type`, este caso ficaria falso e o sequestro feito pela própria Trifold sumiria.
    const l = linha({ actor_type: "platform_admin", action: ACAO_REATRIBUICAO_CROSS_ORG })
    expect(ehReatribuicaoCrossOrg(l)).toBe(true)
  })
})

describe("motivos combinados e o filtro de janela", () => {
  it("uma reatribuição feita pelo CLIENTE acende os dois motivos", () => {
    const l = linha({
      action: ACAO_REATRIBUICAO_CROSS_ORG,
      metadata: { page_id: "111", org_id_anterior: "org-A" },
    })
    expect(motivosDeAlerta(l)).toEqual([
      "page_id_escrito_por_cliente",
      "page_id_mudou_de_org",
    ])
  })

  it("`linhasQueMerecemAlerta` descarta o que não é alerta e preserva a ordem", () => {
    const inertes = [
      linha({ id: "x1", actor_type: "platform_admin" }),
      linha({ id: "x2", metadata: { provider: "sienge" } }),
    ]
    const alvo = linha({ id: "alvo" })
    const r = linhasQueMerecemAlerta([inertes[0]!, alvo, inertes[1]!])
    expect(r.map((x) => x.linha.id)).toEqual(["alvo"])
  })
})

describe("disparo no canal existente", () => {
  it("chama `sendTelegramAdminAlert` uma vez por linha que merece, e nenhuma para as inertes", async () => {
    const n = await dispararAlertasDeAuditoria([
      linha({ id: "a" }),
      linha({ id: "b", actor_type: "platform_admin" }),
      linha({
        id: "c",
        action: ACAO_REATRIBUICAO_CROSS_ORG,
        metadata: { page_id: "111", org_id_anterior: "org-A" },
      }),
    ])
    expect(n).toBe(2)
    expect(enviarMock).toHaveBeenCalledTimes(2)
  })

  it("uma janela SEM nada relevante não chama o canal — silêncio é o estado correto", async () => {
    const n = await dispararAlertasDeAuditoria([linha({ actor_type: "platform_admin" })])
    expect(n).toBe(0)
    expect(enviarMock).not.toHaveBeenCalled()
  })

  it("uma falha do canal não derruba a escrita que ele observa", async () => {
    enviarMock.mockRejectedValueOnce(new Error("telegram fora do ar"))
    await expect(dispararAlertasDeAuditoria([linha()])).resolves.toBe(1)
  })

  it("o texto nomeia o page_id, a org anterior e o ator — quem lê o alerta sabe o que aconteceu", () => {
    const texto = montarTextoDoAlerta(
      linha({
        action: ACAO_REATRIBUICAO_CROSS_ORG,
        metadata: { page_id: "111", org_id_anterior: "org-A", actor_label: "Fulano" },
      }),
      ["page_id_escrito_por_cliente", "page_id_mudou_de_org"],
    )
    expect(texto).toContain("111")
    expect(texto).toContain("org-A")
    expect(texto).toContain("Fulano")
    expect(texto).toContain("MUDOU DE EMPRESA")
  })
})
