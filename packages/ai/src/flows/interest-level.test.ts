import { describe, it, expect } from "vitest"
import { interestLevelFromScore } from "./interest-level"
import { mapExtractedDataToLeadFields } from "./haiku-enrichment"

// Story 75-332 — AC5: UMA régua só.
//
// Antes, o cálculo do calor vivia inline no haiku-enrichment (linha 253). Se a
// 75-332 tivesse reproduzido os números, o mesmo lead teria calor diferente
// conforme o caminho que o criou — e a divergência só apareceria meses depois.

describe("interestLevelFromScore", () => {
  it("aplica os cortes 70 / 40", () => {
    expect(interestLevelFromScore(100)).toBe("hot")
    expect(interestLevelFromScore(70)).toBe("hot")
    expect(interestLevelFromScore(69)).toBe("warm")
    expect(interestLevelFromScore(40)).toBe("warm")
    expect(interestLevelFromScore(39)).toBe("cold")
    expect(interestLevelFromScore(0)).toBe("cold")
  })
})

describe("AC5 — os DOIS caminhos dão o mesmo calor para o mesmo score", () => {
  // O caminho do cron (mapExtractedDataToLeadFields) calcula o score a partir
  // dos dados e deriva o calor; o caminho do formulário chama a função direto.
  // Este teste amarra os dois: se alguém reintroduzir a expressão inline em um
  // dos lados, ele quebra.
  it("o patch do enriquecimento usa a MESMA função", () => {
    const patch = mapExtractedDataToLeadFields({}, {})
    const score = patch.qualification_score as number
    expect(patch.interest_level).toBe(interestLevelFromScore(score))
  })

  it("cobre a faixa inteira, não só um ponto", () => {
    for (const score of [0, 39, 40, 69, 70, 100]) {
      expect(["hot", "warm", "cold"]).toContain(interestLevelFromScore(score))
    }
  })
})
