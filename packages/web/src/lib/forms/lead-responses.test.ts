/**
 * Story 75-343 — as respostas do formulário na ficha do lead.
 *
 * O que precisa ser verdade, e por quê:
 *  - a resposta PARCIAL aparece, com a pergunta em que a pessoa parou. É o caso
 *    que motivou a story: "Não terminou" sozinho não diz até onde ela respondeu;
 *  - a ordem é da mais nova para a mais antiga (o interesse ATUAL primeiro);
 *  - schema quebrado não derruba a ficha do lead — o formulário é editável em
 *    produção, e um schema inválido não pode custar a página inteira;
 *  - resposta sem nenhuma pergunta respondida não vira painel vazio.
 *
 * Tudo aqui é decisão pura (entram linhas, saem painéis): o projeto não tem jsdom,
 * então a regra mora na função e não no JSX — mesma escolha da 75-333.
 */
import { describe, it, expect, vi } from "vitest"
import { mapRespostasDoLead, fetchRespostasDoLead, type RespostaCruaDoLead } from "./lead-responses"

vi.mock("server-only", () => ({}))

/** Captura o que a query pediu ao PostgREST — o recorte É o comportamento. */
const pedido: Record<string, unknown> = {}
vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => {
      pedido.tabela = tabela
      const api: Record<string, unknown> = {
        select: () => api,
        eq: (c: string, v: unknown) => {
          pedido[`eq:${c}`] = v
          return api
        },
        order: (c: string, o: { ascending: boolean }) => {
          pedido.order = `${c}:${o.ascending ? "asc" : "desc"}`
          return Promise.resolve({ data: (pedido.data as unknown[]) ?? [], error: null })
        },
      }
      return api
    },
  }),
}))

const SCHEMA = {
  perguntas: [
    { id: "nome", tipo: "texto", titulo: "Seu nome", obrigatoria: true },
    {
      id: "motivo",
      tipo: "escolha",
      titulo: "O que mais te atrai?",
      obrigatoria: true,
      opcoes: [
        { valor: "renda", rotulo: "Obter renda passiva (locação/Airbnb)", peso: 20 },
        { valor: "morar", rotulo: "Morar", peso: 10 },
      ],
    },
    {
      id: "valor",
      tipo: "escolha",
      titulo: "Qual valor de investimento faz sentido para você?",
      obrigatoria: true,
      opcoes: [{ valor: "300_600", rotulo: "De R$ 300.000 a R$ 600.000", peso: 24 }],
    },
  ],
}

function linha(over: Partial<RespostaCruaDoLead> = {}): RespostaCruaDoLead {
  return {
    id: "resp-1",
    answers: { nome: "Thereza Hosp", motivo: "renda", valor: "300_600" },
    score: 44,
    status: "completa",
    completed_at: "2026-08-18T23:19:00.000Z",
    created_at: "2026-08-18T23:10:00.000Z",
    metadata: {},
    lead_forms: { nome: "Investimento Maringá — Agosto", schema: SCHEMA },
    ...over,
  }
}

describe("mapRespostasDoLead", () => {
  it("resposta completa: perguntas em texto legível, sem 'parou em'", () => {
    const [r] = mapRespostasDoLead([linha()])
    expect(r!.formNome).toBe("Investimento Maringá — Agosto")
    expect(r!.parcial).toBe(false)
    expect(r!.parouEm).toBeNull()
    expect(r!.score).toBe(44)
    expect(r!.respostas.map((x) => x.resposta)).toEqual([
      "Thereza Hosp",
      "Obter renda passiva (locação/Airbnb)",
      "De R$ 300.000 a R$ 600.000",
    ])
  })

  it("resposta PARCIAL: mostra o que respondeu e ONDE parou", () => {
    // O caso real do Gabriel Henrique: deu o nome e travou na pergunta seguinte.
    const [r] = mapRespostasDoLead([
      linha({ id: "resp-parcial", answers: { nome: "Gabriel Henrique" }, status: "parcial", score: null, completed_at: null }),
    ])
    expect(r!.parcial).toBe(true)
    expect(r!.parouEm).toBe("O que mais te atrai?")
    expect(r!.respostas).toHaveLength(1)
    expect(r!.score).toBeNull()
    // Sem `completed_at`, a data cai para `created_at` — a ficha não fica sem data.
    expect(r!.preenchidoEm).toBe("2026-08-18T23:10:00.000Z")
  })

  it("preserva a ordem que veio do banco (mais nova primeiro)", () => {
    const out = mapRespostasDoLead([
      linha({ id: "nova", created_at: "2026-08-18T23:10:00.000Z" }),
      linha({ id: "antiga", created_at: "2026-07-01T10:00:00.000Z" }),
    ])
    expect(out.map((r) => r.id)).toEqual(["nova", "antiga"])
  })

  it("schema quebrado não derruba a ficha — a linha some, as outras ficam", () => {
    const out = mapRespostasDoLead([
      linha({ id: "boa" }),
      linha({ id: "quebrada", lead_forms: { nome: "Formulário torto", schema: { perguntas: "não é array" } } }),
    ])
    expect(out.map((r) => r.id)).toEqual(["boa"])
  })

  it("nada respondido não vira painel vazio", () => {
    expect(mapRespostasDoLead([linha({ answers: {} })])).toEqual([])
    expect(mapRespostasDoLead([linha({ lead_forms: null })])).toEqual([])
  })

  it("lê o resumo da IA do metadata (75-332) e ignora formato inesperado", () => {
    const [comResumo] = mapRespostasDoLead([linha({ metadata: { resumo_ia: "Quer renda passiva." } })])
    expect(comResumo!.resumoIa).toBe("Quer renda passiva.")
    const [semResumo] = mapRespostasDoLead([linha({ metadata: { resumo_ia: { texto: "x" } } })])
    expect(semResumo!.resumoIa).toBeNull()
  })

  it("embed em array (formato do PostgREST) funciona igual", () => {
    const [r] = mapRespostasDoLead([linha({ lead_forms: [{ nome: "Campanha A", schema: SCHEMA }] })])
    expect(r!.formNome).toBe("Campanha A")
  })
})

describe("fetchRespostasDoLead", () => {
  it("pede as respostas do lead, da org, da mais nova para a mais antiga", async () => {
    pedido.data = [linha()]
    const out = await fetchRespostasDoLead("lead-1", "org-1")

    expect(pedido.tabela).toBe("lead_form_responses")
    expect(pedido["eq:lead_id"]).toBe("lead-1")
    // Sem o escopo de org, uma resposta de outra organização entraria na ficha —
    // a tabela tem RLS SEM policies (mig 232) e é lida com service-role, então o
    // WHERE aqui é a única barreira.
    expect(pedido["eq:org_id"]).toBe("org-1")
    // AC3: a resposta mais recente descreve o interesse ATUAL e vem primeiro.
    expect(pedido.order).toBe("created_at:desc")
    expect(out).toHaveLength(1)
  })
})
