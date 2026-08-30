/**
 * Story 900-51 · AC5 — carrascos da sequência de escrita.
 *
 * ## O que estes testes existem para pegar
 *
 * A propriedade que a story compra com a separação `write_secret`/`mark_connected` é
 * "`status='connected'` só existe depois de uma chamada de teste bem-sucedida". Isso é
 * enforçado por DOIS mecanismos em camadas diferentes: o banco recusa promover sem segredo
 * (`P0015`, Camada B) e ESTA orquestração recusa chamar a promoção sem validação (Camada A).
 * Nenhum dos dois sozinho é a propriedade.
 *
 * Cada `it` abaixo tem uma mutação nomeada que ele reprova — sem isso, um teste que só afirma o
 * caminho feliz é uma foto do código, não uma régua sobre ele.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

const validarCredencialMock = vi.fn()
vi.mock("./validacao", () => ({
  validarCredencial: (...args: unknown[]) => validarCredencialMock(...args),
}))

import { gravarIntegracao, type PortaDeEscrita } from "./escrita"
import { CONSTRAINT_PAGE_ID } from "./erros"

interface Registro {
  metodo: "writeSecret" | "markConnected" | "markError"
  args: unknown[]
}

function portaEspia(
  respostas: Partial<Record<Registro["metodo"], { error: { code?: string; message?: string } | null }>> = {},
): { porta: PortaDeEscrita; chamadas: Registro[] } {
  const chamadas: Registro[] = []
  const responder = (m: Registro["metodo"]) => respostas[m] ?? { error: null }
  const porta: PortaDeEscrita = {
    writeSecret: async (...args) => {
      chamadas.push({ metodo: "writeSecret", args })
      return responder("writeSecret")
    },
    markConnected: async (...args) => {
      chamadas.push({ metodo: "markConnected", args })
      return responder("markConnected")
    },
    markError: async (...args) => {
      chamadas.push({ metodo: "markError", args })
      return responder("markError")
    },
  }
  return { porta, chamadas }
}

const PEDIDO = {
  provider: "sienge" as const,
  segredo: "senha-real",
  config: { subdomain: "acme", usuario: "api" },
  statusAtual: "disconnected",
}

beforeEach(() => {
  validarCredencialMock.mockReset()
  validarCredencialMock.mockResolvedValue({ ok: true })
})

describe("AC5 — a sequência de três passos", () => {
  it("caminho feliz: valida → writeSecret → markConnected, NESSA ordem", async () => {
    const { porta, chamadas } = portaEspia()
    const r = await gravarIntegracao(porta, PEDIDO, { incluirDetalheTecnico: false })

    expect(r).toEqual({ ok: true, provider: "sienge", status: "connected" })
    // A ORDEM é a asserção, não a presença: `markConnected` antes de `writeSecret` produziria
    // `P0015` no banco, e um teste que só conferisse "as duas foram chamadas" ficaria verde.
    expect(chamadas.map((c) => c.metodo)).toEqual(["writeSecret", "markConnected"])
    expect(validarCredencialMock).toHaveBeenCalledWith("sienge", "senha-real", PEDIDO.config)
  })

  it("validação falhou e a integração NUNCA foi configurada: nada é persistido", async () => {
    // Mutação que este teste reprova: mover a chamada de validação para depois do writeSecret.
    validarCredencialMock.mockResolvedValue({ ok: false, codigo: "token_invalid", detalheBruto: "x" })
    const { porta, chamadas } = portaEspia()

    const r = await gravarIntegracao(porta, PEDIDO, { incluirDetalheTecnico: false })

    expect(chamadas).toEqual([])
    expect(r).toMatchObject({ ok: false, codigo: "token_invalid" })
  })

  it("validação falhou numa integração JÁ conectada: vira `error`, sem tocar config/segredo", async () => {
    validarCredencialMock.mockResolvedValue({ ok: false, codigo: "token_invalid" })
    const { porta, chamadas } = portaEspia()

    await gravarIntegracao(
      porta,
      { ...PEDIDO, statusAtual: "connected" },
      { incluirDetalheTecnico: false },
    )

    expect(chamadas.map((c) => c.metodo)).toEqual(["markError"])
    expect(chamadas[0]!.args).toEqual(["sienge", "token_invalid"])
  })

  it("`writeSecret` falhou: `markConnected` NÃO é chamada", async () => {
    // Mutação que este teste reprova: ignorar o `error` do passo (2) e promover mesmo assim —
    // exatamente o que produziria "salvo com sucesso" + "Não conectado" na mesma sessão (R2).
    const { porta, chamadas } = portaEspia({
      writeSecret: { error: { code: "P0012", message: "nenhuma linha" } },
    })

    const r = await gravarIntegracao(porta, PEDIDO, { incluirDetalheTecnico: false })

    expect(chamadas.map((c) => c.metodo)).toEqual(["writeSecret"])
    expect(r).toMatchObject({ ok: false })
  })

  it("`markConnected` falhou: a resposta é ERRO, nunca um 200 que afirmaria promoção", async () => {
    const { porta } = portaEspia({
      markConnected: { error: { code: "P0015", message: "sem secret_ref" } },
    })
    const r = await gravarIntegracao(porta, PEDIDO, { incluirDetalheTecnico: false })
    expect(r.ok).toBe(false)
  })
})

describe("AC5/R9 — `technicalDetail` é decidido por ROTA, no servidor", () => {
  it("`/dashboard` (incluirDetalheTecnico: false): a CHAVE não existe no objeto", async () => {
    validarCredencialMock.mockResolvedValue({
      ok: false,
      codigo: "token_invalid",
      detalheBruto: "OAuthException: token expirado em 2026-01-01",
    })
    const { porta } = portaEspia()

    const r = await gravarIntegracao(porta, PEDIDO, { incluirDetalheTecnico: false })

    // Ausência de CHAVE, não `undefined`: `JSON.stringify` omite `undefined`, então um teste que
    // afirmasse `r.technicalDetail === undefined` ficaria verde com a chave presente e nula.
    expect(Object.keys(r)).not.toContain("technicalDetail")
    // E o valor bruto não vaza por nenhum outro campo do payload.
    expect(JSON.stringify(r)).not.toContain("OAuthException")
    expect(JSON.stringify(r)).not.toContain("2026-01-01")
  })

  it("`/platform` (incluirDetalheTecnico: true): a chave existe com o texto bruto", async () => {
    validarCredencialMock.mockResolvedValue({
      ok: false,
      codigo: "token_invalid",
      detalheBruto: "OAuthException: token expirado em 2026-01-01",
    })
    const { porta } = portaEspia()

    const r = await gravarIntegracao(porta, PEDIDO, { incluirDetalheTecnico: true })

    expect(r).toMatchObject({ technicalDetail: "OAuthException: token expirado em 2026-01-01" })
  })
})

describe("AC10/C3 — o `23505` da UNIQUE de page_id vira o 6º código", () => {
  it("`23505` naquela constraint → `page_id_ja_configurado`, com a mensagem em pt-BR", async () => {
    const { porta } = portaEspia({
      writeSecret: {
        error: {
          code: "23505",
          message: `duplicate key value violates unique constraint "${CONSTRAINT_PAGE_ID}"`,
        },
      },
    })

    const r = await gravarIntegracao(
      porta,
      { provider: "meta_ads", segredo: "tok", config: { page_id: "1" }, statusAtual: null },
      { incluirDetalheTecnico: false },
    )

    expect(r).toMatchObject({
      ok: false,
      codigo: "page_id_ja_configurado",
      mensagem: "Este identificador já está associado a outra conta. Contate o suporte.",
    })
  })

  it("`23505` de OUTRA constraint NÃO herda essa mensagem", async () => {
    // Sem esta asserção, `traduzirErroDoBanco` poderia casar só pelo `code` e dizer "já está
    // associado a outra conta" para qualquer violação de unicidade do schema.
    const { porta } = portaEspia({
      writeSecret: {
        error: { code: "23505", message: 'duplicate key ... "outra_constraint_qualquer"' },
      },
    })
    const r = await gravarIntegracao(porta, PEDIDO, { incluirDetalheTecnico: false })
    expect(r).toMatchObject({ ok: false, codigo: "unknown" })
  })
})

describe("allowlist positiva de chaves de `config`", () => {
  it("chave desconhecida é recusada ANTES de qualquer efeito", async () => {
    const { porta, chamadas } = portaEspia()
    const r = await gravarIntegracao(
      porta,
      {
        provider: "meta_ads",
        segredo: "tok",
        config: { page_id: "123", org_id: "vitima" },
        statusAtual: null,
      },
      { incluirDetalheTecnico: true },
    )
    expect(chamadas).toEqual([])
    expect(validarCredencialMock).not.toHaveBeenCalled()
    expect(r).toMatchObject({ ok: false })
    expect((r as { technicalDetail?: string }).technicalDetail).toContain("org_id")
  })

  it("as chaves LEGÍTIMAS de cada provider passam — a régua discrimina, não recusa tudo", async () => {
    const casos = [
      { provider: "meta_ads" as const, config: { page_id: "123" } },
      { provider: "meta_capi" as const, config: { dataset_id: "ds" } },
      { provider: "sienge" as const, config: { subdomain: "acme", usuario: "api" } },
      { provider: "telegram" as const, config: {} },
    ]
    for (const caso of casos) {
      const { porta, chamadas } = portaEspia()
      const r = await gravarIntegracao(
        porta,
        { ...caso, segredo: "tok", statusAtual: null },
        { incluirDetalheTecnico: false },
      )
      expect(r, `provider ${caso.provider}`).toMatchObject({ ok: true })
      expect(chamadas.map((c) => c.metodo)).toEqual(["writeSecret", "markConnected"])
    }
  })
})
