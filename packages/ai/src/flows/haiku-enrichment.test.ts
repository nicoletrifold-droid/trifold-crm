import { describe, it, expect } from "vitest"
import { parseEnrichmentResponse, mapExtractedDataToLeadFields, stripAlreadyFilledPerfil } from "./haiku-enrichment"

describe("parseEnrichmentResponse", () => {
  it("parses valid JSON response", () => {
    const input = JSON.stringify({
      summary: "Lead interessado no Yarden, 3 quartos, andar alto.",
      extracted_data: { property_interest: "yarden", bedrooms: 3, floor: "alto" },
    })
    const result = parseEnrichmentResponse(input)
    expect(result).not.toBeNull()
    expect(result!.summary).toBe("Lead interessado no Yarden, 3 quartos, andar alto.")
    expect(result!.extracted_data.property_interest).toBe("yarden")
    expect(result!.extracted_data.bedrooms).toBe(3)
  })

  it("strips markdown code blocks", () => {
    const input = "```json\n" + JSON.stringify({
      summary: "Resumo",
      extracted_data: { name: "João" },
    }) + "\n```"
    const result = parseEnrichmentResponse(input)
    expect(result).not.toBeNull()
    expect(result!.extracted_data.name).toBe("João")
  })

  it("returns null for invalid JSON", () => {
    expect(parseEnrichmentResponse("not json")).toBeNull()
  })

  it("returns null when summary is missing", () => {
    expect(parseEnrichmentResponse(JSON.stringify({ extracted_data: {} }))).toBeNull()
  })

  it("returns null when extracted_data is missing", () => {
    expect(parseEnrichmentResponse(JSON.stringify({ summary: "test" }))).toBeNull()
  })

  it("handles empty extracted_data", () => {
    const input = JSON.stringify({ summary: "Resumo basico", extracted_data: {} })
    const result = parseEnrichmentResponse(input)
    expect(result).not.toBeNull()
    expect(Object.keys(result!.extracted_data)).toHaveLength(0)
  })
})

describe("mapExtractedDataToLeadFields", () => {
  it("maps basic fields correctly", () => {
    const extracted = { name: "Maria", bedrooms: 2, floor: "alto" }
    const result = mapExtractedDataToLeadFields(extracted, {})
    expect(result.name).toBe("Maria")
    expect(result.preferred_bedrooms).toBe(2)
    expect(result.preferred_floor).toBe("alto")
  })

  it("maps has_down_payment boolean", () => {
    const result = mapExtractedDataToLeadFields({ has_down_payment: false }, {})
    expect(result.has_down_payment).toBe(false)
  })

  it("validates source against enum", () => {
    const result = mapExtractedDataToLeadFields({ source: "meta_ads" }, {})
    expect(result.source).toBe("meta_ads")
  })

  it("rejects invalid source values", () => {
    const result = mapExtractedDataToLeadFields({ source: "instagram" }, {})
    expect(result.source).toBeUndefined()
  })

  it("calculates qualification score from merged data", () => {
    const existing = { name: "João", property_interest: "vind" }
    const extracted = { bedrooms: 3, floor: "alto" }
    const result = mapExtractedDataToLeadFields(extracted, existing)
    // name(10) + property_interest(15) + bedrooms(10) + floor(10) = 45
    expect(result.qualification_score).toBe(45)
    expect(result.interest_level).toBe("warm")
    expect(result.qualification_status).toBe("in_progress")
  })

  it("sets hot interest_level for score >= 70", () => {
    const existing = {
      name: "Ana", property_interest: "yarden", bedrooms: 2,
      floor: "alto", view: "frente", has_down_payment: true, visit_availability: "sabado",
    }
    const result = mapExtractedDataToLeadFields({}, existing)
    expect(result.qualification_score).toBeGreaterThanOrEqual(70)
    expect(result.interest_level).toBe("hot")
  })

  it("does not include fields with wrong types", () => {
    const result = mapExtractedDataToLeadFields({ bedrooms: "tres" as unknown }, {})
    expect(result.preferred_bedrooms).toBeUndefined()
  })

  it("maps email correctly", () => {
    const result = mapExtractedDataToLeadFields({ email: "test@example.com" }, {})
    expect(result.email).toBe("test@example.com")
  })

  it("maps garages and view", () => {
    const result = mapExtractedDataToLeadFields({ garages: 2, view: "fundos" }, {})
    expect(result.preferred_garage_count).toBe(2)
    expect(result.preferred_view).toBe("fundos")
  })

  // Story 75-183 — Perfil (marketing)
  it("maps perfil enums when values are valid", () => {
    const result = mapExtractedDataToLeadFields(
      {
        renda_familiar: "4700_8000",
        filhos: "2",
        estado_civil: "casado_uniao",
        faixa_etaria: "35_44",
        situacao_moradia: "aluguel",
        tem_pet: "sim",
      },
      {}
    )
    expect(result.renda_familiar).toBe("4700_8000")
    expect(result.filhos).toBe("2")
    expect(result.estado_civil).toBe("casado_uniao")
    expect(result.faixa_etaria).toBe("35_44")
    expect(result.situacao_moradia).toBe("aluguel")
    expect(result.tem_pet).toBe("sim")
  })

  it("rejects perfil enum values outside the CHECK lists (never breaks the constraint)", () => {
    const result = mapExtractedDataToLeadFields(
      {
        renda_familiar: "uns 5 mil",
        filhos: "quatro",
        estado_civil: "namorando",
        faixa_etaria: "jovem",
        situacao_moradia: "hotel",
        tem_pet: "cachorro",
      },
      {}
    )
    expect(result.renda_familiar).toBeUndefined()
    expect(result.filhos).toBeUndefined()
    expect(result.estado_civil).toBeUndefined()
    expect(result.faixa_etaria).toBeUndefined()
    expect(result.situacao_moradia).toBeUndefined()
    expect(result.tem_pet).toBeUndefined()
  })

  it("sanitizes free-text perfil fields (trim + length cap)", () => {
    const result = mapExtractedDataToLeadFields(
      { profissao: "  professora  ", cidade_bairro: "  Maringá / Jd. Atami  " },
      {}
    )
    expect(result.profissao).toBe("professora")
    expect(result.cidade_bairro).toBe("Maringá / Jd. Atami")

    const long = mapExtractedDataToLeadFields({ profissao: "x".repeat(300) }, {})
    expect((long.profissao as string).length).toBe(80)
  })

  it("omits perfil fields not mentioned (empty/absent/non-string)", () => {
    const result = mapExtractedDataToLeadFields({ profissao: "   ", filhos: 2 }, {})
    expect(result.profissao).toBeUndefined()
    expect(result.filhos).toBeUndefined()
  })
})

describe("stripAlreadyFilledPerfil (Story 75-183 — guard não-sobrescrever)", () => {
  it("removes perfil fields already filled on the lead (humano vence a IA)", () => {
    const patch: Record<string, unknown> = {
      profissao: "advogada",
      renda_familiar: "4700_8000",
      cidade_bairro: "Maringá",
      ai_summary: "resumo novo",
    }
    stripAlreadyFilledPerfil(patch, { profissao: "Médico(a)", renda_familiar: "acima_20000" })
    expect(patch.profissao).toBeUndefined()
    expect(patch.renda_familiar).toBeUndefined()
    // Campo de perfil VAZIO no lead continua sendo preenchido
    expect(patch.cidade_bairro).toBe("Maringá")
    // Campos fora do perfil não passam pelo guard
    expect(patch.ai_summary).toBe("resumo novo")
  })

  it("treats null and empty string on the lead as 'not filled'", () => {
    const patch: Record<string, unknown> = { profissao: "professora", tem_pet: "sim" }
    stripAlreadyFilledPerfil(patch, { profissao: null, tem_pet: "" })
    expect(patch.profissao).toBe("professora")
    expect(patch.tem_pet).toBe("sim")
  })

  it("no-op when lead row is empty", () => {
    const patch: Record<string, unknown> = { filhos: "2" }
    stripAlreadyFilledPerfil(patch, {})
    expect(patch.filhos).toBe("2")
  })
})
