/**
 * Story 900-23 · AC1 — carrasco das 5 propriedades de `forEachActiveOrg`.
 *
 * Cada `describe` abaixo corresponde a uma propriedade e nomeia, no comentário, **qual mutação da
 * implementação o deixa vermelho**. Um teste que passaria com a propriedade revertida não é
 * carrasco, é decoração.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

type Evento = {
  level: string
  category: string
  event_type: string
  message: string
  source?: string
  org_id?: string
  metadata?: Record<string, unknown>
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Fixture de `organizations` — a lista que o helper lê, e o erro que ele pode encontrar nela.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const ORG_A = { id: "00000000-0000-0000-0000-00000000000a", name: "Org A" }
const ORG_B = { id: "00000000-0000-0000-0000-00000000000b", name: "Org B" }
const ORG_C = { id: "00000000-0000-0000-0000-00000000000c", name: "Org C" }

let orgsNoBanco: Array<{ id: string; name: string }> = []
let erroDaListagem: { message: string } | null = null
/** Filtros aplicados na query de `organizations` — prova que `is_active` foi de fato filtrado. */
let filtrosDaListagem: Array<[string, unknown]> = []
/** Tabelas consultadas pelo client CRU (o não escopado). Só `organizations` é legítima aqui. */
let tabelasCruas: string[] = []

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => {
      tabelasCruas.push(tabela)
      const api: Record<string, unknown> = {
        select: () => api,
        eq: (coluna: string, valor: unknown) => {
          filtrosDaListagem.push([coluna, valor])
          return api
        },
        then: (resolve: (v: { data: unknown; error: unknown }) => unknown) =>
          resolve({ data: erroDaListagem ? null : orgsNoBanco, error: erroDaListagem }),
      }
      return api
    },
  }),
}))

/**
 * Sentinela **por org**, memoizada num `Map` (ressalva do @po na revalidação): o teste de
 * identidade usa `toBe`, então o mock precisa devolver o MESMO objeto para o mesmo `orgId` entre
 * chamadas — senão a asserção compararia instâncias diferentes e erraria alto por acidente, não
 * por defeito da implementação.
 */
const sentinelas = new Map<string, { __org: string }>()
function sentinela(orgId: string) {
  const existente = sentinelas.get(orgId)
  if (existente) return existente
  const novo = { __org: orgId }
  sentinelas.set(orgId, novo)
  return novo
}

const criarEscopado = vi.fn((orgId: string) => sentinela(orgId))
vi.mock("@web/lib/supabase/org-scoped-admin", () => ({
  createOrgScopedAdminClient: (orgId: string) => criarEscopado(orgId),
}))

/**
 * Eventos cuja escrita COMPLETOU. Comparado com o momento em que `forEachActiveOrg` resolve.
 *
 * O duplo só completa a escrita num macrotask — que é o comportamento do Postgres de verdade.
 * É isto que faz a suíte medir o `await`, e não só a chamada: tirar o `await` deixa `completados`
 * vazio no ponto da asserção. Mesma forma de `nicole-agenda-reconcile/route.test.ts` (Story 87-6).
 */
let completados: Evento[] = []
/**
 * Geração do teste corrente. Sem isto, uma escrita ÓRFÃ (a que a falta de `await` deixa pendente)
 * completaria DEPOIS do fim do teste e cairia no array do teste SEGUINTE — que então passaria por
 * acidente. Foi exatamente assim que a mutação M1 da 87-6 ficou verde na primeira rodada.
 */
let geracao = 0

const logEventOnceMock = vi.fn(async (p: Evento) => {
  const minhaGeracao = geracao
  await new Promise((r) => setTimeout(r, 5))
  if (minhaGeracao !== geracao) return { inserted: false } // órfã: o teste já acabou
  completados.push(p)
  return { inserted: true }
})
vi.mock("@web/lib/logger", () => ({
  logEventOnce: (p: Evento) => logEventOnceMock(p),
}))

const { forEachActiveOrg, statusHttpParaResumo } = await import("./for-each-org")

const eventos = () => logEventOnceMock.mock.calls.map((c) => c[0] as Evento)

beforeEach(() => {
  orgsNoBanco = [ORG_A, ORG_B]
  erroDaListagem = null
  filtrosDaListagem = []
  tabelasCruas = []
  sentinelas.clear()
  criarEscopado.mockClear()
  geracao++
  completados = []
  logEventOnceMock.mockClear()
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Controle positivo — sem ele, todo vermelho abaixo é indistinguível de "a suíte não roda"
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("controle positivo (vivacidade da suíte)", () => {
  it("2 orgs ativas e callback trivial ⇒ total 2, sucesso 2, falha 0, HTTP 200", async () => {
    const resumo = await forEachActiveOrg(async () => "ok", { source: "x" })
    expect(resumo.total).toBe(2)
    expect(resumo.sucesso).toBe(2)
    expect(resumo.falha).toBe(0)
    expect(resumo.resultados.map((r) => r.resultado)).toEqual(["ok", "ok"])
    expect(statusHttpParaResumo(resumo)).toBe(200)
  })

  it("lê `organizations` filtrando `is_active = true` — e só ela pelo client cru", async () => {
    await forEachActiveOrg(async () => "ok", { source: "x" })
    expect(tabelasCruas).toEqual(["organizations"])
    expect(filtrosDaListagem).toEqual([["is_active", true]])
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Propriedade 1 — isolamento de erro
// MUTAÇÃO QUE REPROVA: tirar o try/catch do laço (ou relançar no catch).
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("Propriedade 1 — isolamento de erro", () => {
  it("a org do meio lança e as outras duas seguem; a chamada em si NÃO rejeita", async () => {
    orgsNoBanco = [ORG_A, ORG_B, ORG_C]
    const fn = vi.fn(async (org: { id: string }) => {
      if (org.id === ORG_B.id) throw new Error("boom na org B")
      return `feito:${org.id}`
    })

    const resumo = await forEachActiveOrg(fn, { source: "x" })

    expect(fn).toHaveBeenCalledTimes(3)
    expect(resumo.total).toBe(3)
    expect(resumo.sucesso).toBe(2)
    expect(resumo.falha).toBe(1)

    const [a, b, c] = resumo.resultados
    expect(a!.ok).toBe(true)
    expect(a!.resultado).toBe(`feito:${ORG_A.id}`)
    expect(b!.ok).toBe(false)
    expect(b!.erro).toContain("boom na org B")
    expect(b!.org.id).toBe(ORG_B.id)
    expect(c!.ok).toBe(true)
    expect(c!.resultado).toBe(`feito:${ORG_C.id}`)
  })

  it("TODAS as orgs falhando ainda resolve — o pior caso é falha === total", async () => {
    const resumo = await forEachActiveOrg(
      async () => {
        throw new Error("tudo quebrado")
      },
      { source: "x" },
    )
    expect(resumo.falha).toBe(2)
    expect(resumo.sucesso).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Propriedade 2 — o `db` entregue é o ESCOPADO (C7: identidade, não "a fábrica foi chamada")
// MUTAÇÃO QUE REPROVA: chamar `createOrgScopedAdminClient(org.id)`, descartar o retorno e
// entregar `createAdminClient()` cru ao callback. Uma asserção só sobre a fábrica passaria.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("Propriedade 2 — o callback RECEBE o client escopado", () => {
  it("`db === sentinela(org.id)` em cada invocação, capturado dentro do próprio callback", async () => {
    orgsNoBanco = [ORG_A, ORG_B]
    const recebidos: Array<{ orgId: string; db: unknown }> = []

    await forEachActiveOrg(
      async (org, db) => {
        recebidos.push({ orgId: org.id, db })
        return null
      },
      { source: "x" },
    )

    expect(recebidos).toHaveLength(2)
    // `toBe` — identidade. `toEqual` passaria com um objeto novo de forma igual, que é justamente
    // a implementação errada que este teste existe para reprovar.
    expect(recebidos[0]!.db).toBe(sentinela(ORG_A.id))
    expect(recebidos[1]!.db).toBe(sentinela(ORG_B.id))
    // E o escopado de A nunca é o de B — se a fábrica fosse chamada uma vez só, isto acenderia.
    expect(recebidos[0]!.db).not.toBe(recebidos[1]!.db)

    expect(criarEscopado.mock.calls.map((c) => c[0])).toEqual([ORG_A.id, ORG_B.id])
  })

  it("o client CRU nunca chega ao callback: só `organizations` passa por ele", async () => {
    await forEachActiveOrg(async () => null, { source: "x" })
    expect(tabelasCruas).toEqual(["organizations"])
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Propriedade 3 — sequencial, `concurrency` default 1
// MUTAÇÃO QUE REPROVA: trocar o `for … await` por `Promise.all`/`allSettled`.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("Propriedade 3 — sequencial, nunca Promise.all", () => {
  it("as janelas de execução não se intercalam", async () => {
    const trilha: string[] = []
    await forEachActiveOrg(
      async (org) => {
        const marca = org.id === ORG_A.id ? "a" : "b"
        trilha.push(`${marca}-start`)
        await new Promise((r) => setTimeout(r, 10))
        trilha.push(`${marca}-end`)
        return null
      },
      { source: "x" },
    )
    expect(trilha).toEqual(["a-start", "a-end", "b-start", "b-end"])
  })

  it("`concurrency: 2` REJEITA (função async: o caminho de erro rejeita, não lança síncrono)", async () => {
    const fn = vi.fn()
    await expect(
      forEachActiveOrg(fn, { source: "x", concurrency: 2 as unknown as 1 }),
    ).rejects.toThrow(/concurrency/)
    // Zero trabalho parcial: a validação roda ANTES de listar orgs e ANTES de qualquer callback.
    expect(fn).not.toHaveBeenCalled()
    expect(tabelasCruas).toEqual([])
  })

  it("a mensagem NOMEIA o valor recebido e diz que não está implementado", async () => {
    await expect(
      forEachActiveOrg(vi.fn(), { source: "x", concurrency: 3 as unknown as 1 }),
    ).rejects.toThrow(/3.*não implementado/s)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Propriedade 4 — log por org + resumo
// MUTAÇÃO QUE REPROVA: não emitir o log de resumo, ou emiti-lo com `org_id` de alguma org.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("Propriedade 4 — log por org + um resumo de plataforma", () => {
  it("3 orgs (2 ok, 1 falha) ⇒ 4 chamadas a logEvent, a última o resumo sem `org_id`", async () => {
    orgsNoBanco = [ORG_A, ORG_B, ORG_C]
    await forEachActiveOrg(
      async (org) => {
        if (org.id === ORG_B.id) throw new Error("falhou")
        return null
      },
      { source: "api/cron/exemplo" },
    )

    expect(logEventOnceMock).toHaveBeenCalledTimes(4)
    const ev = eventos()

    expect(ev.map((e) => e.event_type)).toEqual([
      "CRON_ORG_PROCESSADA",
      "CRON_ORG_FALHOU",
      "CRON_ORG_PROCESSADA",
      "CRON_RESUMO",
    ])
    expect(ev[0]!.org_id).toBe(ORG_A.id)
    expect(ev[0]!.level).toBe("info")
    expect(ev[1]!.org_id).toBe(ORG_B.id)
    expect(ev[1]!.level).toBe("error")
    expect(ev[1]!.metadata!.erro).toContain("falhou")

    const resumo = ev[3]!
    expect(resumo.org_id).toBeUndefined()
    expect(resumo.metadata!.total).toBe(3)
    expect(resumo.metadata!.sucesso).toBe(2)
    expect(resumo.metadata!.falha).toBe(1)
    expect(ev.every((e) => e.source === "api/cron/exemplo")).toBe(true)
    expect(ev.every((e) => e.category === "cron")).toBe(true)
  })

  it("🔴 as 4 escritas são AGUARDADAS — tirar o `await` deixa `completados` vazio", async () => {
    // `logEvent` (fire-and-forget) era o que a AC1 prescrevia; numa lambda a promise pendente
    // morre no `return` do handler, e o `CRON_RESUMO` é a ÚLTIMA escrita antes do response —
    // exatamente o caso que custou o recibo perdido da Story 87-6 em produção.
    orgsNoBanco = [ORG_A, ORG_B, ORG_C]
    await forEachActiveOrg(
      async (org) => {
        if (org.id === ORG_B.id) throw new Error("falhou")
        return null
      },
      { source: "api/cron/exemplo" },
    )

    // No instante em que `forEachActiveOrg` resolve, as 4 escritas JÁ completaram.
    expect(completados).toHaveLength(4)
    expect(completados.map((e) => e.event_type)).toEqual([
      "CRON_ORG_PROCESSADA",
      "CRON_ORG_FALHOU",
      "CRON_ORG_PROCESSADA",
      "CRON_RESUMO",
    ])
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Propriedade 5 — status HTTP (função pura)
// MUTAÇÃO QUE REPROVA: tratar `total === 0` como falha, ou exigir `falha === 0` para 200.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("Propriedade 5 — statusHttpParaResumo", () => {
  const vazio = { resultados: [] }
  it("1 de 3 deu certo ⇒ 200 (não é falha do cron, é relatório)", () => {
    expect(statusHttpParaResumo({ total: 3, sucesso: 1, falha: 2, ...vazio })).toBe(200)
  })
  it("0 de 3 deu certo ⇒ 500", () => {
    expect(statusHttpParaResumo({ total: 3, sucesso: 0, falha: 3, ...vazio })).toBe(500)
  })
  it("zero orgs ativas ⇒ 200 (nada para fazer não é falha)", () => {
    expect(statusHttpParaResumo({ total: 0, sucesso: 0, falha: 0, ...vazio })).toBe(200)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// C8 — o par que discrimina: erro de listagem REJEITA, zero orgs RESOLVE.
// MUTAÇÃO QUE REPROVA: engolir o `error` e devolver `data ?? []` — os dois casos colapsam num só
// e "banco fora do ar" vira 200/"nada para fazer" em todo cron que usar o helper.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("C8 — erro ao listar organizations vs. zero orgs ativas", () => {
  it("erro ao listar organizations REJEITA, e o callback NUNCA é chamado", async () => {
    erroDaListagem = { message: "connection refused" }
    const fn = vi.fn()
    await expect(forEachActiveOrg(fn, { source: "x" })).rejects.toThrow(/connection refused/)
    expect(fn).not.toHaveBeenCalled()
  })

  it("zero orgs ativas RESOLVE com total 0 e zero callbacks — caminho DISTINTO do erro", async () => {
    orgsNoBanco = []
    const fn = vi.fn()
    const resumo = await forEachActiveOrg(fn, { source: "x" })
    expect(fn).not.toHaveBeenCalled()
    expect(resumo).toMatchObject({ total: 0, sucesso: 0, falha: 0 })
    expect(statusHttpParaResumo(resumo)).toBe(200)
  })
})
