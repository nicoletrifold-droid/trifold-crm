import { describe, it, expect, vi } from "vitest"
import { enrichLeadFromConversation, parseEnrichmentResponse, mapExtractedDataToLeadFields, stripAlreadyFilledPerfil, stripManualInterestLevel } from "./haiku-enrichment"
import { renderFatoDeAgenda } from "./summary-grounding"

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

// Story 75-237 — "o corretor é superior ao sistema": temperatura escolhida por
// humano não é mais recalculada pela IA (nem no cron, nem no pipeline da Nicole).
describe("stripManualInterestLevel", () => {
  it("remove interest_level do patch quando o humano já escolheu", () => {
    const patch: Record<string, unknown> = { interest_level: "cold", qualification_score: 10, ai_summary: "x" }
    stripManualInterestLevel(patch, { interest_level_manual: true })
    expect(patch.interest_level).toBeUndefined()
    // score e summary seguem dinâmicos — o guard é SÓ do calor
    expect(patch.qualification_score).toBe(10)
    expect(patch.ai_summary).toBe("x")
  })

  it("mantém interest_level quando ninguém mexeu (IA define o inicial)", () => {
    const patch: Record<string, unknown> = { interest_level: "cold" }
    stripManualInterestLevel(patch, { interest_level_manual: false })
    expect(patch.interest_level).toBe("cold")
  })

  it("lead que não pôde ser lido (null/undefined) = fail-safe, não sobrescreve", () => {
    const patch: Record<string, unknown> = { interest_level: "cold", qualification_score: 5 }
    stripManualInterestLevel(patch, null)
    expect(patch.interest_level).toBeUndefined()
    expect(patch.qualification_score).toBe(5)
    const patch2: Record<string, unknown> = { interest_level: "cold" }
    stripManualInterestLevel(patch2, undefined)
    expect(patch2.interest_level).toBeUndefined()
  })

  it("lead sem a coluna carregada não vira manual por acidente", () => {
    const patch: Record<string, unknown> = { interest_level: "warm" }
    stripManualInterestLevel(patch, {})
    expect(patch.interest_level).toBe("warm")
    const patch2: Record<string, unknown> = { interest_level: "warm" }
    stripManualInterestLevel(patch2, { interest_level_manual: null })
    expect(patch2.interest_level).toBe("warm")
  })
})

/**
 * Story 87-7 / AC5-(ii) — O PROMPT MONTADO DO ESCRITOR DOMINANTE.
 *
 * Achado do gate (`F3`): o teste que existia no `route.test.ts` assertava sobre
 * o **argumento** `fatoDeAgenda` — com o `enrichLeadFromConversation` dublado.
 * Mutar `${blocoAgenda}` ou `${REGRAS_FATO_DE_AGENDA}` dentro deste arquivo
 * dava **0 vermelhos**: a AC nomeia a string montada, e ninguém a olhava.
 *
 * Aqui a função é a DE VERDADE; só o cliente Anthropic é dublado, e a asserção
 * é sobre o texto que sai para o modelo.
 */
describe("AC5-(ii) — o ENRICHMENT_PROMPT montado leva o bloco e as regras", () => {
  const HOJE = new Date("2026-08-08T13:00:00Z")

  function anthropicFake() {
    return {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: '{"summary":"x","extracted_data":{}}' }],
        }),
      },
    } as unknown as Parameters<typeof enrichLeadFromConversation>[0]
  }

  async function promptMontado(fatoDeAgenda: string | null) {
    const anthropic = anthropicFake()
    await enrichLeadFromConversation(anthropic, {
      messages: [
        { role: "user", content: "Quero visitar" },
        { role: "assistant", content: "Agendei sua visita para sábado!" },
      ],
      currentCollectedData: {},
      fatoDeAgenda,
    })
    return (anthropic.messages.create as ReturnType<typeof vi.fn>).mock.calls[0]![0]
      .messages[0].content as string
  }

  it("🔴 o bloco FATO DE AGENDA entra no prompt montado", async () => {
    const bloco = renderFatoDeAgenda(
      [{ id: "a1", scheduled_at: new Date("2026-08-05T13:30:00Z"), status: "completed" }],
      HOJE
    )
    const prompt = await promptMontado(bloco)
    expect(prompt).toContain("FATO DE AGENDA")
    // AC11 — appointment no passado nunca vira fato em tempo presente.
    expect(prompt).toContain("A última visita registrada foi em 05/08/2026.")
  })

  it("🔴 e as REGRAS que proíbem data relativa vão SEMPRE, com ou sem bloco", async () => {
    // As regras vivem no `ENRICHMENT_PROMPT` (estáticas); o bloco é por lead.
    for (const bloco of [null, "FATO DE AGENDA (fonte: tabela `appointments`):\n  NÃO HÁ VISITA AGENDADA para este lead."]) {
      const prompt = await promptMontado(bloco)
      expect(prompt).toContain("DATA ABSOLUTA")
      expect(prompt).toContain("A unica fonte e o bloco FATO DE AGENDA")
      expect(prompt).toContain("Visita que ja aconteceu se escreve no passado")
    }
  })

  it("sem bloco, o prompt continua íntegro — o cron não quebra em lead sem consulta", async () => {
    const prompt = await promptMontado(null)
    expect(prompt).toContain("Dados ja coletados:")
    expect(prompt).toContain("Conversa:")
    expect(prompt).toContain("Nicole: Agendei sua visita para sábado!")
  })
})
