import { describe, it, expect } from "vitest"
import {
  calculateQualificationScore,
  getNextQualificationStep,
  extractCollectedData,
  extractVisitConfirmation,
} from "./qualification"
import type { AgendaState } from "./agenda-state"

// Story 87-4 — âncora fixa: 2026-06-18T17:00:00Z = quinta-feira 14:00 BRT.
// Sem `now` fixo, "sábado" resolveria uma data diferente a cada dia em que a
// suíte rodasse — que é literalmente o defeito que esta story fecha.
const NOW_QUALIF = new Date("2026-06-18T17:00:00Z")
const LEAD = { origem: "lead" as const, now: NOW_QUALIF }

describe("calculateQualificationScore", () => {
  it("returns 0 for empty data", () => {
    expect(calculateQualificationScore({})).toBe(0)
  })

  it("returns 0 for null/undefined/empty string values", () => {
    expect(
      calculateQualificationScore({
        name: null,
        property_interest: undefined,
        bedrooms: "",
      })
    ).toBe(0)
  })

  it("returns correct partial score for a few fields", () => {
    // name=10 + property_interest=15 = 25
    expect(
      calculateQualificationScore({
        name: "Joao",
        property_interest: "vind",
      })
    ).toBe(25)
  })

  it("returns correct score for half the fields", () => {
    // Story 75-347 — `visit_availability` caiu de 20 para 10 (aceitar visita
    // deixou de ser o maior peso da régua), então este total caiu de 55 para 45.
    // name=10 + bedrooms=10 + has_down_payment=15 + visit_availability=10 = 45
    expect(
      calculateQualificationScore({
        name: "Maria",
        bedrooms: 3,
        has_down_payment: true,
        visit_availability: true,
      })
    ).toBe(45)
  })

  it("returns 100 for all fields filled", () => {
    expect(
      calculateQualificationScore({
        name: "Carlos",
        // Story 75-347 — a finalidade entrou na régua: sem ela, "todos os campos"
        // não são todos, e o total não fecha 100.
        finalidade: "moradia",
        property_interest: "yarden",
        bedrooms: 2,
        floor: "alto",
        view: "frente",
        garages: 1,
        has_down_payment: true,
        source: "instagram",
        visit_availability: true,
      })
    ).toBe(100)
  })

  it("caps at 100 even with extra fields", () => {
    expect(
      calculateQualificationScore({
        name: "Carlos",
        // Story 75-347 — a finalidade entrou na régua: sem ela, "todos os campos"
        // não são todos, e o total não fecha 100.
        finalidade: "moradia",
        property_interest: "yarden",
        bedrooms: 2,
        floor: "alto",
        view: "frente",
        garages: 1,
        has_down_payment: true,
        source: "instagram",
        visit_availability: true,
        extra_field: "something",
      })
    ).toBe(100)
  })

  it("counts has_down_payment=false as present (non-null, non-undefined, non-empty)", () => {
    // has_down_payment=false is a valid value (not undefined/null/"")
    expect(calculateQualificationScore({ has_down_payment: false })).toBe(15)
  })

  it("counts numeric zero as present", () => {
    // 0 is not undefined/null/""
    expect(calculateQualificationScore({ bedrooms: 0 })).toBe(10)
  })
})

describe("getNextQualificationStep", () => {
  it("returns 'name' as first step when data is empty", () => {
    expect(getNextQualificationStep({})).toBe("name")
  })

  it("returns 'finalidade' after name is collected", () => {
    // Story 75-347 — a finalidade (moradia × investimento) vem antes da ficha
    // técnica: é ela que define o ângulo da conversa inteira.
    expect(getNextQualificationStep({ name: "Ana" })).toBe("finalidade")
    expect(getNextQualificationStep({ name: "Ana", finalidade: "moradia" })).toBe("property_interest")
  })

  it("skips to first missing step", () => {
    expect(
      getNextQualificationStep({
        name: "Ana",
        finalidade: "investimento",
        property_interest: "vind",
        bedrooms: 2,
      })
    ).toBe("floor")
  })

  it("returns 'complete' when all steps are filled", () => {
    expect(
      getNextQualificationStep({
        name: "Carlos",
        // Story 75-347 — a finalidade entrou na régua: sem ela, "todos os campos"
        // não são todos, e o total não fecha 100.
        finalidade: "moradia",
        property_interest: "yarden",
        bedrooms: 2,
        floor: "alto",
        view: "frente",
        garages: 1,
        has_down_payment: true,
        source: "instagram",
        visit_availability: true,
      })
    ).toBe("complete")
  })

  it("treats null as missing", () => {
    expect(getNextQualificationStep({ name: null })).toBe("name")
  })

  it("treats empty string as missing", () => {
    expect(getNextQualificationStep({ name: "" })).toBe("name")
  })

  it("follows correct step order", () => {
    const steps = [
      "name",
      "finalidade",
      "property_interest",
      "bedrooms",
      "floor",
      "view",
      "garages",
      "has_down_payment",
      "source",
      "visit_availability",
    ]
    const data: Record<string, unknown> = {}
    for (const step of steps) {
      expect(getNextQualificationStep(data)).toBe(step)
      data[step] = "filled"
    }
    expect(getNextQualificationStep(data)).toBe("complete")
  })
})

describe("extractCollectedData", () => {
  it("extracts name from 'Prazer, Maria' pattern", () => {
    const result = extractCollectedData("Prazer, Maria Silva!", {})
    expect(result.name).toBe("Maria Silva")
  })

  it("extracts name from 'Olá, João' pattern", () => {
    const result = extractCollectedData("Olá, João!", {})
    expect(result.name).toBe("João")
  })

  it("extracts name from 'Certo, Carlos' pattern", () => {
    const result = extractCollectedData("Certo, Carlos", {})
    expect(result.name).toBe("Carlos")
  })

  it("does not overwrite existing name", () => {
    const result = extractCollectedData("Prazer, Maria!", { name: "Ana" })
    expect(result.name).toBe("Ana")
  })

  // Story 75-161 — nome em minúsculas quando a Nicole acabou de perguntar
  it("captura nome em minúsculas quando nameExpected (caso maicon) e capitaliza", () => {
    const result = extractCollectedData("maicon", {}, { nameExpected: true })
    expect(result.name).toBe("Maicon")
  })

  it("NÃO captura minúsculo sem nameExpected (comportamento antigo)", () => {
    const result = extractCollectedData("maicon", {})
    expect(result.name).toBeUndefined()
  })

  it("nameExpected + resposta que NÃO é nome (stopword) não vira nome", () => {
    expect(extractCollectedData("quero", {}, { nameExpected: true }).name).toBeUndefined()
    expect(extractCollectedData("não sei", {}, { nameExpected: true }).name).toBeUndefined()
    expect(extractCollectedData("apartamento", {}, { nameExpected: true }).name).toBeUndefined()
  })

  it("captura nome composto em minúsculas quando nameExpected", () => {
    const result = extractCollectedData("joao pedro", {}, { nameExpected: true })
    expect(result.name).toBe("Joao Pedro")
  })

  it("stopword capitalizada também não vira nome", () => {
    expect(extractCollectedData("Sim", {}).name).toBeUndefined()
  })

  it("extracts property interest 'vind'", () => {
    const result = extractCollectedData("Gostaria de saber mais sobre o Vind", {})
    expect(result.property_interest).toBe("vind")
  })

  it("extracts property interest 'yarden'", () => {
    const result = extractCollectedData("Quero conhecer o Yarden", {})
    expect(result.property_interest).toBe("yarden")
  })

  it("does not extract property when both vind and yarden mentioned", () => {
    const result = extractCollectedData("O Yarden é diferente do Vind porque tem rooftop", {})
    expect(result.property_interest).toBeUndefined()
  })

  it("extracts bedrooms from '3 quartos'", () => {
    const result = extractCollectedData("Busco 3 quartos", {})
    expect(result.bedrooms).toBe(3)
  })

  it("extracts bedrooms from '2 suítes'", () => {
    const result = extractCollectedData("Preciso de 2 suítes", {})
    expect(result.bedrooms).toBe(2)
  })

  it("extracts floor preference 'alto'", () => {
    const result = extractCollectedData("Prefiro andar alto", {})
    expect(result.floor).toBe("alto")
  })

  it("extracts floor preference 'baixo'", () => {
    const result = extractCollectedData("Prefiro andar baixo", {})
    expect(result.floor).toBe("baixo")
  })

  it("extracts view 'frente'", () => {
    const result = extractCollectedData("Quero vista frontal", {})
    expect(result.view).toBe("frente")
  })

  it("extracts view 'fundos'", () => {
    const result = extractCollectedData("Vista de fundos", {})
    expect(result.view).toBe("fundos")
  })

  it("extracts garage count", () => {
    const result = extractCollectedData("Preciso de 2 vagas", {})
    expect(result.garages).toBe(2)
  })

  it("extracts has_down_payment=true", () => {
    const result = extractCollectedData("Tenho entrada disponível", {})
    expect(result.has_down_payment).toBe(true)
  })

  it("extracts has_down_payment=false", () => {
    const result = extractCollectedData("Estou sem entrada no momento", {})
    expect(result.has_down_payment).toBe(false)
  })

  it("extracts source 'instagram' as meta_ads enum", () => {
    const result = extractCollectedData("Vi pelo instagram", {})
    expect(result.source).toBe("meta_ads")
  })

  it("extracts source 'indicacao' as referral enum", () => {
    const result = extractCollectedData("Recebi uma indicação de amigo", {})
    expect(result.source).toBe("referral")
  })

  it("extracts source 'google' as website enum", () => {
    const result = extractCollectedData("Achei no google", {})
    expect(result.source).toBe("website")
  })

  it("extracts source 'placa' as walk_in enum", () => {
    const result = extractCollectedData("Vi a placa na frente da obra", {})
    expect(result.source).toBe("walk_in")
  })

  // AC5: Email extraction
  it("extracts email from message", () => {
    const result = extractCollectedData("Meu email é joao@gmail.com", {})
    expect(result.email).toBe("joao@gmail.com")
  })

  it("does not overwrite existing email", () => {
    const result = extractCollectedData("email: outro@test.com", { email: "primeiro@test.com" })
    expect(result.email).toBe("primeiro@test.com")
  })

  // AC6: Expanded name patterns
  it("extracts name from 'pode me chamar de X'", () => {
    const result = extractCollectedData("Pode me chamar de Ricardo", {})
    expect(result.name).toBe("Ricardo")
  })

  it("extracts name from 'me chamam de X'", () => {
    const result = extractCollectedData("Me chamam de Ana", {})
    expect(result.name).toBe("Ana")
  })

  it("extracts name from short message (1-3 words)", () => {
    const result = extractCollectedData("João Silva", {})
    expect(result.name).toBe("João Silva")
  })

  it("does not extract short lowercase as name", () => {
    const result = extractCollectedData("bom dia", {})
    expect(result.name).toBeUndefined()
  })

  // AC7: Expanded floor patterns
  it("extracts floor 'alto' from 'lá em cima'", () => {
    const result = extractCollectedData("Quero lá em cima", {})
    expect(result.floor).toBe("alto")
  })

  it("extracts floor 'baixo' from 'térreo'", () => {
    const result = extractCollectedData("Prefiro térreo", {})
    expect(result.floor).toBe("baixo")
  })

  it("extracts floor 'medio' from 'andar do meio'", () => {
    const result = extractCollectedData("Quero andar do meio", {})
    expect(result.floor).toBe("medio")
  })

  // AC8: Expanded down payment patterns
  it("extracts has_down_payment=true from 'tenho entrada'", () => {
    const result = extractCollectedData("Tenho entrada sim", {})
    expect(result.has_down_payment).toBe(true)
  })

  it("extracts has_down_payment=true from 'fgts'", () => {
    const result = extractCollectedData("Posso usar o FGTS", {})
    expect(result.has_down_payment).toBe(true)
  })

  it("extracts has_down_payment=false from 'financiar tudo'", () => {
    const result = extractCollectedData("Preciso financiar tudo", {})
    expect(result.has_down_payment).toBe(false)
  })

  // AC9: Portuguese spelled-out numbers
  it("extracts bedrooms from 'dois quartos' (spelled out)", () => {
    const result = extractCollectedData("Quero dois quartos", {})
    expect(result.bedrooms).toBe(2)
  })

  it("extracts garages from 'duas vagas' (spelled out)", () => {
    const result = extractCollectedData("Preciso de duas vagas", {})
    expect(result.garages).toBe(2)
  })

  it("extracts bedrooms from 'três suítes' (spelled out)", () => {
    const result = extractCollectedData("Quero três suítes", {})
    expect(result.bedrooms).toBe(3)
  })

  // Story 87-4 — a disponibilidade deixou de ser a STRING crua em
  // `visit_availability` e passou a ser o `agenda_state`, com o dia JÁ resolvido
  // contra o instante da escrita, a citação literal e a validade. O GATILHO é o
  // mesmo (mesma lista de palavras, mesma guarda de ambiguidade); o que mudou é
  // o que se grava e QUEM pode gravar (`origem: "lead"`).
  it("extracts visit availability from intent keyword", () => {
    const result = extractCollectedData("Quero visitar o apartamento", {}, LEAD)
    expect(result.agenda_state).toBeTruthy()
    expect((result.agenda_state as AgendaState).origem).toBe("lead")
  })

  it("extracts visit with day/time — e o dia sai ANCORADO, não relativo", () => {
    const result = extractCollectedData("Pode ser esse sábado às 10h", {}, LEAD)
    const st = result.agenda_state as AgendaState
    expect(st.citacao).toContain("sábado")
    // NOW_QUALIF é quinta 18/06/2026 → o próximo sábado é 20/06.
    expect(st.data_absoluta).toBe("2026-06-20")
    expect(st.hora).toBe(10)
    expect(st.ancorado_em).toBe(NOW_QUALIF.toISOString())
  })

  it("does NOT extract visit from time-only mention", () => {
    const result = extractCollectedData("Pode ser às 10h", {}, LEAD)
    expect(result.agenda_state).toBeUndefined()
  })

  it("does NOT extract visit from 'de manhã' alone", () => {
    const result = extractCollectedData("Prefiro de manhã", {}, LEAD)
    expect(result.agenda_state).toBeUndefined()
  })

  // Story 87-4 / AC2 — a metade que faltava: sem `origem: "lead"` declarada,
  // NENHUM fato de agenda é escrito. Fail-closed.
  it("🔴 87-4 — sem origem declarada, nada de agenda é gravado", () => {
    const result = extractCollectedData("Pode ser esse sábado às 10h", {})
    expect(result.agenda_state).toBeUndefined()
    expect(result.visit_availability).toBeUndefined()
  })

  it("🔴 87-4 — a fala da NICOLE (origem assistant) não vira disponibilidade", () => {
    // O texto real do `visit_availability` do lead Nilson, em produção: é a
    // pergunta DELA, gravada como se fosse a resposta dele.
    const falaDaNicole =
      "Que tal agendar uma visita? Qual o melhor dia pra você, durante a semana ou sábado de manhã?"
    const result = extractCollectedData(falaDaNicole, {}, { origem: "assistant", now: NOW_QUALIF })
    expect(result.agenda_state).toBeUndefined()
    expect(result.visit_availability).toBeUndefined()
  })

  // Story 75-245 AC2 — esta função também roda sobre a resposta da NICOLE
  // (pipeline.ts). A frase de horário de atendimento dela citava "sábado" e era
  // gravada inteira como "disponibilidade do cliente" — no turno seguinte o
  // parser tirava dali "segunda" + "meio-dia" e agendava sozinho.
  it("NÃO grava frase de horário de atendimento como disponibilidade", () => {
    const result = extractCollectedData(
      "Qual o melhor dia pra você vir? Atendemos de segunda a sexta das 8h às 18h e sábado das 8h ao meio-dia.",
      {},
      LEAD
    )
    expect(result.agenda_state).toBeUndefined()
  })

  it("NÃO grava oferta de opções da Nicole como disponibilidade", () => {
    const result = extractCollectedData("Prefere sábado ou segunda?", {}, LEAD)
    expect(result.agenda_state).toBeUndefined()
  })

  it("continua gravando disponibilidade real do cliente (slot único)", () => {
    const result = extractCollectedData("Pode ser sábado às 10h", {}, LEAD)
    expect((result.agenda_state as AgendaState).citacao).toContain("sábado")
  })

  it("extracts visit from day keyword 'amanhã'", () => {
    const result = extractCollectedData("Posso amanhã de manhã", {}, LEAD)
    const st = result.agenda_state as AgendaState
    expect(st.data_absoluta).toBe("2026-06-19")
    expect(st.periodo).toBe("manha")
  })

  it("preserves existing data and merges new extractions", () => {
    const current = { name: "Ana", bedrooms: 2 }
    const result = extractCollectedData("Prefiro andar alto com vista frontal", current)
    expect(result.name).toBe("Ana")
    expect(result.bedrooms).toBe(2)
    expect(result.floor).toBe("alto")
    expect(result.view).toBe("frente")
  })

  it("returns unchanged data when nothing matches", () => {
    const current = { name: "Ana" }
    const result = extractCollectedData("Bom dia!", current)
    expect(result).toEqual({ name: "Ana" })
  })
})

// Story 61-1 — extractVisitConfirmation
describe("extractVisitConfirmation", () => {
  // Positive confirmations — should return the message
  it("returns message when client says 'sim, pode marcar pra sábado'", () => {
    expect(extractVisitConfirmation("sim, pode marcar pra sábado")).not.toBeNull()
  })

  it("returns message when client says 'pode ser sexta-feira'", () => {
    expect(extractVisitConfirmation("pode ser sexta-feira")).not.toBeNull()
  })

  it("returns message when client says 'vou na sexta'", () => {
    expect(extractVisitConfirmation("vou na sexta")).not.toBeNull()
  })

  it("returns message when client says 'quero ir sábado às 10h'", () => {
    expect(extractVisitConfirmation("quero ir sábado às 10h")).not.toBeNull()
  })

  it("returns message when client confirms with 'claro, pode marcar pra semana que vem'", () => {
    expect(extractVisitConfirmation("claro, pode marcar pra semana que vem")).not.toBeNull()
  })

  it("returns message when client says 'pode agendar pra sexta-feira'", () => {
    expect(extractVisitConfirmation("pode agendar pra sexta-feira")).not.toBeNull()
  })

  // Refusals — should return null
  it("returns null when client says 'não posso sábado'", () => {
    expect(extractVisitConfirmation("não posso sábado")).toBeNull()
  })

  it("returns null when client says 'talvez sábado'", () => {
    expect(extractVisitConfirmation("talvez sábado")).toBeNull()
  })

  it("returns null when client says 'não sei ainda'", () => {
    expect(extractVisitConfirmation("não sei ainda")).toBeNull()
  })

  it("returns null when client says 'nao consigo segunda'", () => {
    expect(extractVisitConfirmation("nao consigo segunda-feira")).toBeNull()
  })

  // Day without positive signal — should return null (Story 61-1 AC7)
  it("returns null for 'sábado' alone (no positive signal)", () => {
    expect(extractVisitConfirmation("sábado")).toBeNull()
  })

  it("returns null for 'semana que vem fico mais livre' (no positive signal)", () => {
    expect(extractVisitConfirmation("semana que vem fico mais livre")).toBeNull()
  })

  it("returns null for message without any day reference", () => {
    expect(extractVisitConfirmation("sim, quero ir")).toBeNull()
  })

  it("returns null for empty message", () => {
    expect(extractVisitConfirmation("")).toBeNull()
  })
})
