/**
 * Story 87-7 — os testes do guarda de escrita do `ai_summary`.
 *
 * As fixturas são **literais de produção**, palavra por palavra. Não são
 * paráfrases: as duas frases que abrem o arquivo foram lidas do banco em 08/08
 * (`leads.ai_summary`) e são a razão de a story existir.
 */
import { describe, it, expect } from "vitest"
import {
  analisarAfirmacaoDeVisita,
  citacaoCurta,
  candidatosDeDia,
  classificarResumo,
  renderFatoDeAgenda,
  REGRAS_FATO_DE_AGENDA,
  type AppointmentDoResumo,
} from "./summary-grounding"
import { detectAffirmedSlot } from "./visit-slot"

/** 08/08/2026 é SÁBADO. É o dia que as duas frases afirmam. */
const HOJE = new Date("2026-08-08T13:00:00Z") // 10:00 BRT

/** A frase que originou a story — `leads.ai_summary` da Sandra, produção, 05/08. */
const SANDRA = "Sandra agendou visita para sábado, dia 8"

/**
 * O caso VIVO encontrado pelo @po em 08/08 — Lucimara, resumo de 04/08,
 * `count(appointments) = 0`. Mais duro que o da Sandra: traz a ressalva no
 * próprio texto, e o guarda não pode ser absolvido por ela.
 */
const LUCIMARA =
  "Marcou visita ao decorado para o dia 8 (sábado), mas precisa confirmar o horário de trabalho antes de finalizar o agendamento"

/** O resumo INTEIRO da Lucimara, como está gravado em produção. */
const LUCIMARA_RESUMO_COMPLETO =
  "Lucimara demonstra interesse no empreendimento Vind Residence, especificamente em unidades de 2 suítes com vista para a rua (frente). Não tem preferência por andar (aceitou qualquer nível) e informou que não precisa de vagas de garagem. Marcou visita ao decorado para o dia 8 (sábado), mas precisa confirmar o horário de trabalho antes de finalizar o agendamento. Lead mostrou interesse genuíno e disponibilidade para conhecer o imóvel em breve. Próximo passo: aguardar confirmação de horário de Lucimara para finalizar agendamento da visita."

function appt(iso: string, status = "scheduled", id = "appt-1"): AppointmentDoResumo {
  return { id, scheduled_at: new Date(iso), status }
}

describe("AC1 — o guarda dispara nas DUAS frases literais de produção", () => {
  it("(i) Sandra: afirma com dia, SEM hora, e sem appointment → sem_lastro", () => {
    const a = analisarAfirmacaoDeVisita(SANDRA, HOJE)
    expect(a.afirma).toBe(true)
    expect(a.dia).toEqual({ y: 2026, m: 7, d: 8 })
    expect(a.hora).toBeNull()

    const c = classificarResumo({ analise: a, appointmentsDoLead: [], now: HOJE })
    expect(c.veredicto).toBe("sem_lastro")
    expect(c.diaAfirmado).toBe("2026-08-08")
  })

  it("(ii) Lucimara: a ressalva do próprio texto NÃO absolve — o resumo abre afirmando", () => {
    const a = analisarAfirmacaoDeVisita(LUCIMARA, HOJE)
    expect(a.afirma).toBe(true)
    expect(a.dia).toEqual({ y: 2026, m: 7, d: 8 })
    expect(a.hora).toBeNull()

    const c = classificarResumo({ analise: a, appointmentsDoLead: [], now: HOJE })
    expect(c.veredicto).toBe("sem_lastro")
  })

  it("(ii-b) e o mesmo vale para o resumo INTEIRO dela, como está no banco", () => {
    // O parágrafo completo tem 5 frases, duas delas falando de agendamento — e a
    // última ("aguardar confirmação … para finalizar agendamento da visita") NÃO
    // é afirmação. O guarda tem de pegar a abertura, que é a que volta ao
    // contexto pelo `loader.ts`.
    const a = analisarAfirmacaoDeVisita(LUCIMARA_RESUMO_COMPLETO, HOJE)
    expect(a.afirma).toBe(true)
    expect(a.dia).toEqual({ y: 2026, m: 7, d: 8 })
    expect(a.citacao).toContain("Marcou visita ao decorado")

    expect(classificarResumo({ analise: a, appointmentsDoLead: [], now: HOJE }).veredicto).toBe("sem_lastro")
  })

  it("🔴 O VERMELHO: `detectAffirmedSlot` é CEGA nas duas — exige dia E hora", () => {
    // `visit-slot.ts:472-473` → `if (!said.day || !said.time) return null`.
    // Um guarda construído sobre ela devolveria "nada afirmado" nos DOIS casos
    // que originaram a story — que é por que a regra mora no módulo novo e a
    // `visit-slot.ts` fica INTOCADA (AC7).
    expect(detectAffirmedSlot({ assistantMessage: SANDRA, now: HOJE })).toBeNull()
    expect(detectAffirmedSlot({ assistantMessage: LUCIMARA, now: HOJE })).toBeNull()
    expect(detectAffirmedSlot({ assistantMessage: LUCIMARA_RESUMO_COMPLETO, now: HOJE })).toBeNull()
  })

  it("com appointment no dia afirmado, as mesmas frases passam a com_lastro", () => {
    // Sem esta asserção o teste acima passaria com um detector que devolve
    // `sem_lastro` para tudo.
    const sabado = [appt("2026-08-08T13:00:00Z")]
    for (const frase of [SANDRA, LUCIMARA]) {
      const a = analisarAfirmacaoDeVisita(frase, HOJE)
      expect(classificarResumo({ analise: a, appointmentsDoLead: sabado, now: HOJE }).veredicto).toBe(
        "com_lastro"
      )
    }
  })
})

describe("Os falsos positivos que o @po leu um a um em produção", () => {
  it("negação ANTES do verbo não é afirmação — Orlice, 05/08", () => {
    const a = analisarAfirmacaoDeVisita("Lead ainda não confirmou visita ao decorado", HOJE)
    expect(a.afirma).toBe(false)
    expect(classificarResumo({ analise: a, appointmentsDoLead: [], now: HOJE }).veredicto).toBe(
      "sem_afirmacao"
    )
  })

  it("audiência agendada na justiça não é visita — lead sem nome, 02/07", () => {
    const a = analisarAfirmacaoDeVisita(
      "O lead possui uma audiência agendada na justiça contra a empresa.",
      HOJE
    )
    expect(a.afirma).toBe(false)
  })

  it("plano não é fato: 'Próximo passo: agendar visita ao decorado' não afirma", () => {
    expect(analisarAfirmacaoDeVisita("Próximo passo: agendar visita ao decorado.", HOJE).afirma).toBe(
      false
    )
  })

  it("resumo sem uma palavra sobre agenda é sem_afirmacao — e GRAVA", () => {
    const a = analisarAfirmacaoDeVisita(
      "Ana busca 2 suítes no Vind, andar alto, vista frente. Sem objeções.",
      HOJE
    )
    expect(a.afirma).toBe(false)
    expect(classificarResumo({ analise: a, appointmentsDoLead: [], now: HOJE }).veredicto).toBe(
      "sem_afirmacao"
    )
  })
})

describe("🔴 F1 — a data vencida que `parseDayParts` rola para o futuro (achado do gate)", () => {
  /**
   * Nenhuma fixture anterior alcançava isto: todas afirmam um dia `>= now`, e o
   * rolo da `parseDayParts` só acontece com data JÁ VENCIDA. O guarda bloqueava
   * resumo CORRETO — e como o cron reescreve a cada 30 min, todo lead com visita
   * de verdade ficaria congelado no texto vencido que a AC11 existe para matar.
   */
  const MARLENE =
    "Marlene é um lead que agendou uma visita a um imóvel para segunda-feira, 3 de agosto às 16h."
  const APPT_MARLENE = appt("2026-08-03T19:00:00Z") // 03/08/2026 16:00 BRT — REAL

  it("🔴 Marlene (literal de produção): visita REAL em 03/08 → com_lastro, não sem_lastro", () => {
    const a = analisarAfirmacaoDeVisita(MARLENE, HOJE)
    // O parser resolve para 2027 — e é por isso que o módulo não pode confiar
    // num único dia absoluto.
    expect(a.dia).toEqual({ y: 2027, m: 7, d: 3 })

    const c = classificarResumo({ analise: a, appointmentsDoLead: [APPT_MARLENE], now: HOJE })
    expect(c.veredicto).toBe("com_lastro")
    // E o evento publica a data que CASOU, não a de 2027 do parser.
    expect(c.diaAfirmado).toBe("2026-08-03")
    expect(c.divergenciaMin).toBe(0)
  })

  it("🔴 o bloco da CAMADA 1 desta story sobrevive ao dia seguinte (o ano escrito manda)", () => {
    // `renderFatoDeAgenda` ensina o modelo a escrever a data com ano. No dia da
    // visita casava; no dia seguinte a `parseDayParts` rolava para 2027 e o
    // resumo daquele lead ficava bloqueado PARA SEMPRE.
    const texto = "Marlene possui visita agendada para sábado, 15 de agosto de 2026 às 10:00."
    const visita = appt("2026-08-15T13:00:00Z")

    for (const now of [new Date("2026-08-15T11:00:00Z"), new Date("2026-08-16T13:00:00Z"), new Date("2026-09-30T13:00:00Z")]) {
      const a = analisarAfirmacaoDeVisita(texto, now)
      expect(a.anoExplicito, `ano escrito não foi lido em ${now.toISOString()}`).toBe(2026)
      expect(
        classificarResumo({ analise: a, appointmentsDoLead: [visita], now }).veredicto,
        `travou em ${now.toISOString()}`
      ).toBe("com_lastro")
    }
  })

  it("o ano ESCRITO é autoridade — e por isso não abre back-off nenhum", () => {
    // Se o texto diz 2026 e o appointment é de 2025, é sem_lastro mesmo com o
    // dia e a hora batendo. Sem isto o conserto do F1 viraria um "casa quase
    // sempre", que é o outro jeito de o guarda parar de guardar.
    const texto = "Possui visita agendada para 15 de agosto de 2026 às 10:00."
    const a = analisarAfirmacaoDeVisita(texto, HOJE)
    expect(candidatosDeDia(a)).toEqual([{ y: 2026, m: 7, d: 15 }])
    expect(
      classificarResumo({ analise: a, appointmentsDoLead: [appt("2025-08-15T13:00:00Z")], now: HOJE }).veredicto
    ).toBe("sem_lastro")
  })

  it("cada candidato corresponde a UM ramo de rolo da `parseDay` — nem mais, nem menos", () => {
    const a = analisarAfirmacaoDeVisita("Possui visita agendada para 3 de agosto às 16h.", HOJE)
    expect(candidatosDeDia(a)).toEqual([
      { y: 2027, m: 7, d: 3 }, // literal
      { y: 2026, m: 7, d: 3 }, // −1 ano  ← ramo "N de <mês>"
      { y: 2027, m: 6, d: 3 }, // −1 mês  ← ramo "dia N"
      { y: 2027, m: 6, d: 27 }, // −7 dias ← ramo do dia da semana
    ])
  })

  it("o back-off NÃO absolve a Sandra nem a Lucimara — elas têm ZERO appointments", () => {
    // O conserto do F1 alarga o casamento; esta é a asserção que impede o
    // alargamento de engolir a razão de ser da story.
    for (const frase of [SANDRA, LUCIMARA]) {
      const a = analisarAfirmacaoDeVisita(frase, HOJE)
      expect(classificarResumo({ analise: a, appointmentsDoLead: [], now: HOJE }).veredicto).toBe(
        "sem_lastro"
      )
    }
  })

  it("e não absolve a divergência de HORA — a janela de 30 min continua valendo (caso Miriam)", () => {
    // Produção: o resumo diz "8 de julho às 10h"; o appointment real é 11h.
    // Mesmo com o candidato de ano certo, 60 min > 30 min ⇒ sem_lastro.
    const a = analisarAfirmacaoDeVisita("Visita agendada para quarta-feira 8 de julho às 10h no stand.", new Date("2026-07-31T14:30:00Z"))
    const c = classificarResumo({
      analise: a,
      appointmentsDoLead: [appt("2026-07-08T14:00:00Z")], // 11:00 BRT
      now: new Date("2026-07-31T14:30:00Z"),
    })
    expect(c.veredicto).toBe("sem_lastro")
    expect(c.divergenciaMin).toBe(60)
    // `dia_afirmado` e `divergencia_min` descrevem o MESMO candidato.
    expect(c.diaAfirmado).toBe("2026-07-08")
  })
})

describe("🔴 A regra da negação — a prova que faltava (achado do gate)", () => {
  // O gate mediu `M-NEG` = 0 vermelhos e estava certo: a frase da Lucimara **não
  // tem token de negação nenhum**. O que a separava da Orlice era o "não" da
  // Orlice, não a POSIÇÃO dele. A regra de posição estava aprovada mas não
  // provada — esta fixture é o par que a prova.
  const ANTES = "Lead ainda não confirmou visita ao decorado."
  const DEPOIS = "Marcou visita ao decorado para o dia 8, mas não confirmou o horário ainda."

  it("negação ANTES do verbo → não é afirmação", () => {
    expect(analisarAfirmacaoDeVisita(ANTES, HOJE).afirma).toBe(false)
  })

  it("🔴 a MESMA negação DEPOIS do verbo → continua sendo afirmação, e bloqueia", () => {
    // Sob uma regra de "negação em qualquer lugar da frase", este caso seria
    // absolvido — e é o formato exato do resumo da Lucimara.
    const a = analisarAfirmacaoDeVisita(DEPOIS, HOJE)
    expect(a.afirma).toBe(true)
    expect(a.dia).toEqual({ y: 2026, m: 7, d: 8 })
    expect(classificarResumo({ analise: a, appointmentsDoLead: [], now: HOJE }).veredicto).toBe(
      "sem_lastro"
    )
  })
})

describe("AC3 — o resumo COM lastro continua sendo gravado", () => {
  it("appointment a ±10 min do afirmado → com_lastro, sem bloqueio", () => {
    const texto = "Marlene confirmou visita para sábado, dia 8, às 16h."
    const a = analisarAfirmacaoDeVisita(texto, HOJE)
    expect(a.hora).toEqual({ hour: 16, minute: 0 })

    // 16h BRT = 19:00 UTC. O appointment está 10 min depois.
    const c = classificarResumo({
      analise: a,
      appointmentsDoLead: [appt("2026-08-08T19:10:00Z")],
      now: HOJE,
    })
    expect(c.veredicto).toBe("com_lastro")
    expect(c.divergenciaMin).toBe(10)
  })

  it("mas a mesma frase com o appointment a 60 min NÃO tem lastro (janela de 30 min da 87-3)", () => {
    // O par é o que discrimina: sem ele, um `com_lastro` para tudo passaria.
    const a = analisarAfirmacaoDeVisita("Marlene confirmou visita para sábado, dia 8, às 16h.", HOJE)
    const c = classificarResumo({
      analise: a,
      appointmentsDoLead: [appt("2026-08-08T20:00:00Z")],
      now: HOJE,
    })
    expect(c.veredicto).toBe("sem_lastro")
    expect(c.divergenciaMin).toBe(60)
  })

  it("cancelled e no_show CONTAM como lastro — a doutrina da 87-3 vale inteira", () => {
    const a = analisarAfirmacaoDeVisita(SANDRA, HOJE)
    const c = classificarResumo({
      analise: a,
      appointmentsDoLead: [appt("2026-08-08T13:00:00Z", "cancelled")],
      now: HOJE,
    })
    expect(c.veredicto).toBe("com_lastro")
  })
})

describe("AC4 — o resumo VENCIDO é barrado (a fixture dos 12)", () => {
  // Fixture literal do resumo da Edicleia, produção, 07/08.
  const EDICLEIA = "Edicleia é uma lead que já possui visita agendada para amanhã (sexta-feira às 15h)."

  it("🔴 com o único appointment TRÊS SEMANAS atrás → sem_lastro", () => {
    // "amanhã" resolve para amanhã (a âncora é a ESCRITA); o appointment é de
    // três semanas atrás e não casa em dia nenhum.
    const a = analisarAfirmacaoDeVisita(EDICLEIA, HOJE)
    expect(a.dia).toEqual({ y: 2026, m: 7, d: 9 })
    expect(a.hora).toEqual({ hour: 15, minute: 0 })

    const c = classificarResumo({
      analise: a,
      appointmentsDoLead: [appt("2026-07-18T18:00:00Z")],
      now: HOJE,
    })
    expect(c.veredicto).toBe("sem_lastro")
  })

  it("e com o appointment REALMENTE amanhã às 15h → com_lastro", () => {
    // O par no MESMO teste-alvo: uma fixture sozinha passa verde sob mutação.
    const a = analisarAfirmacaoDeVisita(EDICLEIA, HOJE)
    const c = classificarResumo({
      analise: a,
      appointmentsDoLead: [appt("2026-08-09T18:00:00Z")], // 15h BRT de 09/08
      now: HOJE,
    })
    expect(c.veredicto).toBe("com_lastro")
    expect(c.divergenciaMin).toBe(0)
  })
})

describe("indeterminado — fail-open declarado", () => {
  it("afirma visita SEM dia nenhum → indeterminado (e GRAVA)", () => {
    const a = analisarAfirmacaoDeVisita("O lead já possui visita agendada no stand.", HOJE)
    expect(a.afirma).toBe(true)
    expect(a.dia).toBeNull()
    expect(classificarResumo({ analise: a, appointmentsDoLead: [], now: HOJE }).veredicto).toBe(
      "indeterminado"
    )
  })
})

describe("AC5 / AC11-(i) — o fato de agenda vem do banco, com data absoluta", () => {
  it("visita FUTURA → data absoluta por extenso", () => {
    const bloco = renderFatoDeAgenda([appt("2026-08-15T13:00:00Z")], HOJE)
    expect(bloco).toContain("VISITA CONFIRMADA para sábado, 15 de agosto de 2026 às 10:00.")
    expect(bloco).toContain("appointments")
  })

  it("🔴 appointment no PASSADO NUNCA vira fato em tempo presente (AC11-i)", () => {
    // É a classe de erro nova: 12 de 12 resumos de produção afirmam, em tempo
    // presente, uma visita que já aconteceu. A `M5` do epic responde "sim, existe
    // appointment" para todos os 12 — é uma métrica que não consegue ficar
    // vermelha aqui.
    const bloco = renderFatoDeAgenda([appt("2026-08-05T13:30:00Z", "completed")], HOJE)
    expect(bloco).toContain("NÃO HÁ VISITA FUTURA AGENDADA. A última visita registrada foi em 05/08/2026.")
    expect(bloco).not.toContain("VISITA CONFIRMADA")
  })

  it("nenhum appointment → o bloco diz isso, e não some", () => {
    expect(renderFatoDeAgenda([], HOJE)).toContain("NÃO HÁ VISITA AGENDADA para este lead.")
  })

  it("visita futura CANCELADA não é anunciada como confirmada", () => {
    const bloco = renderFatoDeAgenda(
      [appt("2026-08-15T13:00:00Z", "cancelled"), appt("2026-08-05T13:30:00Z", "completed", "appt-2")],
      HOJE
    )
    expect(bloco).not.toContain("VISITA CONFIRMADA")
    expect(bloco).toContain("A última visita registrada foi em 05/08/2026.")
  })

  it("a regra de prompt proíbe data relativa, literalmente", () => {
    expect(REGRAS_FATO_DE_AGENDA).toContain("DATA ABSOLUTA")
    expect(REGRAS_FATO_DE_AGENDA).toContain('NUNCA "amanha", "no dia seguinte", "este sabado"')
    expect(REGRAS_FATO_DE_AGENDA).toContain("A unica fonte e o bloco FATO DE AGENDA")
  })
})

describe("AC8 — a citação do evento é curta e sem PII", () => {
  it("trunca em 120 caracteres", () => {
    const longa = `Marcou visita ao decorado ${"x".repeat(300)}`
    expect(citacaoCurta(longa).length).toBe(120)
  })

  it("telefone e e-mail saem", () => {
    const c = citacaoCurta("Marcou visita; contato (44) 99999-8888 e ana@exemplo.com.br")
    expect(c).not.toMatch(/99999/)
    expect(c).not.toContain("ana@exemplo.com.br")
    expect(c).toContain("[telefone]")
    expect(c).toContain("[email]")
  })
})
