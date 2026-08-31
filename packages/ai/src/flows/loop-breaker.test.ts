import { describe, it, expect } from "vitest"
import {
  LOOP_BOT_HANDOFF_REASON,
  LOOP_CLOSING_MAX_SENDS,
  LOOP_CLOSING_WINDOW_MIN,
  LOOP_COUNT_MAX,
  LOOP_COUNT_WINDOW_MIN,
  LOOP_REPEAT_MAX_SENDS,
  LOOP_REPEAT_WINDOW_MIN,
  PADROES_DE_ENCERRAMENTO,
  contarEnviosNaJanela,
  detectarLoopDeConteudo,
  detectarLoopDeEncerramento,
  detectarLoopPorContagem,
  ehMensagemDeEncerramento,
  type MensagemRecente,
} from "./loop-breaker"
import {
  CONV_CONTROLE,
  CONV_INCIDENTE,
  TRANSICAO_REAL_CONTROLE,
  emT,
  type MensagemDaFixture,
} from "./__fixtures__/loop-87-20"

/**
 * Story 87-20 — os três sinais da trava de loop bot-a-bot.
 *
 * A parte que decide se este arquivo vale alguma coisa é a REPRODUÇÃO (AC7/AC8): ela
 * caminha as fixtures reais mensagem a mensagem e pergunta, em cada passo, o que a
 * trava teria feito. Um teste que só afirmasse "3 iguais bloqueia" passaria com
 * qualquer implementação que conte até 3 — e não diria nada sobre o incidente.
 */

/** Âncora sintética de "agora" para os casos montados à mão. Ver `emT` na fixture. */
const BASE = new Date(emT(3600))

function msg(
  content: string,
  minutosAtras: number,
  isTransition = false,
  now: Date = BASE
): MensagemRecente {
  return {
    content,
    created_at: new Date(now.getTime() - minutosAtras * 60_000).toISOString(),
    isTransition,
  }
}

// ---------------------------------------------------------------------------
// AC1 — Sinal A: repetição exata de conteúdo
// ---------------------------------------------------------------------------

describe("detectarLoopDeConteudo (Sinal A — AC1)", () => {
  it("NÃO bloqueia o 1º envio de um texto", () => {
    const r = detectarLoopDeConteudo({ candidato: "Oi, tudo bem?", recentes: [], now: BASE })
    expect(r).toEqual({ bloquear: false, ocorrenciasAnteriores: 0 })
  })

  it("NÃO bloqueia o 2º envio do mesmo texto", () => {
    const r = detectarLoopDeConteudo({
      candidato: "Oi, tudo bem?",
      recentes: [msg("Oi, tudo bem?", 5)],
      now: BASE,
    })
    expect(r).toEqual({ bloquear: false, ocorrenciasAnteriores: 1 })
  })

  it("bloqueia o 3º envio do mesmo texto", () => {
    const r = detectarLoopDeConteudo({
      candidato: "Oi, tudo bem?",
      recentes: [msg("Oi, tudo bem?", 5), msg("Oi, tudo bem?", 2)],
      now: BASE,
    })
    expect(r).toEqual({ bloquear: true, ocorrenciasAnteriores: 2 })
  })

  it("compara trim(), não igualdade byte-a-byte — a régua MAIS dura das duas", () => {
    const r = detectarLoopDeConteudo({
      candidato: "  Até mais!  ",
      recentes: [msg("Até mais!", 5), msg("Até mais!\n", 2)],
      now: BASE,
    })
    expect(r.bloquear).toBe(true)
  })

  it("textos diferentes não somam — 2 distintos + 1 novo não bloqueia", () => {
    const r = detectarLoopDeConteudo({
      candidato: "Terceira fala",
      recentes: [msg("Primeira fala", 5), msg("Segunda fala", 2)],
      now: BASE,
    })
    expect(r).toEqual({ bloquear: false, ocorrenciasAnteriores: 0 })
  })

  it(`ignora envios idênticos fora da janela de ${LOOP_REPEAT_WINDOW_MIN} min`, () => {
    const r = detectarLoopDeConteudo({
      candidato: "Oi, tudo bem?",
      recentes: [
        msg("Oi, tudo bem?", LOOP_REPEAT_WINDOW_MIN + 1),
        msg("Oi, tudo bem?", LOOP_REPEAT_WINDOW_MIN + 10),
      ],
      now: BASE,
    })
    expect(r).toEqual({ bloquear: false, ocorrenciasAnteriores: 0 })
  })

  it("candidato vazio nunca bloqueia (a fala saneada vazia não é um loop)", () => {
    const r = detectarLoopDeConteudo({
      candidato: "   ",
      recentes: [msg("", 5), msg("", 2)],
      now: BASE,
    })
    expect(r.bloquear).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// AC2 — Sinal B: contagem estrutural
// ---------------------------------------------------------------------------

describe("detectarLoopPorContagem (Sinal B — AC2)", () => {
  /** N mensagens DISTINTAS, espalhadas dentro da janela de contagem. */
  function nDistintas(n: number, janelaMin = LOOP_COUNT_WINDOW_MIN - 1): MensagemRecente[] {
    return Array.from({ length: n }, (_, i) =>
      msg(`fala distinta numero ${i}`, (janelaMin * i) / Math.max(n - 1, 1))
    )
  }

  it(`bloqueia com ${LOOP_COUNT_MAX} mensagens em ${LOOP_COUNT_WINDOW_MIN} min, mesmo TODAS distintas`, () => {
    expect(detectarLoopPorContagem({ recentes: nDistintas(LOOP_COUNT_MAX), now: BASE })).toBe(true)
  })

  it(`NÃO bloqueia com ${LOOP_COUNT_MAX - 1} mensagens na janela`, () => {
    expect(detectarLoopPorContagem({ recentes: nDistintas(LOOP_COUNT_MAX - 1), now: BASE })).toBe(
      false
    )
  })

  /**
   * O carrasco do limiar. O pico real de 90 dias é uma conversa REAL: 19 mensagens
   * da Nicole em 10 min, todas distintas, com 2 mensagens `role='broker'` depois —
   * um lead que o corretor assumiu. Com o limiar de 15 da v1.1 ela seria cortada.
   * Sem este teste, nada impede o limiar de voltar a 15 num refator.
   */
  it("NÃO bloqueia o perfil do lead de maior volume — 19 distintas em 10 min (o falso positivo do limiar 15)", () => {
    expect(detectarLoopPorContagem({ recentes: nDistintas(19), now: BASE })).toBe(false)
  })

  it(`ignora mensagens fora da janela de ${LOOP_COUNT_WINDOW_MIN} min`, () => {
    const antigas = Array.from({ length: LOOP_COUNT_MAX + 5 }, (_, i) =>
      msg(`antiga ${i}`, LOOP_COUNT_WINDOW_MIN + 1 + i)
    )
    expect(detectarLoopPorContagem({ recentes: antigas, now: BASE })).toBe(false)
  })

  it("não olha o candidato — é o único sinal que roda antes de chamar o modelo (AC15)", () => {
    // Assinatura sem `candidato`: se um refator a adicionar, este teste não compila.
    const entrada: { recentes: MensagemRecente[]; now: Date } = {
      recentes: nDistintas(LOOP_COUNT_MAX),
      now: BASE,
    }
    expect(detectarLoopPorContagem(entrada)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// AC3 — Sinal C: modo de encerramento
// ---------------------------------------------------------------------------

describe("ehMensagemDeEncerramento / PADROES_DE_ENCERRAMENTO (AC3)", () => {
  it("a lista não está vazia — uma lista vazia faz o Sinal C sumir em silêncio", () => {
    expect(PADROES_DE_ENCERRAMENTO.length).toBeGreaterThanOrEqual(7)
  })

  it.each([
    ["Tchau!", true],
    ["Até mais!", true],
    ["até logo", true],
    ["Até breve, viu?", true],
    ["Até a próxima!", true],
    ["Qualquer coisa é só chamar", true],
    ["Qualquer coisa só chamar", true],
    ["Fico à disposição.", true],
    ["Foi um prazer te atender!", true],
    ["Foi um prazer atender você", true],
    ["Um abraço!", true],
    ["Nos falamos em breve", true],
    ["Qual dia seria melhor pra você?", false],
    ["Temos unidades de 2 e 3 dormitórios.", false],
    ["Se precisar, é só me chamar :)", false],
    ["", false],
    ["   ", false],
  ])("classifica %j como encerramento=%s", (texto, esperado) => {
    expect(ehMensagemDeEncerramento(texto)).toBe(esperado)
  })

  it("normaliza para MINÚSCULAS — sem isso o padrão casaria 'Até mais' e não 'ATÉ MAIS'", () => {
    expect(ehMensagemDeEncerramento("ATÉ MAIS!")).toBe(true)
    expect(ehMensagemDeEncerramento("TCHAU")).toBe(true)
  })

  it("os padrões são case-insensitive pela normalização, não por flag — nenhum usa /g (lastIndex)", () => {
    for (const p of PADROES_DE_ENCERRAMENTO) expect(p.global).toBe(false)
  })
})

describe("detectarLoopDeEncerramento (Sinal C — AC3)", () => {
  it("bloqueia a 3ª despedida mesmo com TEXTO DIFERENTE a cada vez", () => {
    const r = detectarLoopDeEncerramento({
      candidato: "Um abraço!",
      recentes: [msg("Tchau!", 4), msg("Fico à disposição.", 2)],
      now: BASE,
    })
    expect(r).toEqual({ bloquear: true, ocorrenciasAnteriores: 2 })
  })

  it("NÃO bloqueia a 2ª despedida — o pedido literal é 'no máximo 2'", () => {
    const r = detectarLoopDeEncerramento({
      candidato: "Um abraço!",
      recentes: [msg("Tchau!", 2)],
      now: BASE,
    })
    expect(r).toEqual({ bloquear: false, ocorrenciasAnteriores: 1 })
  })

  it("candidato que NÃO é despedida nunca dispara o Sinal C, mesmo com 5 despedidas antes", () => {
    const r = detectarLoopDeEncerramento({
      candidato: "Qual dia seria melhor pra você?",
      recentes: [
        msg("Tchau!", 5),
        msg("Até logo", 4),
        msg("Um abraço", 3),
        msg("Fico à disposição", 2),
        msg("Nos falamos", 1),
      ],
      now: BASE,
    })
    expect(r).toEqual({ bloquear: false, ocorrenciasAnteriores: 0 })
  })

  it("despedidas anteriores que NÃO são despedidas não contam", () => {
    const r = detectarLoopDeEncerramento({
      candidato: "Tchau!",
      recentes: [msg("Temos 2 e 3 dormitórios", 4), msg("Qual seu nome?", 2)],
      now: BASE,
    })
    expect(r).toEqual({ bloquear: false, ocorrenciasAnteriores: 0 })
  })

  it(`ignora despedidas fora da janela de ${LOOP_CLOSING_WINDOW_MIN} min`, () => {
    const r = detectarLoopDeEncerramento({
      candidato: "Um abraço!",
      recentes: [
        msg("Tchau!", LOOP_CLOSING_WINDOW_MIN + 1),
        msg("Até logo", LOOP_CLOSING_WINDOW_MIN + 2),
      ],
      now: BASE,
    })
    expect(r).toEqual({ bloquear: false, ocorrenciasAnteriores: 0 })
  })

  it(`LOOP_CLOSING_MAX_SENDS é ${LOOP_CLOSING_MAX_SENDS} — o número que o dono do produto pediu`, () => {
    expect(LOOP_CLOSING_MAX_SENDS).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// AC4 — fala humana não conta como fala da Nicole, NA PRÓPRIA FUNÇÃO PURA
// ---------------------------------------------------------------------------

describe("AC4 — `isTransition` faz parte do TIPO de entrada, não é filtro do chamador", () => {
  /**
   * A mensagem de transição do handoff é escrita por HUMANO com `role='assistant'`
   * (Story 87-5). Se ela contasse, a trava dispararia em cima do corretor. O campo
   * mora no tipo justamente para que ESTE teste possa existir: com o filtro só no
   * chamador, o caso degeneraria em "um array menor não dispara", que passa com ou
   * sem o defeito.
   */
  it("Sinal A: 2 repetições marcadas `isTransition` não bloqueiam a 3ª", () => {
    const r = detectarLoopDeConteudo({
      candidato: "Assumi a conversa por aqui.",
      recentes: [
        msg("Assumi a conversa por aqui.", 5, true),
        msg("Assumi a conversa por aqui.", 2, true),
      ],
      now: BASE,
    })
    expect(r).toEqual({ bloquear: false, ocorrenciasAnteriores: 0 })
  })

  it(`Sinal B: ${LOOP_COUNT_MAX + 5} mensagens de transição na janela não bloqueiam`, () => {
    const transicoes = Array.from({ length: LOOP_COUNT_MAX + 5 }, (_, i) =>
      msg(`fala do corretor ${i}`, i * 0.2, true)
    )
    expect(detectarLoopPorContagem({ recentes: transicoes, now: BASE })).toBe(false)
  })

  it("Sinal C: 2 despedidas de transição não bloqueiam a 3ª", () => {
    const r = detectarLoopDeEncerramento({
      candidato: "Um abraço!",
      recentes: [msg("Tchau!", 5, true), msg("Fico à disposição", 2, true)],
      now: BASE,
    })
    expect(r).toEqual({ bloquear: false, ocorrenciasAnteriores: 0 })
  })

  it("a transição REAL do controle negativo (is_transition=true, 9h depois) não é contada", () => {
    const transicao: MensagemRecente = {
      content: "Oi! Aqui é o corretor, assumi o atendimento a partir de agora.",
      created_at: TRANSICAO_REAL_CONTROLE.created_at,
      isTransition: TRANSICAO_REAL_CONTROLE.isTransition,
    }
    const agora = new Date(emT(TRANSICAO_REAL_CONTROLE.t + 29))
    expect(
      contarEnviosNaJanela({ recentes: [transicao], now: agora, janelaMin: LOOP_COUNT_WINDOW_MIN })
    ).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// AC7/AC8 — reprodução das duas conversas reais, mensagem a mensagem
// ---------------------------------------------------------------------------

type Sinal = "A" | "B" | "C"

interface Reproducao {
  /** Índice (1-based) da mensagem da Nicole em que a trava bloquearia. `null` = nunca. */
  bloqueouNa: number | null
  /** Quantas mensagens da Nicole chegariam ao lead. */
  enviadas: number
  sinal: Sinal | null
}

/**
 * Caminha a fixture como a produção caminharia: para cada mensagem da Nicole, as
 * ANTERIORES são `recentes` e ela própria é o `candidato`. `sinais` permite medir os
 * três juntos e cada um sozinho — o AC7 exige as duas coisas, e elas não cabem na
 * mesma execução (com o Sinal C ligado, o Sinal A nunca chega a disparar).
 *
 * A ordem B → A → C é a da produção: B roda antes de chamar o modelo (AC15), A e C
 * depois de gerar a fala.
 */
function reproduzir(fixture: MensagemDaFixture[], sinais: Sinal[]): Reproducao {
  const daNicole = fixture.filter((m) => m.role === "assistant")
  const recentes: MensagemRecente[] = []
  for (const [i, m] of daNicole.entries()) {
    const now = new Date(m.created_at)
    if (sinais.includes("B") && detectarLoopPorContagem({ recentes, now })) {
      return { bloqueouNa: i + 1, enviadas: i, sinal: "B" }
    }
    if (
      sinais.includes("A") &&
      detectarLoopDeConteudo({ candidato: m.content, recentes, now }).bloquear
    ) {
      return { bloqueouNa: i + 1, enviadas: i, sinal: "A" }
    }
    if (
      sinais.includes("C") &&
      detectarLoopDeEncerramento({ candidato: m.content, recentes, now }).bloquear
    ) {
      return { bloqueouNa: i + 1, enviadas: i, sinal: "C" }
    }
    recentes.push({ content: m.content, created_at: m.created_at, isTransition: false })
  }
  return { bloqueouNa: null, enviadas: daNicole.length, sinal: null }
}

describe("AC7 — réplica do incidente (22 mensagens em 5 min)", () => {
  const daNicole = CONV_INCIDENTE.filter((m) => m.role === "assistant")

  it("a fixture reproduz a forma medida: 22 mensagens, 11 da Nicole, 11 do outro lado", () => {
    expect(CONV_INCIDENTE).toHaveLength(22)
    expect(daNicole).toHaveLength(11)
    expect(CONV_INCIDENTE.filter((m) => m.role === "user")).toHaveLength(11)
  })

  it("cada mensagem tem o `length(content)` medido em produção", () => {
    for (const m of CONV_INCIDENTE) expect(m.content.length).toBe(m.len)
  })

  it("igualdade de rótulo de classe ⇔ igualdade de texto na fixture (estrutura de repetição)", () => {
    for (const a of CONV_INCIDENTE) {
      for (const b of CONV_INCIDENTE) {
        expect(a.content === b.content).toBe(a.hash === b.hash)
      }
    }
  })

  /**
   * A âncora que impede a régua de ser derivada da fonte: a coluna `enc` veio da
   * consulta SQL contra produção, não do código. Se `PADROES_DE_ENCERRAMENTO` deixar
   * de reproduzir a classificação medida, este teste reprova.
   */
  it("`PADROES_DE_ENCERRAMENTO` reproduz a classificação medida no banco, mensagem a mensagem", () => {
    const medido = daNicole.map((m) => m.enc)
    const calculado = daNicole.map((m) => ehMensagemDeEncerramento(m.content))
    expect(calculado).toEqual(medido)
    expect(medido).toEqual([false, false, true, true, false, true, true, true, true, true, true])
  })

  it("8 das 11 mensagens da Nicole eram despedidas — o diagnóstico literal do dono do produto", () => {
    expect(daNicole.filter((m) => ehMensagemDeEncerramento(m.content))).toHaveLength(8)
  })

  it("COM OS TRÊS SINAIS: bloqueia na 6ª mensagem (T+165s), pelo Sinal C — 5 enviadas, não 10", () => {
    expect(reproduzir(CONV_INCIDENTE, ["A", "B", "C"])).toEqual({
      bloqueouNa: 6,
      enviadas: 5,
      sinal: "C",
    })
    expect(daNicole[5]!.t).toBe(165)
  })

  it("COM O SINAL C DESLIGADO: o Sinal A sozinho bloqueia na 11ª (10 enviadas), 2m22s depois", () => {
    expect(reproduzir(CONV_INCIDENTE, ["A", "B"])).toEqual({
      bloqueouNa: 11,
      enviadas: 10,
      sinal: "A",
    })
    const c = new Date(daNicole[5]!.created_at).getTime()
    const a = new Date(daNicole[10]!.created_at).getTime()
    expect((a - c) / 1000).toBe(142) // 2m22s — deslocamento T+165s → T+307s
  })

  it("o Sinal B sozinho NUNCA teria contido o incidente — 11 < 25 na janela de 10 min", () => {
    expect(reproduzir(CONV_INCIDENTE, ["B"])).toEqual({
      bloqueouNa: null,
      enviadas: 11,
      sinal: null,
    })
  })
})

describe("AC8 — controle negativo real (lead de verdade, 11 msgs em 5 min)", () => {
  it("11 mensagens da Nicole, TODAS distintas, nenhuma casando encerramento", () => {
    expect(CONV_CONTROLE).toHaveLength(11)
    expect(new Set(CONV_CONTROLE.map((m) => m.content)).size).toBe(11)
    for (const m of CONV_CONTROLE) {
      expect(m.content.length).toBe(m.len)
      expect(ehMensagemDeEncerramento(m.content)).toBe(false)
    }
  })

  it("NENHUM dos três sinais dispara", () => {
    expect(reproduzir(CONV_CONTROLE, ["A", "B", "C"])).toEqual({
      bloqueouNa: null,
      enviadas: 11,
      sinal: null,
    })
  })

  /**
   * O denominador honesto (S3 do @po): o Sinal A só pode disparar onde a conversa tem
   * ≥ 3 mensagens da Nicole — 54 das 205 conversas de 14 dias, não 205. Dizer "zero
   * falso positivo em 205" superestima a evidência em ~4×. O achado continua forte
   * com o denominador certo: dentro das elegíveis, nenhuma chega ao 2º envio idêntico.
   */
  it("registra o denominador: o Sinal A precisa de ≥ 3 mensagens da Nicole para poder disparar", () => {
    const duas = CONV_CONTROLE.slice(0, 2)
    expect(reproduzir(duas, ["A"]).bloqueouNa).toBeNull()
    expect(LOOP_REPEAT_MAX_SENDS + 1).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// Contrato de constantes — o que o webhook e o pipeline importam
// ---------------------------------------------------------------------------

describe("constantes exportadas", () => {
  it("LOOP_BOT_HANDOFF_REASON é o valor gravado em `conversations.handoff_reason`", () => {
    expect(LOOP_BOT_HANDOFF_REASON).toBe("loop_bot_detectado")
  })

  it("os limiares são os medidos, não os da v1.1", () => {
    expect(LOOP_REPEAT_WINDOW_MIN).toBe(30)
    expect(LOOP_REPEAT_MAX_SENDS).toBe(2)
    expect(LOOP_COUNT_WINDOW_MIN).toBe(10)
    expect(LOOP_COUNT_MAX).toBe(25)
    expect(LOOP_CLOSING_WINDOW_MIN).toBe(30)
  })
})
