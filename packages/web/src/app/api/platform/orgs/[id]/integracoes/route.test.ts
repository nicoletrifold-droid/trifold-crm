/**
 * Story 900-51 · AC5/AC11 — o call site da superfície `/platform`.
 *
 * O par do teste da rota do cliente: aqui `technicalDetail` **precisa** aparecer, e a org
 * **precisa** vir do parâmetro de rota. Sem o segundo, um `orgId` no corpo da requisição deixaria
 * a Trifold gravar a credencial de uma empresa dentro de outra — o mesmo desenho que
 * `resend-admin-invite/route.ts` já protege.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const validarCredencialMock = vi.fn()
vi.mock("@web/lib/integrations/painel/validacao", () => ({
  validarCredencial: (...args: unknown[]) => validarCredencialMock(...args),
}))

const enviarAlertaMock = vi.fn<(mensagem: string) => Promise<void>>(async () => {})
vi.mock("@web/lib/telegram", () => ({
  sendTelegramAdminAlert: (m: string) => enviarAlertaMock(m),
}))

const guardMock = vi.fn()
vi.mock("@web/lib/tenancy/platform-guard", () => ({
  getPlatformAdmin: () => guardMock(),
}))

/** Linhas devolvidas por `platformQuery`, por tabela. */
const leituras: Record<string, unknown[]> = {}
const tabelasLidas: string[] = []
vi.mock("@web/lib/tenancy/platform-query", () => ({
  platformQuery: (tabela: string) => {
    tabelasLidas.push(tabela)
    const linhas = leituras[tabela] ?? []
    const cadeia = {
      eq: () => cadeia,
      order: () => cadeia,
      limit: () => Promise.resolve({ data: linhas, error: null }),
      maybeSingle: () => Promise.resolve({ data: linhas[0] ?? null, error: null }),
      then: (r: (v: { data: unknown[]; error: null }) => unknown) =>
        r({ data: linhas, error: null }),
    }
    return cadeia
  },
}))

type ParamsDeRpc = Record<string, unknown>
const rpcMock = vi.fn<(nome: string, params: ParamsDeRpc) => Promise<{ error: null }>>(
  async () => ({ error: null }),
)
vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: (nome: string, params: ParamsDeRpc) => rpcMock(nome, params),
  }),
}))

import { POST } from "./route"

const ORG_DA_ROTA = "org-da-rota"
const ORG_DO_CORPO = "org-de-outra-empresa"

beforeEach(() => {
  validarCredencialMock.mockReset()
  rpcMock.mockClear()
  enviarAlertaMock.mockClear()
  tabelasLidas.length = 0
  guardMock.mockResolvedValue({ userId: "pa-1", email: "gage@trifold", name: "Gage" })
  leituras.organizations = [{ id: ORG_DA_ROTA }]
  leituras.org_integrations = [{ provider: "meta_ads", status: "disconnected" }]
  leituras.platform_audit_log = []
})

function chamar(corpo: unknown) {
  return POST(
    new Request("http://localhost/x", { method: "POST", body: JSON.stringify(corpo) }),
    { params: Promise.resolve({ id: ORG_DA_ROTA }) },
  )
}

describe("POST /api/platform/orgs/[id]/integracoes", () => {
  it("erro do provider: `technicalDetail` VEM no JSON — é a decisão desta rota (R9)", async () => {
    validarCredencialMock.mockResolvedValue({
      ok: false,
      codigo: "token_invalid",
      detalheBruto: "OAuthException: token expirado",
    })
    const res = await chamar({ provider: "meta_capi", secret: "x", config: { dataset_id: "d" } })
    const json = await res.json()
    expect(res.status).toBe(422)
    expect(json.technicalDetail).toBe("OAuthException: token expirado")
  })

  it("a org das RPCs vem do PARÂMETRO DE ROTA, nunca do corpo", async () => {
    validarCredencialMock.mockResolvedValue({ ok: true })
    // O corpo tenta plantar outra empresa. Se a rota o honrasse, a Trifold gravaria a credencial
    // de um cliente dentro de outro — e nenhuma asserção sobre `ok: true` perceberia.
    await chamar({
      provider: "meta_capi",
      secret: "tok",
      config: { dataset_id: "d" },
      orgId: ORG_DO_CORPO,
      p_org_id: ORG_DO_CORPO,
    })
    expect(rpcMock).toHaveBeenCalledTimes(2)
    for (const [nome, params] of rpcMock.mock.calls) {
      expect(params.p_org_id, nome).toBe(ORG_DA_ROTA)
    }
    expect(JSON.stringify(rpcMock.mock.calls)).not.toContain(ORG_DO_CORPO)
  })

  it("chama as duas RPCs `_as_platform`, nessa ordem, com o ator do guard", async () => {
    validarCredencialMock.mockResolvedValue({ ok: true })
    await chamar({ provider: "sienge", secret: "s", config: { subdomain: "a", usuario: "u" } })
    expect(rpcMock.mock.calls.map((c) => c[0])).toEqual([
      "org_integration_write_secret_as_platform",
      "org_integration_mark_connected_as_platform",
    ])
    expect(rpcMock.mock.calls[0]![1].p_actor_user_id).toBe("pa-1")
  })

  it("as leituras passam por `platformQuery` (nenhum `.from()` cru nesta árvore)", async () => {
    validarCredencialMock.mockResolvedValue({ ok: true })
    await chamar({ provider: "sienge", secret: "s", config: { subdomain: "a", usuario: "u" } })
    expect(tabelasLidas).toContain("organizations")
    expect(tabelasLidas).toContain("org_integrations")
  })

  it("org inexistente → 404, sem tocar RPC nenhuma", async () => {
    leituras.organizations = []
    const res = await chamar({ provider: "sienge", secret: "s", config: {} })
    expect(res.status).toBe(404)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("sem platform admin → 403", async () => {
    guardMock.mockResolvedValue(null)
    const res = await chamar({ provider: "sienge", secret: "s", config: {} })
    expect(res.status).toBe(403)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("AC11: escrita de `meta_ads` lê a trilha e dispara o alerta quando ela pede", async () => {
    validarCredencialMock.mockResolvedValue({ ok: true })
    leituras.platform_audit_log = [
      {
        id: "a1",
        actor_type: "org_admin",
        org_id: ORG_DA_ROTA,
        action: "org_integration.page_id_reassigned_cross_org",
        metadata: { page_id: "111", org_id_anterior: "org-A" },
      },
    ]
    await chamar({ provider: "meta_ads", secret: "tok", config: { page_id: "111" } })
    expect(enviarAlertaMock).toHaveBeenCalledTimes(1)
    expect(enviarAlertaMock.mock.calls[0]![0]).toContain("MUDOU DE EMPRESA")
  })

  it("AC11, controle negativo: provider SEM `page_id` não lê a trilha nem alerta", async () => {
    validarCredencialMock.mockResolvedValue({ ok: true })
    leituras.platform_audit_log = [
      {
        id: "a1",
        actor_type: "org_admin",
        org_id: ORG_DA_ROTA,
        action: "org_integration.page_id_reassigned_cross_org",
        metadata: { page_id: "111", org_id_anterior: "org-A" },
      },
    ]
    await chamar({ provider: "sienge", secret: "s", config: { subdomain: "a", usuario: "u" } })
    expect(enviarAlertaMock).not.toHaveBeenCalled()
    expect(tabelasLidas).not.toContain("platform_audit_log")
  })
})
