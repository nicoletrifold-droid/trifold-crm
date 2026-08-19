import { describe, it, expect, afterEach } from "vitest"
import { dividirResposta, divisaoEmBlocosLigada } from "./split-response"

/**
 * Story 75-348 (AC6) — o teste do DIVISOR, não do envio.
 *
 * A régua que importa aqui é negativa: a maior parte dos casos tem de sair
 * INTEIRA. Um teste que só verificasse "divide em dois" ficaria verde com uma
 * função que parte confirmação de visita no meio — o defeito que a 75-245 fechou.
 */

/** Texto real de produção (print de 19/08) — o tamanho importa: é ele que passa do teto. */
const CONTEXTO =
  "É um apartamento boutique bem especial — 67m² com 2 suítes e uma sacada com churrasqueira a carvão integrada. Imagina um churrasco no final de semana sem sair de casa!"
const PERGUNTA = "Você está buscando pra morar ou pensando mais como investimento?"
const LONGA = `${CONTEXTO}\n\n${PERGUNTA}`

describe("75-348 — dividirResposta", () => {
  it("divide contexto e pergunta em dois blocos", () => {
    const blocos = dividirResposta(LONGA)
    expect(blocos).toHaveLength(2)
    expect(blocos[0]).toBe(CONTEXTO)
    expect(blocos[1]).toBe(PERGUNTA)
  })

  it("nunca passa de 2 blocos, mesmo com 4 parágrafos", () => {
    const quatro = `${CONTEXTO}\n\nA área de lazer é completa, com piscina aquecida.\n\nO prazo de entrega é 2027.\n\n${PERGUNTA}`
    const blocos = dividirResposta(quatro)
    expect(blocos).toHaveLength(2)
    // A pergunta fica sozinha no último; o resto vai junto no primeiro.
    expect(blocos[1]).toBe(PERGUNTA)
    expect(blocos[0]).toContain("piscina aquecida")
    expect(blocos[0]).toContain("2027")
  })

  it("🔥 NÃO divide confirmação de agendamento — dia e horário viajam juntos (75-245)", () => {
    const confirmacao =
      "Anotado, Andressa! Te espero quinta-feira às 10h aqui na sede da Trifold, na Av. Nildo Ribeiro da Rocha, 1337.\n\nVou deixar o café preparado. Posso te ajudar com mais alguma coisa?"
    expect(dividirResposta(confirmacao)).toHaveLength(1)
  })

  it("🔥 NÃO divide texto com marcação interna vazada (fail-closed)", () => {
    const vazado = `[SISTEMA: horário LIVRE] ${CONTEXTO}\n\n${PERGUNTA}`
    expect(dividirResposta(vazado)).toHaveLength(1)
  })

  it("não divide quando a pergunta NÃO está no último parágrafo", () => {
    const perguntaNoMeio = `${PERGUNTA}\n\n${CONTEXTO} E o prazo de entrega é 2027, com acabamento de alto padrão.`
    expect(dividirResposta(perguntaNoMeio)).toHaveLength(1)
  })

  it("não divide texto curto", () => {
    expect(dividirResposta("Claro!\n\nQual dia fica melhor?")).toHaveLength(1)
  })

  it("o teto de 160 caracteres é a régua de 'já é curto'", () => {
    const quase = "O Vind tem 67m² com 2 suítes e sacada com churrasqueira.\n\nO que achou?"
    expect(quase.length).toBeLessThan(160)
    expect(dividirResposta(quase)).toHaveLength(1)
  })

  it("não divide parágrafo único, por longo que seja", () => {
    const um = `${CONTEXTO} ${CONTEXTO} ${PERGUNTA}`
    expect(dividirResposta(um)).toHaveLength(1)
  })

  it("preserva o texto inteiro: juntar os blocos devolve o conteúdo", () => {
    const blocos = dividirResposta(LONGA)
    expect(blocos.join("\n\n")).toBe(LONGA.trim())
  })

  it("string vazia não explode", () => {
    expect(dividirResposta("")).toEqual([""])
    expect(dividirResposta("   ")).toHaveLength(1)
  })
})

describe("75-348 — a flag", () => {
  const original = process.env.NICOLE_RESPOSTA_EM_BLOCOS
  afterEach(() => {
    if (original === undefined) delete process.env.NICOLE_RESPOSTA_EM_BLOCOS
    else process.env.NICOLE_RESPOSTA_EM_BLOCOS = original
  })

  it("desligada por padrão", () => {
    delete process.env.NICOLE_RESPOSTA_EM_BLOCOS
    expect(divisaoEmBlocosLigada()).toBe(false)
  })

  it("só o literal 'true' liga (vazio da Vercel não liga)", () => {
    process.env.NICOLE_RESPOSTA_EM_BLOCOS = ""
    expect(divisaoEmBlocosLigada()).toBe(false)
    process.env.NICOLE_RESPOSTA_EM_BLOCOS = "1"
    expect(divisaoEmBlocosLigada()).toBe(false)
    process.env.NICOLE_RESPOSTA_EM_BLOCOS = "TRUE"
    expect(divisaoEmBlocosLigada()).toBe(false)
    process.env.NICOLE_RESPOSTA_EM_BLOCOS = "true"
    expect(divisaoEmBlocosLigada()).toBe(true)
  })
})
