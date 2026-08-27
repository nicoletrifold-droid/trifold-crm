/**
 * Story 90-1 (Epic 90) — testes do flow do Live Coach.
 *
 * Foco nos parsers (é onde o dinheiro é perdido: JSON inválido persistido viraria
 * card mentiroso) e nas duas regras de produto que não podem regredir:
 *  - `confianca: "baixa"` NUNCA vira sugestão (o modelo admitiu chute);
 *  - `ancorada` é derivada das âncoras, não confiada ao modelo.
 */
import { describe, it, expect, vi } from "vitest"
import type Anthropic from "@anthropic-ai/sdk"
import {
  isCoachEligible,
  detectObjection,
  draftCoachReply,
  parseObjectionDetection,
  parseCoachDraft,
} from "./live-coach"

const DETECCAO = {
  tem_objecao: true,
  objecao: "achou caro e viu outro empreendimento mais perto por menos",
  tipo: "preco",
  confianca: "alta",
}

const DRAFT = {
  respostas: [
    "Entendo, e faz sentido comparar. A diferença aqui é a entrega em 03/2027 e o metro quadrado de 82m² — o outro que você viu tem quantos?",
    "Te mando o comparativo dos dois hoje? Assim você decide com número na mão.",
  ],
  ancoras: ["Entrega prevista 03/2027", "Unidades de 82m² a 96m²"],
  cuidado: "Não prometer desconto — a tabela vigente não tem margem liberada.",
}

/** Mock mínimo do client: devolve o texto como um bloco `text`. */
function makeAnthropic(raw: string, blocks?: Anthropic.Message["content"]) {
  const create = vi.fn(async () => ({
    content: blocks ?? [{ type: "text", text: raw }],
  }))
  return { anthropic: { messages: { create } } as unknown as Anthropic, create }
}

describe("isCoachEligible", () => {
  it("rejeita mensagem curta, emoji, número e link solto", () => {
    expect(isCoachEligible("ok")).toBe(false)
    expect(isCoachEligible("👍")).toBe(false)
    expect(isCoachEligible("   ")).toBe(false)
    expect(isCoachEligible("123456789")).toBe(false)
    expect(isCoachEligible("https://exemplo.com.br/imovel/123")).toBe(false)
  })

  it("aceita frase real com objeção", () => {
    expect(isCoachEligible("achei caro pro que oferece")).toBe(true)
  })

  it("aceita link COM texto ao redor (a objeção está no texto)", () => {
    expect(
      isCoachEligible("achei esse melhor e mais barato https://exemplo.com.br/x")
    ).toBe(true)
  })
})

describe("parseObjectionDetection", () => {
  it("aceita JSON válido", () => {
    const r = parseObjectionDetection(JSON.stringify(DETECCAO))
    expect(r).not.toBeNull()
    expect(r!.tipo).toBe("preco")
    expect(r!.confianca).toBe("alta")
  })

  it("aceita JSON em code block markdown", () => {
    const r = parseObjectionDetection("```json\n" + JSON.stringify(DETECCAO) + "\n```")
    expect(r!.objecao).toContain("caro")
  })

  it("recorta JSON cercado de prosa", () => {
    const r = parseObjectionDetection(`Analisando:\n${JSON.stringify(DETECCAO)}\nPronto.`)
    expect(r).not.toBeNull()
  })

  it("descarta confianca baixa — modelo admitiu chute", () => {
    const baixa = { ...DETECCAO, confianca: "baixa" }
    expect(parseObjectionDetection(JSON.stringify(baixa))).toBeNull()
  })

  it("descarta tipo fora do CHECK da migration", () => {
    const invalido = { ...DETECCAO, tipo: "burocracia" }
    expect(parseObjectionDetection(JSON.stringify(invalido))).toBeNull()
  })

  it("devolve null quando tem_objecao é false", () => {
    expect(parseObjectionDetection(JSON.stringify({ tem_objecao: false }))).toBeNull()
  })

  it("devolve null para objeção vazia e para texto que não é JSON", () => {
    expect(parseObjectionDetection(JSON.stringify({ ...DETECCAO, objecao: "  " }))).toBeNull()
    expect(parseObjectionDetection("O cliente parece indeciso.")).toBeNull()
  })
})

describe("parseCoachDraft", () => {
  it("aceita JSON válido e deriva ancorada=true", () => {
    const r = parseCoachDraft(JSON.stringify(DRAFT))
    expect(r).not.toBeNull()
    expect(r!.respostas).toHaveLength(2)
    expect(r!.ancorada).toBe(true)
    expect(r!.cuidado).toContain("desconto")
  })

  it("ancorada=false quando não sobrou âncora — mesmo se o modelo disser o contrário", () => {
    const semAncora = { ...DRAFT, ancoras: [], ancorada: true }
    const r = parseCoachDraft(JSON.stringify(semAncora))
    expect(r!.ancorada).toBe(false)
  })

  it("ignora âncoras vazias/whitespace ao derivar ancorada", () => {
    const r = parseCoachDraft(JSON.stringify({ ...DRAFT, ancoras: ["", "   "] }))
    expect(r!.ancorada).toBe(false)
    expect(r!.ancoras).toEqual([])
  })

  it("limita a 2 rascunhos", () => {
    const muitas = { ...DRAFT, respostas: ["a) uma", "b) duas", "c) tres", "d) quatro"] }
    expect(parseCoachDraft(JSON.stringify(muitas))!.respostas).toHaveLength(2)
  })

  it("normaliza cuidado ausente, vazio e string 'null'", () => {
    expect(parseCoachDraft(JSON.stringify({ ...DRAFT, cuidado: null }))!.cuidado).toBeNull()
    expect(parseCoachDraft(JSON.stringify({ ...DRAFT, cuidado: "  " }))!.cuidado).toBeNull()
    expect(parseCoachDraft(JSON.stringify({ ...DRAFT, cuidado: "null" }))!.cuidado).toBeNull()
  })

  it("devolve null sem respostas úteis", () => {
    expect(parseCoachDraft(JSON.stringify({ ...DRAFT, respostas: [] }))).toBeNull()
    expect(parseCoachDraft(JSON.stringify({ ...DRAFT, respostas: ["", "  "] }))).toBeNull()
    expect(parseCoachDraft(JSON.stringify({ respostas: "texto" }))).toBeNull()
    expect(parseCoachDraft("desculpe, não consegui")).toBeNull()
  })
})

describe("detectObjection", () => {
  it("usa o modelo Haiku e devolve a detecção", async () => {
    const { anthropic, create } = makeAnthropic(JSON.stringify(DETECCAO))
    const r = await detectObjection(anthropic, { message: "achei caro" })
    expect(r!.tipo).toBe("preco")
    const [body] = create.mock.calls[0] as unknown as [{ model: string }]
    expect(body.model).toContain("haiku")
  })

  it("inclui o contexto recente no prompt quando fornecido", async () => {
    const { anthropic, create } = makeAnthropic(JSON.stringify(DETECCAO))
    await detectObjection(anthropic, {
      message: "e o preço?",
      recentHistory: "Lead: bom dia\nCorretor: bom dia!",
    })
    const [body] = create.mock.calls[0] as unknown as [{ messages: { content: string }[] }]
    expect(body.messages[0].content).toContain("CONTEXTO RECENTE")
  })

  it("concatena blocos de texto e ignora bloco de thinking (lição 82-4)", async () => {
    const { anthropic } = makeAnthropic("", [
      { type: "thinking", thinking: "raciocinando...", signature: "x" },
      { type: "text", text: JSON.stringify(DETECCAO) },
    ] as unknown as Anthropic.Message["content"])
    const r = await detectObjection(anthropic, { message: "achei caro" })
    expect(r).not.toBeNull()
    expect(r!.tipo).toBe("preco")
  })
})

describe("draftCoachReply", () => {
  it("usa Sonnet e devolve os rascunhos", async () => {
    const { anthropic, create } = makeAnthropic(JSON.stringify(DRAFT))
    const r = await draftCoachReply(anthropic, {
      objecao: "achou caro",
      tipo: "preco",
      ragContext: "Entrega 03/2027. Unidades 82m² a 96m².",
    })
    expect(r!.respostas).toHaveLength(2)
    expect(r!.ancorada).toBe(true)
    const [body] = create.mock.calls[0] as unknown as [{ model: string }]
    expect(body.model).toContain("sonnet")
  })

  it("avisa o modelo quando não há âncora disponível", async () => {
    const { anthropic, create } = makeAnthropic(JSON.stringify({ ...DRAFT, ancoras: [] }))
    const r = await draftCoachReply(anthropic, {
      objecao: "achou caro",
      tipo: "preco",
      ragContext: "   ",
    })
    const [body] = create.mock.calls[0] as unknown as [{ messages: { content: string }[] }]
    expect(body.messages[0].content).toContain("nao ha dado disponivel")
    expect(r!.ancorada).toBe(false)
  })
})
