import { describe, it, expect } from "vitest"
import {
  statusDaLinha,
  perguntaDeAbandono,
  montarLinhas,
  abandonoPorPergunta,
  type RespostaCrua,
} from "./response-list"
import { parseFormSchema } from "./schema"

// Story 75-333 — a base de respostas. O caso que dá nome ao pedido do Marcos é
// a resposta ABANDONADA, então é ela que precisa da cobertura mais dura.

const schema = parseFormSchema({
  perguntas: [
    { id: "nome", tipo: "texto", titulo: "Seu nome", campo_contato: "nome", obrigatoria: true },
    { id: "tel", tipo: "telefone", titulo: "WhatsApp", campo_contato: "telefone", obrigatoria: true },
    { id: "renda", tipo: "texto", titulo: "Renda familiar", obrigatoria: true },
    { id: "obs", tipo: "texto", titulo: "Algo a acrescentar?" },
  ],
})

describe("statusDaLinha", () => {
  it("completa é completa, com ou sem lead", () => {
    expect(statusDaLinha({ status: "completa", temLead: true })).toBe("completa")
    expect(statusDaLinha({ status: "completa", temLead: false })).toBe("completa")
  })

  it("parcial COM lead = não terminou (dá para ofertar)", () => {
    expect(statusDaLinha({ status: "parcial", temLead: true })).toBe("nao_terminou")
  })

  it("parcial SEM lead = sem contato — o caso que NÃO permite oferta ativa", () => {
    // Rótulo próprio de propósito: confundir isso com um lead contactável faria
    // alguém prometer uma ligação que não tem para quem fazer.
    expect(statusDaLinha({ status: "parcial", temLead: false })).toBe("sem_contato")
  })
})

describe("perguntaDeAbandono", () => {
  it("aponta a pergunta em que a pessoa travou", () => {
    expect(perguntaDeAbandono(schema, { nome: "Ana", tel: "44999990000" })).toBe("Renda familiar")
  })

  it("quem respondeu tudo o que era obrigatório não tem pergunta de abandono útil", () => {
    // Sobrou só a opcional — `proximaPergunta` a devolve, e é a informação certa:
    // é onde a pessoa estava quando parou.
    expect(perguntaDeAbandono(schema, { nome: "Ana", tel: "4499", renda: "8k" })).toBe(
      "Algo a acrescentar?"
    )
  })

  it("nada respondido aponta a primeira", () => {
    expect(perguntaDeAbandono(schema, {})).toBe("Seu nome")
  })
})

const crua = (over: Partial<RespostaCrua> = {}): RespostaCrua => ({
  id: "r1",
  answers: { nome: "Ana", tel: "44999990000" },
  score: null,
  status: "parcial",
  created_at: "2026-08-17T10:00:00Z",
  completed_at: null,
  metadata: { utm: { utm_campaign: "vind_agosto" } },
  lead_id: "lead-1",
  lead_forms: { nome: "Campanha Vind", schema: schema as unknown },
  leads: { name: "Ana", phone: "5544999990000" },
  ...over,
})

describe("montarLinhas", () => {
  it("monta a linha de quem não terminou, com onde parou e a campanha", () => {
    const [l] = montarLinhas([crua()])
    expect(l!.status).toBe("nao_terminou")
    expect(l!.parouEm).toBe("Renda familiar")
    expect(l!.campanha).toBe("vind_agosto")
    expect(l!.nome).toBe("Ana")
    expect(l!.respostas.map((r) => r.titulo)).toEqual(["Seu nome", "WhatsApp"])
  })

  it("resposta SEM lead aparece na base — é o ponto do pedido", () => {
    const [l] = montarLinhas([crua({ lead_id: null, leads: null })])
    expect(l!.status).toBe("sem_contato")
    expect(l!.nome).toBeNull()
    expect(l!.telefone).toBeNull()
    // O que ela respondeu continua visível: é o que sobra de valor.
    expect(l!.respostas).toHaveLength(2)
    expect(l!.parouEm).toBe("Renda familiar")
  })

  it("completa não tem pergunta de abandono e usa a data de conclusão", () => {
    const [l] = montarLinhas([
      crua({ status: "completa", completed_at: "2026-08-17T12:00:00Z", score: 80 }),
    ])
    expect(l!.status).toBe("completa")
    expect(l!.parouEm).toBeNull()
    expect(l!.quando).toBe("2026-08-17T12:00:00Z")
    expect(l!.score).toBe(80)
  })

  it("schema quebrado degrada a LINHA, não a tela", () => {
    // Perder a visão de 300 leads porque um formulário tem JSON ruim seria o
    // pior resultado possível.
    const [l] = montarLinhas([crua({ lead_forms: { nome: "Quebrado", schema: "não é json" } })])
    expect(l!.formNome).toBe("Quebrado")
    expect(l!.respostas).toEqual([])
    expect(l!.parouEm).toBeNull()
  })

  it("aceita embed do PostgREST como objeto OU array", () => {
    const comoArray = montarLinhas([
      crua({
        lead_forms: [{ nome: "Campanha Vind", schema: schema as unknown }],
        leads: [{ name: "Ana", phone: "5544999990000" }],
      }),
    ])
    expect(comoArray[0]!.formNome).toBe("Campanha Vind")
    expect(comoArray[0]!.nome).toBe("Ana")
  })

  it("sem UTM, campanha é null e nada quebra", () => {
    const [l] = montarLinhas([crua({ metadata: {} })])
    expect(l!.campanha).toBeNull()
  })
})

describe("abandonoPorPergunta", () => {
  it("ranqueia onde as pessoas param, do maior para o menor", () => {
    const linhas = montarLinhas([
      crua({ id: "a" }),
      crua({ id: "b" }),
      crua({ id: "c", answers: {} }), // parou na primeira
      crua({ id: "d", status: "completa", completed_at: "2026-08-17T12:00:00Z" }),
    ])
    expect(abandonoPorPergunta(linhas)).toEqual([
      { pergunta: "Renda familiar", total: 2 },
      { pergunta: "Seu nome", total: 1 },
    ])
  })

  it("só completas devolve lista vazia", () => {
    const linhas = montarLinhas([crua({ status: "completa", completed_at: "x" })])
    expect(abandonoPorPergunta(linhas)).toEqual([])
  })
})
