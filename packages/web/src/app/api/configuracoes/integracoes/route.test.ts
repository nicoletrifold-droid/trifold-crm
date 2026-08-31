/**
 * Story 900-51 · AC5/R9 — o carrasco do CALL SITE, não do helper.
 *
 * `escrita.test.ts` já prova que `montarRespostaDeErro` omite `technicalDetail` quando recebe
 * `incluirDetalheTecnico: false`. Isso **não** prova a propriedade que a AC5 promete: quem decide
 * o valor desse argumento é a ROTA. Trocar `false` por `true` nesta rota deixaria todo o
 * `escrita.test.ts` verde e vazaria o erro bruto do provider para o navegador do cliente.
 *
 * A lição é a de sempre: mutar só o helper não basta — o call site e o ARGUMENTO precisam de
 * carrasco próprio. Estes testes exercitam o handler de verdade e afirmam sobre o JSON que sai.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

vi.mock("server-only", () => ({}))

const validarCredencialMock = vi.fn()
vi.mock("@web/lib/integrations/painel/validacao", () => ({
  validarCredencial: (...args: unknown[]) => validarCredencialMock(...args),
}))

type ParamsDeRpc = Record<string, unknown>
const enviarAlertaMock = vi.fn<(mensagem: string) => Promise<void>>(async () => {})
vi.mock("@web/lib/telegram", () => ({
  sendTelegramAdminAlert: (m: string) => enviarAlertaMock(m),
}))

/** Linhas que a leitura da trilha devolve, e as tabelas que a rota tocou. */
const trilha: unknown[] = []
const tabelasLidas: string[] = []

const rpcMock = vi.fn<(nome: string, params: ParamsDeRpc) => Promise<{ error: null }>>(
  async () => ({ error: null }),
)
const linhaAtual = { status: "connected" as string | null }

function clienteFake() {
  return {
    from: (tabela: string) => {
      tabelasLidas.push(tabela)
      const linhas = tabela === "platform_audit_log" ? trilha : [linhaAtual]
      const cadeia = {
        select: () => cadeia,
        eq: () => cadeia,
        order: () => cadeia,
        limit: () => Promise.resolve({ data: linhas, error: null }),
        maybeSingle: async () => ({ data: linhas[0] ?? null, error: null }),
      }
      return cadeia
    },
    rpc: (nome: string, params: ParamsDeRpc) => rpcMock(nome, params),
  }
}

const authMock = vi.fn()
const capabilityMock = vi.fn<() => Promise<NextResponse | null>>(async () => null)
vi.mock("@web/lib/api-auth", () => ({
  requireAuth: () => authMock(),
  requireCapability: () => capabilityMock(),
}))

import { POST } from "./route"

beforeEach(() => {
  validarCredencialMock.mockReset()
  rpcMock.mockClear()
  enviarAlertaMock.mockClear()
  trilha.length = 0
  tabelasLidas.length = 0
  capabilityMock.mockReset()
  capabilityMock.mockResolvedValue(null)
  linhaAtual.status = "connected"
  authMock.mockResolvedValue({
    supabase: clienteFake(),
    appUser: { id: "u1", org_id: "org-A", role: "admin", name: "Ana" },
  })
})

function pedido(corpo: unknown) {
  return new Request("http://localhost/api/configuracoes/integracoes", {
    method: "POST",
    body: JSON.stringify(corpo),
  })
}

describe("POST /api/configuracoes/integracoes — R9, no call site", () => {
  it("erro do provider: o JSON NÃO carrega `technicalDetail` nem o texto bruto", async () => {
    validarCredencialMock.mockResolvedValue({
      ok: false,
      codigo: "token_invalid",
      detalheBruto: "OAuthException: token expirado — app 1249990980457973",
    })

    const res = await POST(pedido({ provider: "sienge", secret: "x", config: {} }))
    const json = await res.json()
    const texto = JSON.stringify(json)

    expect(res.status).toBe(422)
    expect(Object.keys(json)).not.toContain("technicalDetail")
    expect(texto).not.toContain("OAuthException")
    expect(texto).not.toContain("1249990980457973")
    // A mensagem em pt-BR CHEGA — a régua não é "não devolve nada", é "não devolve o cru".
    expect(json.mensagem).toBe(
      "A credencial foi recusada. Confira se foi copiada sem espaços extras.",
    )
  })

  it("caminho feliz: chama as DUAS RPCs `_as_org`, nessa ordem, sem passar org nem ator", async () => {
    validarCredencialMock.mockResolvedValue({ ok: true })

    const res = await POST(
      pedido({ provider: "meta_capi", secret: "tok", config: { dataset_id: "ds" } }),
    )

    expect(res.status).toBe(200)
    expect(rpcMock.mock.calls.map((c) => c[0])).toEqual([
      "org_integration_write_secret_as_org",
      "org_integration_mark_connected_as_org",
    ])
    // O que a rota NÃO manda é a asserção: `p_org_id`/`p_actor_user_id` não existem em `_as_org`,
    // e é isso que impede o corpo da requisição de escolher a empresa.
    for (const [, params] of rpcMock.mock.calls) {
      expect(Object.keys(params)).not.toContain("p_org_id")
      expect(Object.keys(params)).not.toContain("p_actor_user_id")
    }
  })

  it("provider fora da allowlist é recusado antes de qualquer efeito", async () => {
    const res = await POST(pedido({ provider: "google", secret: "x", config: {} }))
    expect(res.status).toBe(400)
    expect(rpcMock).not.toHaveBeenCalled()
    expect(validarCredencialMock).not.toHaveBeenCalled()
  })

  it("sem a capability, 403 — e nenhuma RPC é chamada", async () => {
    capabilityMock.mockResolvedValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    )
    const res = await POST(pedido({ provider: "sienge", secret: "x", config: {} }))
    expect(res.status).toBe(403)
    expect(rpcMock).not.toHaveBeenCalled()
  })
})

/**
 * QA-900-51-1 — o carrasco que faltava, e é ESTE o caminho.
 *
 * O `@qa` mediu que `dispararAlertasDeAuditoria` tinha um único call site (a rota `/platform`),
 * onde toda escrita é `platform_admin` — logo o Alerta 1 ("page_id gravado pelo CLIENTE") não
 * tinha caminho alcançável nenhum, e sondar o handler real desta rota dava `200`, 2 RPCs e
 * **0 alertas**. O `org_admin` gravando `page_id` é literalmente o que o dono do produto abriu
 * ao recusar a prevenção em C1: era a contrapartida inteira que ele recebeu, e ela não existia.
 *
 * Os testes abaixo vivem no CALL SITE, não no helper: a mutação
 * `ehEscritaDePageIdPorCliente → return false` precisa reprovar AQUI.
 */
describe("AC11 — o alerta do cliente dispara por esta rota (QA-900-51-1)", () => {
  const LINHA_DE_ESCRITA_POR_CLIENTE = {
    id: "aud-1",
    actor_type: "org_admin",
    org_id: "org-A",
    action: "org_integration.secret_write",
    metadata: { provider: "meta_ads", page_id: "132027046650861", actor_label: "Ana" },
  }

  it("`org_admin` grava `page_id` → o alerta DISPARA (o caminho normal do cliente)", async () => {
    validarCredencialMock.mockResolvedValue({ ok: true })
    trilha.push(LINHA_DE_ESCRITA_POR_CLIENTE)

    const res = await POST(
      pedido({ provider: "meta_ads", secret: "tok", config: { page_id: "132027046650861" } }),
    )

    expect(res.status).toBe(200)
    expect(tabelasLidas).toContain("platform_audit_log")
    expect(enviarAlertaMock).toHaveBeenCalledTimes(1)
    expect(enviarAlertaMock.mock.calls[0]![0]).toContain("132027046650861")
  })

  it("reatribuição cross-org por esta rota também dispara, com a org anterior no texto", async () => {
    validarCredencialMock.mockResolvedValue({ ok: true })
    trilha.push({
      ...LINHA_DE_ESCRITA_POR_CLIENTE,
      action: "org_integration.page_id_reassigned_cross_org",
      metadata: { ...LINHA_DE_ESCRITA_POR_CLIENTE.metadata, org_id_anterior: "org-vitima" },
    })

    await POST(pedido({ provider: "meta_ads", secret: "tok", config: { page_id: "1" } }))

    expect(enviarAlertaMock).toHaveBeenCalledTimes(1)
    expect(enviarAlertaMock.mock.calls[0]![0]).toContain("org-vitima")
  })

  it("controle negativo: provider sem `page_id` não lê a trilha nem alerta", async () => {
    validarCredencialMock.mockResolvedValue({ ok: true })
    trilha.push(LINHA_DE_ESCRITA_POR_CLIENTE)

    await POST(pedido({ provider: "sienge", secret: "s", config: { subdomain: "a", usuario: "u" } }))

    expect(tabelasLidas).not.toContain("platform_audit_log")
    expect(enviarAlertaMock).not.toHaveBeenCalled()
  })

  it("controle negativo: escrita que FALHOU não alerta", async () => {
    validarCredencialMock.mockResolvedValue({ ok: false, codigo: "token_invalid" })
    trilha.push(LINHA_DE_ESCRITA_POR_CLIENTE)

    await POST(pedido({ provider: "meta_ads", secret: "tok", config: { page_id: "1" } }))

    expect(enviarAlertaMock).not.toHaveBeenCalled()
  })
})
