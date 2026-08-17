import { describe, it, expect, vi, beforeEach } from "vitest"

// Story 75-332 — AC4 e AC6, os dois que protegem julgamento humano.
//
// A migration 201 existe porque a IA sobrescrevia o calor que o corretor tinha
// definido ("corretor evoluía p/ Quente e a próxima mensagem devolvia p/ Frio").
// Estes testes existem para que isso não volte por uma porta nova.

// `vi.mock` é hoisted para o topo do arquivo — uma const comum ainda não
// existiria quando a fábrica roda. `vi.hoisted` sobe junto.
const { leituraMock } = vi.hoisted(() => ({ leituraMock: vi.fn() }))
vi.mock("@trifold/ai", async () => {
  const real = await vi.importActual<typeof import("@trifold/ai")>("@trifold/ai")
  return {
    // stripManualInterestLevel é o guard REAL, de propósito: é ele que está
    // sendo testado, não um dublê que sempre concorda.
    stripManualInterestLevel: real.stripManualInterestLevel,
    lerRespostasDoFormulario: leituraMock,
  }
})

import { extrairAbertas, analisarRespostasAbertas } from "./ai-reading"
import type { FormSchema } from "./schema"

const schema: FormSchema = {
  perguntas: [
    { id: "nome", tipo: "texto", titulo: "Nome", campo_contato: "nome" },
    { id: "motivo", tipo: "texto", titulo: "Por que está buscando?" },
    {
      id: "pagamento",
      tipo: "escolha",
      titulo: "Como pretende pagar?",
      opcoes: [
        { valor: "vista", rotulo: "À vista" },
        { valor: "financiado", rotulo: "Financiado" },
      ],
    },
    {
      id: "banco",
      tipo: "texto",
      titulo: "Qual banco?",
      condicoes: [{ pergunta: "pagamento", em: ["financiado"] }],
    },
  ],
}

describe("extrairAbertas", () => {
  it("pega só tipos livres — múltipla escolha o score já pontua", () => {
    const r = extrairAbertas(schema, { nome: "Ana", motivo: "Saindo do aluguel", pagamento: "vista" })
    expect(r).toEqual([
      { pergunta: "Nome", resposta: "Ana" },
      { pergunta: "Por que está buscando?", resposta: "Saindo do aluguel" },
    ])
  })

  it("ignora resposta de ramo que a pessoa NÃO percorreu", () => {
    // "banco" só existe para quem financia; quem pagou à vista nunca a viu.
    const r = extrairAbertas(schema, { nome: "Ana", pagamento: "vista", banco: "Itaú" })
    expect(r.map((x) => x.pergunta)).not.toContain("Qual banco?")
  })

  it("descarta respostas em branco", () => {
    expect(extrairAbertas(schema, { nome: "   ", motivo: "" })).toEqual([])
  })
})

// ─── Fake mínimo com filtros reais ───────────────────────────────────────────
type Row = Record<string, unknown>
let db: { leads: Row[]; lead_form_responses: Row[] }
const updates: { tabela: string; patch: Row }[] = []

function client() {
  return {
    from(tabela: string) {
      const preds: ((r: Row) => boolean)[] = []
      let patch: Row | null = null
      const api: Record<string, unknown> = {
        select: () => api,
        eq: (c: string, v: unknown) => {
          preds.push((r) => String(r[c]) === String(v))
          return api
        },
        update: (p: Row) => {
          patch = p
          return api
        },
        maybeSingle: async () => {
          const rows = (db as Record<string, Row[]>)[tabela]!.filter((r) => preds.every((p) => p(r)))
          return { data: rows[0] ?? null, error: null }
        },
        then: (resolve: (v: { data: null; error: null }) => unknown) => {
          if (patch) {
            updates.push({ tabela, patch })
            const alvo = (db as Record<string, Row[]>)[tabela]!
            for (const r of alvo) if (preds.every((p) => p(r))) Object.assign(r, patch)
          }
          return resolve({ data: null, error: null })
        },
      }
      return api
    },
  } as never
}

function base(interestLevelManual: boolean) {
  db = {
    leads: [
      {
        id: "lead-1",
        interest_level: "hot",
        interest_level_manual: interestLevelManual,
        qualificacao_comercial: null,
      },
    ],
    lead_form_responses: [{ id: "resp-1", metadata: {} }],
  }
  updates.length = 0
}

const chamar = () =>
  analisarRespostasAbertas({
    admin: client(),
    schema,
    respostas: { nome: "Ana", motivo: "Saindo do aluguel" },
    score: 10, // score baixo
    leadId: "lead-1",
    respostaId: "resp-1",
    orgId: "org-1",
  })

beforeEach(() => {
  leituraMock.mockReset()
  leituraMock.mockResolvedValue({ resumo: "Sai do aluguel.", calor: "cold" })
})

describe("analisarRespostasAbertas", () => {
  it("🔴 AC4 — lead com calor MANUAL não é tocado, mesmo com a IA discordando", async () => {
    base(true) // o corretor marcou como Quente à mão
    await chamar()

    // A IA devolveu "cold"; o corretor tinha dito "hot". O corretor manda.
    expect(db.leads[0]!.interest_level).toBe("hot")
    expect(updates.some((u) => u.tabela === "leads" && "interest_level" in u.patch)).toBe(false)
  })

  it("AC4 — sem marca manual, a IA define o calor", async () => {
    base(false)
    await chamar()
    expect(db.leads[0]!.interest_level).toBe("cold")
  })

  it("AC6 — qualificacao_comercial NUNCA é escrita", async () => {
    base(false)
    await chamar()
    expect(db.leads[0]!.qualificacao_comercial).toBeNull()
    for (const u of updates) expect(u.patch).not.toHaveProperty("qualificacao_comercial")
  })

  it("AC7 — o resumo é gravado no metadata da resposta", async () => {
    base(false)
    await chamar()
    expect(db.lead_form_responses[0]!.metadata).toMatchObject({ resumo_ia: "Sai do aluguel." })
  })

  it("AC2 — leitura falhou: nada é gravado, e não estoura", async () => {
    base(false)
    leituraMock.mockResolvedValue(null)
    await expect(chamar()).resolves.toBeUndefined()
    expect(updates).toHaveLength(0)
    expect(db.leads[0]!.interest_level).toBe("hot") // intocado
  })

  it("AC8 — sem pergunta aberta respondida, o modelo NEM é chamado", async () => {
    base(false)
    await analisarRespostasAbertas({
      admin: client(),
      schema,
      respostas: { pagamento: "vista" }, // só múltipla escolha
      score: 10,
      leadId: "lead-1",
      respostaId: "resp-1",
      orgId: "org-1",
    })
    expect(leituraMock).not.toHaveBeenCalled()
    expect(updates).toHaveLength(0)
  })
})
