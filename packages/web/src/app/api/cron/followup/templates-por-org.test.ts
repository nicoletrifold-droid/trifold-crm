/**
 * Story 900-23 · AC6 — o lookup de templates aprovados passou a ser POR ORGANIZAÇÃO.
 *
 * ## O defeito que isto fecha (R1 do parecer do @po)
 *
 * O código de antes fazia `.eq("status","active").maybeSingle()` **sem** `org_id`, e escrevia
 * `const { data: waCfg } = await …` — **descartando o `error`**. Com UMA linha ativa (produção
 * hoje) funciona. Com DUAS, `maybeSingle()` não devolve "a primeira": devolve
 * `{ data: null, error: { code: "PGRST116" } }`. Como o `error` era jogado fora, `waCfg` virava
 * `undefined`, a condição `waCfg?.waba_id && waCfg?.access_token` falhava, e o follow-up por
 * template **morria para TODAS as orgs, em silêncio** — o `FOLLOWUP_TEMPLATES_INDISPONIVEIS` só
 * dispara no `catch` de `listApprovedOpeningTemplates`, que nunca era alcançado.
 *
 * O fake abaixo **honra `maybeSingle()` de verdade**: 2+ linhas casando ⇒ `PGRST116`. Um fake
 * que devolvesse `linhas[0] ?? null` reproduziria o bug do jeito errado e o teste não veria nada.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const ORG_A = "00000000-0000-0000-0000-0000000000a1"
const ORG_B = "00000000-0000-0000-0000-0000000000b2"

type LinhaConfig = {
  org_id: string
  status: string
  waba_id: string | null
  access_token: string | null
}

let configs: LinhaConfig[] = []
/** `waba_id` → templates aprovados que a Meta devolveria. */
let templatesDaMeta: Record<string, Array<{ name: string; body: string }>> = {}
let chamadasAListagem: string[] = []
let listagemLanca = false

const listarMock = vi.fn(async (wabaId: string, _token?: string) => {
  chamadasAListagem.push(wabaId)
  if (listagemLanca) throw new Error("Graph 401")
  return templatesDaMeta[wabaId] ?? []
})

vi.mock("@web/lib/whatsapp/opening-templates", async (original) => {
  const real = await original<typeof import("@web/lib/whatsapp/opening-templates")>()
  return {
    ...real,
    listApprovedOpeningTemplates: (waba: string, tok: string) => listarMock(waba, tok),
  }
})

const logEventMock = vi.fn()
vi.mock("@web/lib/logger", () => ({
  logEvent: (...a: unknown[]) => logEventMock(...a),
  logEventOnce: vi.fn(async () => ({ inserted: true })),
}))

/** Client de teste: só a query de `whatsapp_config` importa aqui. */
function fakeSupabase() {
  return {
    from: () => {
      const filtros: Array<[string, unknown]> = []
      const api: Record<string, unknown> = {
        select: () => api,
        eq: (c: string, v: unknown) => {
          filtros.push([c, v])
          return api
        },
        maybeSingle: async () => {
          const linhas = configs.filter((l) =>
            filtros.every(([c, v]) => (l as unknown as Record<string, unknown>)[c] === v),
          )
          // ⚠️ O comportamento REAL do PostgREST: com 2+ linhas, `maybeSingle()` é ERRO.
          if (linhas.length > 1) {
            return {
              data: null,
              error: { code: "PGRST116", message: "JSON object requested, multiple rows returned" },
            }
          }
          return { data: linhas[0] ?? null, error: null }
        },
      }
      return api
    },
  }
}

const { carregarTemplatesAprovadosDaOrg, criarCacheDeTemplatesPorOrg } = await import("./route")

beforeEach(() => {
  configs = []
  templatesDaMeta = {}
  chamadasAListagem = []
  listagemLanca = false
  listarMock.mockClear()
  logEventMock.mockClear()
})

describe("carregarTemplatesAprovadosDaOrg — escopo por organização", () => {
  beforeEach(() => {
    configs = [
      { org_id: ORG_A, status: "active", waba_id: "waba-a", access_token: "tok-a" },
      { org_id: ORG_B, status: "active", waba_id: "waba-b", access_token: "tok-b" },
    ]
    templatesDaMeta = {
      "waba-a": [{ name: "abertura_a", body: "Olá da A" }],
      "waba-b": [{ name: "abertura_b", body: "Olá da B" }],
    }
  })

  it("🔴 cada org recebe o corpo do PRÓPRIO template — nunca cruzado", async () => {
    const db = fakeSupabase() as never
    const a = await carregarTemplatesAprovadosDaOrg(db, ORG_A)
    const b = await carregarTemplatesAprovadosDaOrg(db, ORG_B)

    expect([...a.keys()]).toEqual(["abertura_a"])
    expect(a.get("abertura_a")).toBe("Olá da A")
    expect([...b.keys()]).toEqual(["abertura_b"])
    expect(b.get("abertura_b")).toBe("Olá da B")
    expect(chamadasAListagem).toEqual(["waba-a", "waba-b"])
  })

  it("🔴 R1 — com 2 configs ativas, o filtro de org resolve 1 linha; SEM ele seria PGRST116", async () => {
    const db = fakeSupabase() as never

    // Com o filtro (código novo): 1 linha, sem erro, templates carregados.
    const comFiltro = await carregarTemplatesAprovadosDaOrg(db, ORG_A)
    expect(comFiltro.size).toBe(1)
    expect(logEventMock).not.toHaveBeenCalled()

    // Reproduzindo o código de HOJE (só `status='active'`, sem org): o mesmo fake devolve
    // PGRST116 — que é o modo de falha que a v1 do diagnóstico não enxergava.
    const semFiltro = await (
      fakeSupabase().from() as unknown as {
        select: () => { eq: (c: string, v: unknown) => { maybeSingle: () => Promise<unknown> } }
      }
    )
      .select()
      .eq("status", "active")
      .maybeSingle()
    expect(semFiltro).toMatchObject({ data: null, error: { code: "PGRST116" } })
  })

  it("erro na leitura de whatsapp_config vira FOLLOWUP_TEMPLATES_INDISPONIVEIS com org_id", async () => {
    // Duas linhas ativas da MESMA org (estado que a migration 246 impede, mas a defesa em
    // profundidade continua valendo para rede/RLS): o `error` NÃO é descartado.
    configs = [
      { org_id: ORG_A, status: "active", waba_id: "w1", access_token: "t1" },
      { org_id: ORG_A, status: "active", waba_id: "w2", access_token: "t2" },
    ]
    const mapa = await carregarTemplatesAprovadosDaOrg(fakeSupabase() as never, ORG_A)

    expect(mapa.size).toBe(0)
    expect(listarMock).not.toHaveBeenCalled()
    const ev = logEventMock.mock.calls.map((c) => c[0] as Record<string, unknown>)
    expect(ev).toHaveLength(1)
    expect(ev[0]!.event_type).toBe("FOLLOWUP_TEMPLATES_INDISPONIVEIS")
    expect(ev[0]!.org_id).toBe(ORG_A)
    expect((ev[0]!.metadata as { erro: string }).erro).toContain("multiple rows")
  })

  it("org sem whatsapp_config ativa devolve mapa vazio, sem log de erro e sem chamar a Meta", async () => {
    configs = [{ org_id: ORG_A, status: "active", waba_id: "w", access_token: "t" }]
    const mapa = await carregarTemplatesAprovadosDaOrg(fakeSupabase() as never, ORG_B)
    expect(mapa.size).toBe(0)
    expect(listarMock).not.toHaveBeenCalled()
    expect(logEventMock).not.toHaveBeenCalled()
  })

  it("falha na listagem da Meta é fail-closed E audível, agora com org_id", async () => {
    listagemLanca = true
    const mapa = await carregarTemplatesAprovadosDaOrg(fakeSupabase() as never, ORG_A)
    expect(mapa.size).toBe(0)
    const ev = logEventMock.mock.calls[0]![0] as Record<string, unknown>
    expect(ev.event_type).toBe("FOLLOWUP_TEMPLATES_INDISPONIVEIS")
    expect(ev.org_id).toBe(ORG_A)
  })
})

describe("criarCacheDeTemplatesPorOrg — 1 busca por ORG, não por regra (AC6.2)", () => {
  it("3 regras de 2 orgs distintas ⇒ 2 chamadas, não 3", async () => {
    const carregar = vi.fn(async (_db: unknown, orgId: string) =>
      new Map([[`t-${orgId}`, `corpo ${orgId}`]]),
    )
    const cache = criarCacheDeTemplatesPorOrg(fakeSupabase() as never, carregar as never)

    // Ordem que o laço de `rules` produziria: A, B, A.
    const r1 = await cache(ORG_A)
    const r2 = await cache(ORG_B)
    const r3 = await cache(ORG_A)

    expect(carregar).toHaveBeenCalledTimes(2)
    expect(carregar.mock.calls.map((c) => c[1])).toEqual([ORG_A, ORG_B])
    // A 3ª regra reusa a MESMA instância — não é só "valor igual".
    expect(r3).toBe(r1)
    expect(r2).not.toBe(r1)
    expect(r2.get(`t-${ORG_B}`)).toBe(`corpo ${ORG_B}`)
  })
})
