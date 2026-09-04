import { describe, it, expect } from "vitest"
import { shouldHandoff, generateHandoffSummary, isNonLeadContact } from "./handoff"

describe("shouldHandoff", () => {
  it("triggers on high score + price request", () => {
    const result = shouldHandoff({
      qualificationScore: 80,
      message: "Quanto custa o apartamento?",
      conversationState: {},
    })
    expect(result.trigger).toBe(true)
    expect(result.reason).toContain("preco")
  })

  it("triggers on high score + simulation request", () => {
    const result = shouldHandoff({
      qualificationScore: 70,
      message: "Quero fazer uma simulação",
      conversationState: {},
    })
    expect(result.trigger).toBe(true)
  })

  it("does NOT trigger price handoff on low score", () => {
    const result = shouldHandoff({
      qualificationScore: 50,
      message: "Quanto custa?",
      conversationState: {},
    })
    // Low score + price should NOT trigger (score < 70)
    // But it might match out-of-scope patterns. Let's check:
    // "quanto custa" matches PRICE_SIMULATION_PATTERNS but score < 70
    // It does NOT match OUT_OF_SCOPE_PATTERNS
    expect(result.trigger).toBe(false)
  })

  it("does NOT trigger when visit has been scheduled (Nicole continues attending)", () => {
    const result = shouldHandoff({
      qualificationScore: 20,
      message: "ok",
      conversationState: { visit_proposed: true },
    })
    expect(result.trigger).toBe(false)
  })

  it("does NOT trigger when visit_availability is true (Nicole continues attending)", () => {
    const result = shouldHandoff({
      qualificationScore: 10,
      message: "ok",
      conversationState: { visit_availability: true },
    })
    expect(result.trigger).toBe(false)
  })

  it("triggers on out-of-scope: wants to talk to a broker", () => {
    const result = shouldHandoff({
      qualificationScore: 30,
      message: "Quero falar com um corretor",
      conversationState: {},
    })
    expect(result.trigger).toBe(true)
    expect(result.reason).toContain("fora do escopo")
  })

  it("triggers on out-of-scope: complaint", () => {
    const result = shouldHandoff({
      qualificationScore: 10,
      message: "Tenho uma reclamação sobre o atendimento",
      conversationState: {},
    })
    expect(result.trigger).toBe(true)
  })

  it("triggers on out-of-scope: contract questions", () => {
    const result = shouldHandoff({
      qualificationScore: 10,
      message: "Preciso saber sobre o contrato",
      conversationState: {},
    })
    expect(result.trigger).toBe(true)
  })

  it("triggers on out-of-scope: financing details", () => {
    const result = shouldHandoff({
      qualificationScore: 10,
      message: "Como funciona o financiamento?",
      conversationState: {},
    })
    expect(result.trigger).toBe(true)
  })

  it("does NOT trigger for regular conversation", () => {
    const result = shouldHandoff({
      qualificationScore: 30,
      message: "Bom dia, tudo bem?",
      conversationState: {},
    })
    expect(result.trigger).toBe(false)
  })

  it("does NOT trigger for low score without special keywords", () => {
    const result = shouldHandoff({
      qualificationScore: 10,
      message: "Quero saber mais sobre os quartos",
      conversationState: {},
    })
    expect(result.trigger).toBe(false)
  })

  it("does NOT trigger for non-lead contact (job seeker), even with high score", () => {
    const result = shouldHandoff({
      qualificationScore: 90,
      message: "Gostaria de saber se há vagas de emprego e enviar meu currículo",
      conversationState: {},
    })
    expect(result.trigger).toBe(false)
  })
})

describe("isNonLeadContact", () => {
  it("detects job/employment inquiries", () => {
    expect(isNonLeadContact("gostaria de enviar meu curriculo")).toBe(true)
    expect(isNonLeadContact("tenho interesse em fazer parte da equipe da empresa")).toBe(true)
    expect(isNonLeadContact("vocês têm vaga de emprego?")).toBe(true)
    expect(isNonLeadContact("estão com processo seletivo aberto?")).toBe(true)
    // Caso real: candidata perguntando sobre vagas + currículo + equipe
    expect(
      isNonLeadContact(
        "Gostaria de saber se a empresa possui vagas disponíveis. Tenho interesse em fazer parte da equipe e encaminhar meu currículo."
      )
    ).toBe(true)
  })

  it("detects partnership / vendor inquiries", () => {
    expect(isNonLeadContact("tenho uma proposta de parceria")).toBe(true)
    expect(isNonLeadContact("sou fornecedor de materiais")).toBe(true)
  })

  it("detects media / advertising inquiries", () => {
    expect(isNonLeadContact("quero anunciar com vocês")).toBe(true)
    expect(isNonLeadContact("trabalho com mídia exterior, dupla face")).toBe(true)
  })

  it("does NOT flag genuine buyer messages", () => {
    expect(isNonLeadContact("quero comprar um apartamento")).toBe(false)
    expect(isNonLeadContact("tem unidade de 3 quartos disponível?")).toBe(false)
    expect(isNonLeadContact("gostaria de agendar uma visita")).toBe(false)
  })

  it("does NOT flag 'vaga' when it means parking spot (vaga de garagem)", () => {
    expect(isNonLeadContact("esse apê tem vaga de garagem?")).toBe(false)
    expect(isNonLeadContact("quantas vagas de garagem tem?")).toBe(false)
    expect(isNonLeadContact("tem vaga coberta disponível?")).toBe(false)
    expect(isNonLeadContact("o apartamento vem com 2 vagas?")).toBe(false)
  })
})

describe("generateHandoffSummary", () => {
  it("returns formatted summary string with all sections", () => {
    const summary = generateHandoffSummary(
      {
        name: "Maria",
        property_interest: "yarden",
        bedrooms: 3,
        floor: "alto",
        view: "frente",
        garages: 2,
        has_down_payment: true,
        source: "instagram",
        // Story 87-12 (AC4-ii) — `visit_availability: true` SAIU daqui. Dois motivos:
        // (a) o campo não é mais lido pelo resumo; (b) produção NUNCA produziu esse
        // valor — `jsonb_typeof` = `string` em 56 de 56 linhas, `boolean` em 0.
      },
      [
        { role: "user", content: "Oi, quero saber sobre o Yarden" },
        { role: "assistant", content: "Olá! O Yarden é um empreendimento incrível." },
        { role: "user", content: "Quanto custa?" },
      ]
    )

    expect(summary).toContain("=== RESUMO DO LEAD (HANDOFF) ===")
    expect(summary).toContain("Maria")
    expect(summary).toContain("yarden")
    expect(summary).toContain("3")
    expect(summary).toContain("alto")
    expect(summary).toContain("frente")
    expect(summary).toContain("instagram")
    // Story 87-12 (AC4-i) — asserção ANCORADA NO RÓTULO. O `toContain("sim")` solto
    // que estava aqui era colinear: a fixture passava `has_down_payment: true` E
    // `visit_availability: true`, os dois produziam "sim", e remover QUALQUER UM DOS
    // DOIS deixava o teste verde (medido em 16/08 contra `origin/main`, suíte inteira:
    // 2411 passed nas duas direções). É a razão mecânica de o defeito da linha de
    // disponibilidade ter sobrevivido desde 31/03/2026 sem um único vermelho.
    expect(summary).toContain("Entrada disponivel: sim")
    expect(summary).toContain("MENSAGENS DO LEAD:")
    expect(summary).toContain("Quanto custa?")
    expect(summary).toContain("TOTAL DE MENSAGENS: 3")
    expect(summary).toContain("=== FIM DO RESUMO ===")
  })

  it("shows 'nao informado' for missing fields", () => {
    const summary = generateHandoffSummary({}, [])
    expect(summary).toContain("nao informado")
  })

  it("formats has_down_payment=false as 'nao'", () => {
    const summary = generateHandoffSummary({ has_down_payment: false }, [])
    expect(summary).toContain("Entrada disponivel: nao")
  })

  it("includes only user messages in conversation section", () => {
    const summary = generateHandoffSummary(
      {},
      [
        { role: "user", content: "Mensagem do usuario" },
        { role: "assistant", content: "Resposta do assistente" },
      ]
    )
    expect(summary).toContain("Mensagem do usuario")
    expect(summary).not.toContain("Resposta do assistente")
  })

  it("limits to last 5 user messages", () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({
      role: "user" as const,
      content: `Mensagem ${i + 1}`,
    }))
    const summary = generateHandoffSummary({}, messages)
    expect(summary).not.toContain('"Mensagem 2"')
    expect(summary).toContain('"Mensagem 6"')
    expect(summary).toContain('"Mensagem 10"')
  })

  it("truncates long messages at 200 characters", () => {
    const longMessage = "A".repeat(300)
    const summary = generateHandoffSummary({}, [
      { role: "user", content: longMessage },
    ])
    expect(summary).toContain("...")
    expect(summary).not.toContain("A".repeat(300))
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Story 87-12 — a linha de disponibilidade lê o `agenda_state` (formato novo)
//
// Todas as fixtures abaixo foram COLADAS DE PRODUÇÃO (`dsopqkqjkmhytudaaolv`,
// SELECT via PostgREST, 16/08/2026). Não há nenhuma inventada: o `agenda_state`
// existe em exatamente DUAS linhas do banco, e as duas estão aqui.
//
// `generateHandoffSummary` é função PURA de montagem de texto — sem relógio, sem
// I/O, sem modelo. A prova desta story é asserção sobre a string montada, e é por
// isso que ela é verificável de verdade.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Rita — DIA sem hora. `conversation_state` 52416161-10c0-4bc2-9b6d-4a15a112f1a0,
 * `updated_at` 2026-08-15 12:31 UTC.
 *
 * Repare no par `expira_em 17/08` × `data_absoluta 18/08`: o estado VENCE ANTES do
 * dia para o qual ele aponta. É o teto de valor desta story, e está aqui de
 * propósito, byte a byte, para não ser esquecido.
 */
const AGENDA_RITA = {
  hora: null,
  fonte: "pendencia",
  minuto: null,
  origem: "lead",
  citacao: "Terça",
  periodo: null,
  expira_em: "2026-08-17T12:20:47.409Z",
  ancorado_em: "2026-08-15T12:20:47.409Z",
  data_absoluta: "2026-08-18",
}

/**
 * Ronaldo — HORA sem dia. `conversation_state` e644f1eb-7e1f-43dc-9f37-1d8c14e87c25,
 * `updated_at` 2026-08-10 00:30 UTC. Já VENCIDO (`expira_em` 12/08).
 *
 * Entra vencido de propósito: `parseAgendaState` não aplica TTL, e não deve — quem
 * apaga o estado vencido é o `chat/pipeline.ts:799-803`, antes de o `finalData`
 * nascer. Se um dia alguém puser um `if` de validade dentro do `handoff.ts`, este
 * caso fica vermelho e a duplicação de caminho de decisão aparece.
 *
 * É também a prova do rótulo obrigatório: o sistema RECUSOU o 17:30 daquele turno
 * (`NICOLE_SLOT_UNAUTHORIZED`, 10/08) — a citação é o que o LEAD disse, nunca um
 * compromisso.
 */
const AGENDA_RONALDO = {
  hora: 17,
  fonte: "pendencia",
  minuto: 30,
  origem: "lead",
  citacao: "3ª feira às 17:30",
  periodo: null,
  expira_em: "2026-08-12T00:15:45.465Z",
  ancorado_em: "2026-08-10T00:15:45.465Z",
  data_absoluta: null,
}

/**
 * Fala da PRÓPRIA Nicole gravada como se fosse disponibilidade do lead — a doença
 * que a 87-4 diagnosticou. 104 caracteres, colada do `visit_availability` da lead
 * Kharina. (Existe uma variante de 110 ch, com ", Luiz!", em outro lead: é outra
 * string, e não é esta.)
 */
const FALA_DA_NICOLE_KHARINA =
  "Ótimo! Qual o melhor dia pra você vir conhecer o decorado — durante a semana ou prefere sábado de manhã?"

/** A linha sob teste, isolada do resto do resumo. */
function linhaDisponibilidade(summary: string): string {
  return (
    summary.split("\n").find((l) => l.startsWith("- Disponibilidade para visita:")) ??
    "<<linha ausente do resumo>>"
  )
}

describe("Story 87-12 — disponibilidade para visita", () => {
  it("AC2-(i) par-ouro/Rita: dia SEM hora — a citação e o dia entram na linha", () => {
    const linha = linhaDisponibilidade(generateHandoffSummary({ agenda_state: AGENDA_RITA }, []))

    expect(linha).toContain("Terça")
    expect(linha).toContain("(dia 2026-08-18)")
    expect(linha).toContain("nao e visita marcada")
    expect(linha).toBe(
      '- Disponibilidade para visita: "Terça" (dia 2026-08-18) - nas palavras do lead, nao e visita marcada'
    )
  })

  it("AC2-(ii) par-ouro/Ronaldo: hora SEM dia — a citação entra e o sufixo de dia NÃO", () => {
    const linha = linhaDisponibilidade(generateHandoffSummary({ agenda_state: AGENDA_RONALDO }, []))

    expect(linha).toContain("3ª feira às 17:30")
    expect(linha).not.toContain("(dia ")
    expect(linha).toContain("nao e visita marcada")
    expect(linha).toBe(
      '- Disponibilidade para visita: "3ª feira às 17:30" - nas palavras do lead, nao e visita marcada'
    )
  })

  it("AC3 — controle POSITIVO e controle NEGATIVO, no mesmo teste", () => {
    // Os dois viajam juntos de propósito: um leitor que só imprimisse tudo passaria no
    // positivo, e um que não imprimisse nada passaria no negativo. Nenhum dos dois vale
    // sozinho.

    // POSITIVO — disponibilidade real APARECE.
    expect(linhaDisponibilidade(generateHandoffSummary({ agenda_state: AGENDA_RITA }, []))).toContain(
      "Terça"
    )

    // NEGATIVO — fala da Nicole no campo legado NÃO aparece. O `toHaveLength` trava a
    // fixture: se alguém a parafrasear, o teste passa a medir outra coisa e avisa.
    expect(FALA_DA_NICOLE_KHARINA).toHaveLength(104)
    expect(
      linhaDisponibilidade(
        generateHandoffSummary({ visit_availability: FALA_DA_NICOLE_KHARINA }, [])
      )
    ).toBe("- Disponibilidade para visita: nao informado")
  })

  it("AC3 (anti-colinearidade) — os DOIS campos no mesmo objeto: vence o `agenda_state`", () => {
    // Combinação que produção NUNCA produz — `stripLegacyAgendaKeys`
    // (`chat/pipeline.ts:821`) apaga o legado antes de o resumo ser montado. É
    // exatamente por isso que ela é obrigatória: com uma fixture montada a partir do
    // estado real, "lê o `agenda_state`" e "ignora o `visit_availability`" seriam
    // indistinguíveis, e um leitor que fizesse só metade do trabalho passaria verde.
    //
    // Este teste é SEPARADO do de cima por medição, não por estética: com os dois no
    // mesmo `it`, o vermelho da mutação vale "1 teste" e não distingue um fallback
    // depois do `agenda_state` (só a negativa cai) de um legado lido ANTES dele (caem
    // as duas). Ver os números colados na Dev Agent Record da story.
    const ambos = linhaDisponibilidade(
      generateHandoffSummary(
        { agenda_state: AGENDA_RITA, visit_availability: FALA_DA_NICOLE_KHARINA },
        []
      )
    )
    expect(ambos).toContain("Terça")
    expect(ambos).not.toContain("decorado")
  })

  it("citação MULTILINHA não parte o bloco rotulado em duas linhas", () => {
    // A `citacao` é a mensagem CRUA do lead (`qualification.ts:356`,
    // `chat/pipeline.ts:958` e `:1048`). Medido na população INTEIRA em 16/08: das
    // 1.877 mensagens `role='user'`, 99 (5,3 %) são alteradas pelo achatamento — e
    // no denominador que de fato vira `citacao` (mensagem com token de dia/hora) a
    // taxa é MAIOR, não menor: 3/45 = 6,7 % na régua estreita e 10/103 = 9,7 % na
    // larga. A mensagem abaixo é real, colada do banco. Sem o achatamento, o bloco
    // `INTERESSE:` ganha uma linha fantasma e o resumo vira o "malformado" do
    // gatilho (a) de rollback.
    const multilinha = { ...AGENDA_RITA, citacao: "Qual zona?\nvista pra rua." }
    const summary = generateHandoffSummary({ agenda_state: multilinha }, [])

    const rotuladas = summary.split("\n").filter((l) => l.startsWith("- Disponibilidade"))
    expect(rotuladas).toHaveLength(1)
    expect(linhaDisponibilidade(summary)).toBe(
      '- Disponibilidade para visita: "Qual zona? vista pra rua." (dia 2026-08-18) - nas palavras do lead, nao e visita marcada'
    )
    // A linha seguinte tem de continuar sendo a linha em branco que fecha o bloco.
    const idx = summary.split("\n").findIndex((l) => l.startsWith("- Disponibilidade"))
    expect(summary.split("\n")[idx + 1]).toBe("")
  })

  it("AC3 (fail-closed) — objeto que não passa na guarda de procedência vira silêncio", () => {
    // A guarda é do TIPO, não do texto: sem `citacao`, ou com `origem` diferente de
    // "lead", não é fato de agenda. A saída errada aqui seria uma AFIRMAÇÃO falsa; a
    // saída certa é "nao informado".
    const semCitacao = { ...AGENDA_RITA, citacao: "   " }
    const origemNicole = { ...AGENDA_RITA, origem: "nicole" }
    // 🔴 QA-6 — a guarda da citação também é uma DISJUNÇÃO
    // (`typeof o.citacao !== "string" || !o.citacao.trim()`), e o `semCitacao`
    // acima só acende a SEGUNDA metade: `"   "` É string. Esta fixture acende a
    // PRIMEIRA e só ela — `citacao` não-string com o resto do objeto íntegro.
    // O caso é real para uma coluna `jsonb` livre: quem escreve o campo é o
    // modelo, e a mensagem que mais vira `citacao` é justamente a que começa com
    // número de dia (`"15\nAgosto…"`).
    const citacaoNaoString = { ...AGENDA_RITA, citacao: 15 }

    expect(linhaDisponibilidade(generateHandoffSummary({ agenda_state: semCitacao }, []))).toBe(
      "- Disponibilidade para visita: nao informado"
    )
    expect(linhaDisponibilidade(generateHandoffSummary({ agenda_state: origemNicole }, []))).toBe(
      "- Disponibilidade para visita: nao informado"
    )
    expect(linhaDisponibilidade(generateHandoffSummary({ agenda_state: citacaoNaoString }, []))).toBe(
      "- Disponibilidade para visita: nao informado"
    )
  })

  it("AC3 (fail-closed/ÂNCORA) — estado sem âncora temporal também vira silêncio", () => {
    // Este `it` existe por um motivo MEDIDO, não por simetria. `parseAgendaState` tem
    // TRÊS guardas de forma, e as três eram órfãs em `origin/main` — nenhuma tinha um
    // vermelho de teste. As duas primeiras (`citacao` não-vazia e `origem === 'lead'`)
    // o `AC3 (fail-closed)` acima resgatou. A TERCEIRA, a da âncora, continuava sem
    // vermelho MESMO com esta story: removê-la deixava a suíte inteira verde (medido
    // em 16/08: 2.417 passed, zero vermelhos). Quem a segurava era só o `tsc`
    // (2× TS2322) — e o compilador pega a REMOÇÃO, não um enfraquecimento que ainda
    // devolvesse `string`.
    //
    // E importa mais aqui do que em qualquer outro consumidor: `handoff` é o ÚNICO
    // chamador de `parseAgendaState` sem TTL a jusante. Todos os outros passam por
    // `readAgendaState`, onde `Date.parse` de uma âncora ausente vira `NaN` e o TTL
    // devolve `null` — o que MASCARA a falha. Aqui não há máscara: sem esta guarda,
    // um estado sem âncora nenhuma IMPRIME para o corretor.
    //
    // 🔴 QA-6 — E A GUARDA É UMA DISJUNÇÃO: `typeof o.ancorado_em !== "string" ||
    // typeof o.expira_em !== "string"`. As duas fixtures que estavam aqui
    // (`semAncora` e um `ancoraNaoString` com AS DUAS chaves numéricas) faziam A e
    // B verdadeiros AO MESMO TEMPO — cada uma se escondia atrás da outra, e
    // enfraquecer UMA das duas metades deixava a suíte inteira verde. As duas
    // fixtures abaixo isolam UMA sub-expressão CADA: em cada uma, a outra chave de
    // âncora continua sendo string VÁLIDA. Sem isso, a metade do `expira_em` não
    // tem vermelho — e é ela que decide se o corretor lê um estado SEM VALIDADE
    // LEGÍVEL, num consumidor onde o TTL não passa depois para desmentir.
    const soAncoradoInvalido = { ...AGENDA_RITA, ancorado_em: 1755259247409 }
    const soExpiraInvalido = { ...AGENDA_RITA, expira_em: 1755431847409 }
    // Este NÃO isola (fere as duas metades), e fica declarado como tal: ele está
    // aqui porque é o caso REAL — estado gravado sem âncora nenhuma —, não como
    // vermelho de sub-expressão. Contá-lo como um terceiro seria contar errado.
    const semAncora = { citacao: "sexta de manha", origem: "lead", fonte: "pendencia" }

    expect(linhaDisponibilidade(generateHandoffSummary({ agenda_state: soAncoradoInvalido }, []))).toBe(
      "- Disponibilidade para visita: nao informado"
    )
    expect(linhaDisponibilidade(generateHandoffSummary({ agenda_state: soExpiraInvalido }, []))).toBe(
      "- Disponibilidade para visita: nao informado"
    )
    expect(linhaDisponibilidade(generateHandoffSummary({ agenda_state: semAncora }, []))).toBe(
      "- Disponibilidade para visita: nao informado"
    )
  })
})
