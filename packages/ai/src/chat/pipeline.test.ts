import { describe, it, expect } from "vitest"
import {
  hasConfirmedDay,
  resolveOffHoursResponse,
  buildNoReintroContext,
  mediaContextLine,
  resolvePropertyInterestWrite,
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
      { role: "user", content: "oi" },
      { role: "assistant", content: "Sou a Nicole..." },
    ]
    const result = buildNoReintroContext(history)
    expect(result).toContain("NAO diga 'Sou a Nicole'")
    expect(result.length).toBeGreaterThan(0)
  })

  it("returns empty string when history has no assistant messages", () => {
    const history = [{ role: "user", content: "oi" }]
    expect(buildNoReintroContext(history)).toBe("")
  })

  it("returns empty string for empty history", () => {
    expect(buildNoReintroContext([])).toBe("")
  })

  it("returns instruction when first message is from assistant", () => {
    const history = [{ role: "assistant", content: "Olá!" }]
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
