import { describe, it, expect } from "vitest"
import {
  hasConfirmedDay,
  resolveOffHoursResponse,
  buildNoReintroContext,
  mediaContextLine,
  resolvePropertyInterestWrite,
  detectSlotMismatch,
  detectAffirmedSlot,
  stripSystemBlocks,
  isVisitSchedulingMode,
} from "./pipeline"
import { OFF_HOURS_PROMPT } from "../prompts"

describe("hasConfirmedDay", () => {
  // Day names — should return true
  it("matches sábado", () => {
    expect(hasConfirmedDay("sábado às 10h")).toBe(true)
  })

  it("matches sabado (no accent)", () => {
    expect(hasConfirmedDay("pode ser sabado")).toBe(true)
  })

  it("matches segunda-feira", () => {
    expect(hasConfirmedDay("segunda-feira que vem")).toBe(true)
  })

  it("matches amanhã", () => {
    expect(hasConfirmedDay("posso amanhã de manhã")).toBe(true)
  })

  it("matches hoje", () => {
    expect(hasConfirmedDay("posso hoje à tarde")).toBe(true)
  })

  it("matches date format dd/mm", () => {
    expect(hasConfirmedDay("dia 15/04 funciona")).toBe(true)
  })

  it("matches semana que vem", () => {
    expect(hasConfirmedDay("semana que vem tá bom")).toBe(true)
  })

  it("matches próxima semana", () => {
    expect(hasConfirmedDay("próxima semana")).toBe(true)
  })

  it("matches próximo sábado", () => {
    expect(hasConfirmedDay("próximo sábado")).toBe(true)
  })

  // Intent phrases — should return true
  it("matches quero visitar", () => {
    expect(hasConfirmedDay("quero visitar o apartamento")).toBe(true)
  })

  it("matches posso ir", () => {
    expect(hasConfirmedDay("posso ir ver")).toBe(true)
  })

  it("matches vou aí", () => {
    expect(hasConfirmedDay("vou aí amanhã")).toBe(true)
  })

  // Time-only — should return false
  it("rejects time-only '10h'", () => {
    expect(hasConfirmedDay("pode ser às 10h")).toBe(false)
  })

  it("rejects time-only 'de manhã'", () => {
    expect(hasConfirmedDay("prefiro de manhã")).toBe(false)
  })

  it("rejects time-only 'à tarde'", () => {
    expect(hasConfirmedDay("melhor à tarde")).toBe(false)
  })

  // False positive guards — should return false
  it("rejects 'segunda opção' (not segunda-feira)", () => {
    expect(hasConfirmedDay("gostaria da segunda opção de planta")).toBe(false)
  })

  it("rejects 'próximo passo' (not próxima semana)", () => {
    expect(hasConfirmedDay("qual o próximo passo?")).toBe(false)
  })

  // Edge cases
  it("returns false for null", () => {
    expect(hasConfirmedDay(null)).toBe(false)
  })

  it("returns false for empty string", () => {
    expect(hasConfirmedDay("")).toBe(false)
  })

  it("returns false for number", () => {
    expect(hasConfirmedDay(123)).toBe(false)
  })
})

describe("resolveOffHoursResponse — off-hours message (Story 53-1)", () => {
  it("uses the DB out_of_hours_message when it is filled", () => {
    const custom = "Estamos fechados, mas deixe seu recado que retornamos amanhã!"
    expect(resolveOffHoursResponse({ out_of_hours_message: custom })).toBe(custom)
  })

  it("falls back to OFF_HOURS_PROMPT when out_of_hours_message is null", () => {
    expect(resolveOffHoursResponse({ out_of_hours_message: null })).toBe(OFF_HOURS_PROMPT)
  })

  it("falls back to OFF_HOURS_PROMPT when out_of_hours_message is undefined", () => {
    expect(resolveOffHoursResponse({})).toBe(OFF_HOURS_PROMPT)
  })

  it("falls back to OFF_HOURS_PROMPT when out_of_hours_message is empty/whitespace", () => {
    expect(resolveOffHoursResponse({ out_of_hours_message: "   " })).toBe(OFF_HOURS_PROMPT)
  })

  it("trims the DB value before returning", () => {
    expect(resolveOffHoursResponse({ out_of_hours_message: "  Olá!  " })).toBe("Olá!")
  })
})

// Story 59-1 — buildNoReintroContext
describe("buildNoReintroContext", () => {
  it("returns instruction when history has at least one assistant message", () => {
    const history = [
      { role: "user" as const, content: "oi" },
      { role: "assistant" as const, content: "Sou a Nicole..." },
    ]
    const result = buildNoReintroContext(history)
    expect(result).toContain("NAO diga 'Sou a Nicole'")
    expect(result.length).toBeGreaterThan(0)
  })

  it("returns empty string when history has no assistant messages", () => {
    const history = [{ role: "user" as const, content: "oi" }]
    expect(buildNoReintroContext(history)).toBe("")
  })

  it("returns empty string for empty history", () => {
    expect(buildNoReintroContext([])).toBe("")
  })

  it("returns instruction when first message is from assistant", () => {
    const history = [{ role: "assistant" as const, content: "Olá!" }]
    expect(buildNoReintroContext(history)).toContain("JA se apresentou")
  })
})

describe("mediaContextLine (Story 75-157 — fala honesta sobre mídia)", () => {
  it("sem pedido de material → null (nada a instruir)", () => {
    expect(mediaContextLine(undefined)).toBeNull()
    expect(mediaContextLine({ requested: false, willSend: false })).toBeNull()
  })

  it("willSend=true → instrui a comentar o envio", () => {
    const line = mediaContextLine({ requested: true, willSend: true, empreendimento: "Vind Residence" })
    expect(line).toContain("ESTAO SENDO ENVIADAS")
    expect(line).toContain("Vind Residence")
  })

  it("sem empreendimento definido → manda PERGUNTAR, não prometer", () => {
    const line = mediaContextLine({ requested: true, willSend: false, empreendimento: null, reason: "no_property" })
    expect(line).toContain("NAO diga que enviou")
    expect(line?.toLowerCase()).toContain("qual empreendimento")
  })

  it("empreendimento sem material → oferece visita, não promete", () => {
    const line = mediaContextLine({ requested: true, willSend: false, empreendimento: "Yarden", reason: "no_assets" })
    expect(line).toContain("NAO ha esse material disponivel")
    expect(line).toContain("decorado")
  })

  it("tudo já enviado (dedup) → não reenviar/prometer de novo", () => {
    const line = mediaContextLine({ requested: true, willSend: false, empreendimento: "Vind Residence", reason: "none_selected" })
    expect(line).toContain("ja foram enviadas antes")
  })
})

describe("resolvePropertyInterestWrite (Story 75-158 — política confirmada Marcos)", () => {
  const base = { currentPropertyId: null, explicitFromLead: null, contextPropertyId: null, collectedPropertyId: null }

  it("VAZIO + identificação por contexto → preenche (origin conversation_context) — caso Maicon", () => {
    const r = resolvePropertyInterestWrite({ ...base, contextPropertyId: "vind" })
    expect(r).toEqual({ propertyId: "vind", origin: "conversation_context" })
  })

  it("VAZIO + lead cita explicitamente → preenche (origin lead_message, prioridade sobre contexto)", () => {
    const r = resolvePropertyInterestWrite({ ...base, explicitFromLead: "vind", contextPropertyId: "yarden" })
    expect(r).toEqual({ propertyId: "vind", origin: "lead_message" })
  })

  it("VAZIO + só collectedData → preenche (origin collected_data)", () => {
    const r = resolvePropertyInterestWrite({ ...base, collectedPropertyId: "yarden" })
    expect(r).toEqual({ propertyId: "yarden", origin: "collected_data" })
  })

  it("JÁ SETADO + menção incidental por contexto → NÃO sobrescreve (null)", () => {
    const r = resolvePropertyInterestWrite({ currentPropertyId: "yarden", explicitFromLead: null, contextPropertyId: "vind", collectedPropertyId: "vind" })
    expect(r).toBeNull()
  })

  it("JÁ SETADO + lead troca explicitamente → atualiza (origin lead_switch)", () => {
    const r = resolvePropertyInterestWrite({ currentPropertyId: "yarden", explicitFromLead: "vind", contextPropertyId: null, collectedPropertyId: null })
    expect(r).toEqual({ propertyId: "vind", origin: "lead_switch" })
  })

  it("JÁ SETADO + lead reafirma o MESMO → não escreve (null)", () => {
    const r = resolvePropertyInterestWrite({ currentPropertyId: "vind", explicitFromLead: "vind", contextPropertyId: null, collectedPropertyId: null })
    expect(r).toBeNull()
  })

  it("VAZIO e nada identificado → null", () => {
    expect(resolvePropertyInterestWrite(base)).toBeNull()
  })
})

describe("detectSlotMismatch (Story 75-245 AC8 — guarda anti-alucinação)", () => {
  // Âncora: 2026-07-31T01:18:00Z = quinta 30/07 22:18 BRT (o turno do incidente).
  const NOW = new Date("2026-07-31T01:18:00Z")
  // O que o sistema tinha autorizado: segunda 03/08 12:00 BRT.
  const AUTORIZADO = new Date("2026-08-03T15:00:00Z")

  it("pega a alucinação real do incidente: ela afirmou sábado 10h, sistema tinha segunda 12h", () => {
    const said = detectSlotMismatch({
      assistantMessage:
        "Anotado! Sábado, 1º de agosto às 10h.\n\nTe espero na Av. Nildo Ribeiro da Rocha, 1337, Vila Marumby. Até lá, Ailton!",
      authorizedSlotUtc: AUTORIZADO,
      now: NOW,
    })
    expect(said?.toISOString()).toBe("2026-08-01T13:00:00.000Z") // sáb 10h BRT
  })

  it("pega o 'às 9h' inventado quando o cliente só disse 'de manhã'", () => {
    const said = detectSlotMismatch({
      assistantMessage: "Perfeito, Ailton! Agendado para sábado, 1º de agosto, às 9h.",
      authorizedSlotUtc: AUTORIZADO,
      now: NOW,
    })
    expect(said?.toISOString()).toBe("2026-08-01T12:00:00.000Z") // sáb 9h BRT
  })

  it("cala quando a Nicole confirma exatamente o slot autorizado", () => {
    const said = detectSlotMismatch({
      assistantMessage: "Sua visita tá marcada pra segunda-feira, 3 de agosto às 12h, te espero lá!",
      authorizedSlotUtc: AUTORIZADO,
      now: NOW,
    })
    expect(said).toBeNull()
  })

  it("cala quando ela OFERECE opções (texto ambíguo) — sem falso positivo", () => {
    const said = detectSlotMismatch({
      assistantMessage: "Tenho 8h ou 9h livres no sábado, qual prefere?",
      authorizedSlotUtc: AUTORIZADO,
      now: NOW,
    })
    expect(said).toBeNull()
  })

  it("cala quando ela cita o expediente ou não afirma horário nenhum", () => {
    expect(
      detectSlotMismatch({
        assistantMessage: "Atendemos de segunda a sexta das 8h às 18h e sábado das 8h ao meio-dia.",
        authorizedSlotUtc: AUTORIZADO,
        now: NOW,
      })
    ).toBeNull()
    expect(
      detectSlotMismatch({
        assistantMessage: "Claro! Qual horário fica melhor pra você?",
        authorizedSlotUtc: AUTORIZADO,
        now: NOW,
      })
    ).toBeNull()
  })

  it("sem slot autorizado no turno, a guarda não opina", () => {
    expect(
      detectSlotMismatch({
        assistantMessage: "Agendado para sábado às 9h.",
        authorizedSlotUtc: null,
        now: NOW,
      })
    ).toBeNull()
  })
})

describe("isVisitSchedulingMode (Story 75-268 — o gate que ficou fechado)", () => {
  // Falas REAIS da Nicole na conversa da Sueli, 03/08/2026.
  const FALA_SUELI =
    "Que ótimo! Nosso atendimento é de segunda a sexta das 8h às 18h e sábado das 8h às 12h. Qual o melhor dia e período pra você vir, Sueli?"
  const FALA_CONVITE =
    "Que tal agendar uma visita ao decorado? Assim você já conhece o espaço e sai com os números na mão."

  it("🔥 o caso Sueli: sem visit_proposed e sem visit_availability, a fala dela LIGA o modo", () => {
    // Era exatamente esse turno que caía fora do bloco [SISTEMA] — e a Nicole
    // improvisou "sexta à tarde seria após as 18h".
    expect(
      isVisitSchedulingMode({
        visitProposed: false,
        hasVisitAvailability: false,
        hasPendingSlot: false,
        lastAssistantMessage: FALA_SUELI,
      })
    ).toBe(true)
  })

  it("convite a conhecer o decorado também liga", () => {
    expect(isVisitSchedulingMode({ lastAssistantMessage: FALA_CONVITE })).toBe(true)
    expect(
      isVisitSchedulingMode({ lastAssistantMessage: "Que dia ficaria melhor pra você — durante a semana ou no sábado de manhã?" })
    ).toBe(true)
    expect(
      isVisitSchedulingMode({ lastAssistantMessage: "Que horas ficam melhor pra você? Atendemos das 8h às 18h nesses dias." })
    ).toBe(true)
  })

  it("os sinais antigos continuam ligando (nenhuma regressão da 75-162)", () => {
    expect(isVisitSchedulingMode({ visitProposed: true })).toBe(true)
    expect(isVisitSchedulingMode({ hasVisitAvailability: true })).toBe(true)
  })

  it("pendência de dia/hora liga — ela só existe porque nós perguntamos", () => {
    expect(isVisitSchedulingMode({ hasPendingSlot: true })).toBe(true)
  })

  it("conversa que não é de visita segue FORA do modo", () => {
    expect(
      isVisitSchedulingMode({ lastAssistantMessage: "O Vind tem 66,91m² de área privativa, com 2 suítes. Você prefere andar mais alto ou mais baixo?" })
    ).toBe(false)
    expect(
      isVisitSchedulingMode({ lastAssistantMessage: "Os valores variam conforme o andar e a posição do apartamento." })
    ).toBe(false)
    expect(isVisitSchedulingMode({})).toBe(false)
    expect(isVisitSchedulingMode({ lastAssistantMessage: null })).toBe(false)
  })
})

describe("mediaContextLine — a fala não infla o que vai sair (Story 75-270)", () => {
  it("com títulos, instrui a citar EXATAMENTE o que sai", () => {
    const line = mediaContextLine({
      requested: true, willSend: true, empreendimento: "Vind Residence", materiais: ["Localização"],
    })
    expect(line).toContain("EXATAMENTE")
    expect(line).toContain("Localização")
    expect(line).toContain("1 arquivo")
    expect(line).toContain("nao pluralize")
  })
  it("plural correto com mais de um arquivo", () => {
    const line = mediaContextLine({
      requested: true, willSend: true, empreendimento: "Yarden", materiais: ["Planta", "Fachada"],
    })
    expect(line).toContain("Planta, Fachada")
    expect(line).toContain("2 arquivos")
  })
  it("sem a lista, mantém a instrução antiga (compat 75-157)", () => {
    const line = mediaContextLine({ requested: true, willSend: true, empreendimento: "Vind Residence" })
    expect(line).toContain("ESTAO SENDO ENVIADAS")
  })
})

// ---------------------------------------------------------------------------
// Story 75-279 — incidente da lead Maria Oliveira (06/08): a Nicole confirmou
// "sábado às 11h" sem o sistema ter autorizado nada, e vazou o bloco [SISTEMA]
// para a cliente. Ver docs/stories/75-279-*.
// ---------------------------------------------------------------------------
describe("Story 75-279 — detectAffirmedSlot (a guarda que enxerga o pior caso)", () => {
  const NOW = new Date("2026-08-06T13:00:00Z") // quinta, 10h BRT

  it("AC4 — afirmação de dia+hora único é detectada mesmo sem nada autorizado", () => {
    const said = detectAffirmedSlot({
      assistantMessage: "Anotado, Maria! Te espero sábado, dia 8, às 11h aqui na sede.",
      now: NOW,
    })
    expect(said).not.toBeNull()
    expect(said!.toISOString()).toBe("2026-08-08T14:00:00.000Z") // 11h BRT
  })

  it("AC4 — oferta de opções NÃO dispara (senão o log vira ruído)", () => {
    expect(
      detectAffirmedSlot({ assistantMessage: "Tenho 8h ou 11h no sábado, qual prefere?", now: NOW })
    ).toBeNull()
  })

  it("AC4 — frase de expediente NÃO dispara", () => {
    expect(
      detectAffirmedSlot({
        assistantMessage: "Atendemos de segunda a sexta das 8h às 18h e sábado das 8h às 12h.",
        now: NOW,
      })
    ).toBeNull()
  })

  it("AC4 — pergunta sem horário afirmado NÃO dispara", () => {
    expect(
      detectAffirmedSlot({ assistantMessage: "Qual horário fica melhor pra você?", now: NOW })
    ).toBeNull()
  })

  it("a detectSlotMismatch continua com o comportamento da 75-245", () => {
    const autorizado = new Date("2026-08-08T14:00:00.000Z") // sábado 11h BRT
    // Mesma coisa que o sistema autorizou → sem mismatch.
    expect(
      detectSlotMismatch({
        assistantMessage: "Te espero sábado, dia 8, às 11h!",
        authorizedSlotUtc: autorizado,
        now: NOW,
      })
    ).toBeNull()
    // Horário diferente do autorizado → mismatch.
    expect(
      detectSlotMismatch({
        assistantMessage: "Te espero sábado, dia 8, às 9h!",
        authorizedSlotUtc: autorizado,
        now: NOW,
      })
    ).not.toBeNull()
    // Sem autorização, a função da 245 segue devolvendo null (quem cobre é a nova).
    expect(
      detectSlotMismatch({
        assistantMessage: "Te espero sábado, dia 8, às 11h!",
        authorizedSlotUtc: null,
        now: NOW,
      })
    ).toBeNull()
  })
})

describe("Story 75-279 — stripSystemBlocks (o vazamento que chegou na cliente)", () => {
  it("AC5 — remove o bloco exato que foi enviado à Maria", () => {
    const falaReal =
      "Deixa eu confirmar se esse horário está disponível no sábado, dia 8.\n\n" +
      "[SISTEMA: horário 11h do sábado 08/08 — LIVRE]\n\n" +
      "Anotado, Maria! Te espero sábado, dia 8, às 11h."
    const { text, stripped } = stripSystemBlocks(falaReal)
    expect(stripped).toBe(true)
    expect(text).not.toContain("SISTEMA")
    expect(text).toContain("Anotado, Maria!")
    expect(text).toContain("Deixa eu confirmar")
  })

  it("AC5 — bloco multi-linha também sai", () => {
    const { text, stripped } = stripSystemBlocks("Oi!\n[SISTEMA: linha um\nlinha dois]\nTchau")
    expect(stripped).toBe(true)
    expect(text).not.toContain("SISTEMA")
    expect(text).toContain("Tchau")
  })

  it("AC5 — bloco que o modelo não fechou some até o fim da linha", () => {
    const { text, stripped } = stripSystemBlocks("Oi!\n[SISTEMA: sem fechar\nTchau")
    expect(stripped).toBe(true)
    expect(text).not.toContain("SISTEMA")
    expect(text).toContain("Tchau")
  })

  it("AC5 — fala normal passa intacta e não marca vazamento", () => {
    const normal = "Te espero sábado às 11h!"
    expect(stripSystemBlocks(normal)).toEqual({ text: normal, stripped: false })
  })

  it("QA — variante do marcador também é removida (o modelo não é previsível)", () => {
    const { text, stripped } = stripSystemBlocks("Oi!\n[SISTEMAS: horário LIVRE]\nTe espero.")
    expect(stripped).toBe(true)
    expect(text).not.toContain("SISTEMA")
  })

  it("QA — `stripped` só é true quando algo saiu de verdade", () => {
    // Antes, a flag saía da suspeita ("o texto contém [SISTEMA") e não da
    // remoção — então um caso não tratado emitiria evento de vazamento sem ter
    // removido nada. Agora a flag é a comparação.
    const semBloco = "Isso é um texto normal, sem marcador."
    expect(stripSystemBlocks(semBloco).stripped).toBe(false)
  })
})
