import { describe, it, expect } from "vitest"
import { identifyProperty, identifyPropertyUnique } from "./identify-property"

const PROPERTIES = [
  { id: "vind-id", name: "Vind Residence", slug: "vind-residence" },
  { id: "yarden-id", name: "Yarden Residence", slug: "yarden-residence" },
]

// The PROPERTY_KEYWORDS map uses the slug as key. The code does:
// property.slug.toLowerCase() to get slug, then looks up PROPERTY_KEYWORDS[slug].
// For "vind-residence" there is no exact match in PROPERTY_KEYWORDS (which has "vind" and "yarden").
// So it falls back to [slug, property.name.toLowerCase()] = ["vind-residence", "vind residence"].
// We need properties whose slug matches the PROPERTY_KEYWORDS keys.
const PROPERTIES_MATCHING = [
  { id: "vind-id", name: "Vind Residence", slug: "vind" },
  { id: "yarden-id", name: "Yarden Residence", slug: "yarden" },
]

describe("identifyProperty", () => {
  it("identifies Vind from message containing 'vind'", () => {
    const result = identifyProperty("Quero saber sobre o Vind", {}, PROPERTIES_MATCHING)
    expect(result).toBe("vind-id")
  })

  it("identifies Yarden from message containing 'yarden'", () => {
    const result = identifyProperty("Me fale do Yarden", {}, PROPERTIES_MATCHING)
    expect(result).toBe("yarden-id")
  })

  it("identifies Yarden from 'Gleba Itororo' keyword", () => {
    const result = identifyProperty(
      "O empreendimento na Gleba Itororo",
      {},
      PROPERTIES_MATCHING
    )
    expect(result).toBe("yarden-id")
  })

  it("identifies Yarden from 'rooftop' keyword", () => {
    const result = identifyProperty("Quero o com rooftop", {}, PROPERTIES_MATCHING)
    expect(result).toBe("yarden-id")
  })

  it("identifies Yarden from '83m2' keyword", () => {
    const result = identifyProperty("O apartamento de 83m2", {}, PROPERTIES_MATCHING)
    expect(result).toBe("yarden-id")
  })

  it("identifies Vind from '67m2' keyword", () => {
    const result = identifyProperty("O de 67m2", {}, PROPERTIES_MATCHING)
    expect(result).toBe("vind-id")
  })

  it("returns null when no property is mentioned", () => {
    const result = identifyProperty("Bom dia, tudo bem?", {}, PROPERTIES_MATCHING)
    expect(result).toBeNull()
  })

  it("returns null with empty message", () => {
    const result = identifyProperty("", {}, PROPERTIES_MATCHING)
    expect(result).toBeNull()
  })

  it("falls back to collectedData property_interest when no keyword match", () => {
    const result = identifyProperty(
      "Bom dia",
      { property_interest: "vind" },
      PROPERTIES_MATCHING
    )
    expect(result).toBe("vind-id")
  })

  it("returns null when properties array is empty", () => {
    const result = identifyProperty("Quero o Vind", {}, [])
    expect(result).toBeNull()
  })

  it("is case-insensitive", () => {
    const result = identifyProperty("QUERO O VIND", {}, PROPERTIES_MATCHING)
    expect(result).toBe("vind-id")
  })

  it("handles accented characters via normalization", () => {
    const result = identifyProperty(
      "Gleba Itoroó é lindo",
      {},
      PROPERTIES_MATCHING
    )
    expect(result).toBe("yarden-id")
  })

  it("uses slug/name fallback when slug not in PROPERTY_KEYWORDS", () => {
    // PROPERTIES has slug "vind-residence" which is not in PROPERTY_KEYWORDS
    // Falls back to checking [slug, name.toLowerCase()] = ["vind-residence", "vind residence"]
    const result = identifyProperty("Gosto do Vind Residence", {}, PROPERTIES)
    expect(result).toBe("vind-id")
  })
})

describe("identifyPropertyUnique (Story 75-158)", () => {
  it("resolve quando exatamente 1 empreendimento casa", () => {
    expect(identifyPropertyUnique("quero o Vind", PROPERTIES_MATCHING)).toBe("vind-id")
    expect(identifyPropertyUnique("me fale do Yarden", PROPERTIES_MATCHING)).toBe("yarden-id")
  })

  it("resolve pelo CONTEXTO (frase da Nicole citando so um)", () => {
    const ctx = "O Vind tem tudo a ver com voce, Maicon! O que achou?"
    expect(identifyPropertyUnique(ctx, PROPERTIES_MATCHING)).toBe("vind-id")
  })

  it("NAO adivinha quando 2+ empreendimentos aparecem (ambiguo → null)", () => {
    expect(identifyPropertyUnique("vi o Vind e o Yarden", PROPERTIES_MATCHING)).toBeNull()
  })

  it("null quando nenhum casa ou texto vazio", () => {
    expect(identifyPropertyUnique("bom dia, tudo bem?", PROPERTIES_MATCHING)).toBeNull()
    expect(identifyPropertyUnique("", PROPERTIES_MATCHING)).toBeNull()
  })

  it("keyword de amenidade unica de um empreendimento resolve (rooftop → Yarden)", () => {
    expect(identifyPropertyUnique("tem rooftop?", PROPERTIES_MATCHING)).toBe("yarden-id")
  })
})
