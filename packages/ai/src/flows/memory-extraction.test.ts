import { describe, it, expect } from "vitest"
import { extractFactsFromMessage } from "./memory-extraction"

describe("extractFactsFromMessage", () => {
  // ============================================
  // Profile
  // ============================================
  describe("profile extraction", () => {
    it("extracts name from 'me chamo'", () => {
      const facts = extractFactsFromMessage("Me chamo Fernanda Silva")
      expect(facts).toContainEqual(
        expect.objectContaining({ predicate: "name", object: "Fernanda Silva" })
      )
    })

    it("extracts name from 'meu nome é'", () => {
      const facts = extractFactsFromMessage("Meu nome é Carlos")
      expect(facts).toContainEqual(
        expect.objectContaining({ predicate: "name", object: "Carlos" })
      )
    })

    it("extracts name from 'sou o/a'", () => {
      const facts = extractFactsFromMessage("Sou a Maria Eduarda")
      expect(facts).toContainEqual(
        expect.objectContaining({ predicate: "name", object: "Maria Eduarda" })
      )
    })

    it("extracts profession from 'trabalho como'", () => {
      const facts = extractFactsFromMessage("trabalho como médico")
      expect(facts).toContainEqual(
        expect.objectContaining({ predicate: "profession", object: "médico" })
      )
    })

    it("extracts marital status", () => {
      const facts = extractFactsFromMessage("sou casado e tenho 2 filhos")
      expect(facts).toContainEqual(
        expect.objectContaining({ predicate: "marital_status", object: "casado" })
      )
      expect(facts).toContainEqual(
        expect.objectContaining({ predicate: "children_count", object: "2" })
      )
    })
  })

  // ============================================
  // Preferences
  // ============================================
  describe("preferences extraction", () => {
    it("extracts bedrooms", () => {
      const facts = extractFactsFromMessage("Quero 3 quartos")
      expect(facts).toContainEqual(
        expect.objectContaining({ predicate: "prefers_bedrooms", object: "3" })
      )
    })

    it("extracts bedrooms from suítes", () => {
      const facts = extractFactsFromMessage("preciso de 2 suítes")
      expect(facts).toContainEqual(
        expect.objectContaining({ predicate: "prefers_bedrooms", object: "2" })
      )
    })

    it("extracts floor preference", () => {
      const facts = extractFactsFromMessage("prefiro andar alto")
      expect(facts).toContainEqual(
        expect.objectContaining({ predicate: "prefers_floor", object: "alto" })
      )
    })

    it("extracts view preference", () => {
      const facts = extractFactsFromMessage("quero vista frente")
      expect(facts).toContainEqual(
        expect.objectContaining({ predicate: "prefers_view", object: "frente" })
      )
    })

    it("extracts garage count", () => {
      const facts = extractFactsFromMessage("preciso de 2 vagas")
      expect(facts).toContainEqual(
        expect.objectContaining({ predicate: "prefers_garage", object: "2" })
      )
    })
  })

  // ============================================
  // Financial
  // ============================================
  describe("financial extraction", () => {
    it("extracts FGTS usage", () => {
      const facts = extractFactsFromMessage("vou usar FGTS")
      expect(facts).toContainEqual(
        expect.objectContaining({ predicate: "uses_fgts", object: "true" })
      )
    })

    it("extracts down payment", () => {
      const facts = extractFactsFromMessage("tenho entrada de 80 mil")
      expect(facts).toContainEqual(
        expect.objectContaining({ predicate: "down_payment", object: "80 mil" })
      )
    })

    it("extracts budget", () => {
      const facts = extractFactsFromMessage("meu orçamento é até 500 mil")
      expect(facts).toContainEqual(
        expect.objectContaining({ predicate: "budget", object: "500 mil" })
      )
    })
  })

  // ============================================
  // Objections
  // ============================================
  describe("objection extraction", () => {
    it("detects price objection", () => {
      const facts = extractFactsFromMessage("achei muito caro")
      expect(facts).toContainEqual(
        expect.objectContaining({ predicate: "objection", object: "price" })
      )
    })

    it("detects timing objection", () => {
      const facts = extractFactsFromMessage("preciso pensar mais")
      expect(facts).toContainEqual(
        expect.objectContaining({ predicate: "objection", object: "timing" })
      )
    })

    it("detects competition objection", () => {
      const facts = extractFactsFromMessage("tô vendo outros empreendimentos")
      expect(facts).toContainEqual(
        expect.objectContaining({ predicate: "objection", object: "competition" })
      )
    })
  })

  // ============================================
  // Availability
  // ============================================
  describe("availability extraction", () => {
    it("extracts day of week", () => {
      const facts = extractFactsFromMessage("sábado funciona pra mim")
      expect(facts).toContainEqual(
        expect.objectContaining({ predicate: "available_day", object: "sábado" })
      )
    })

    it("extracts time", () => {
      const facts = extractFactsFromMessage("pode ser às 10h")
      expect(facts).toContainEqual(
        expect.objectContaining({ predicate: "available_time", object: "10h" })
      )
    })

    it("extracts relative day", () => {
      const facts = extractFactsFromMessage("amanhã tá bom")
      expect(facts).toContainEqual(
        expect.objectContaining({ predicate: "available_day", object: "amanhã" })
      )
    })
  })

  // ============================================
  // Property Interest
  // ============================================
  describe("property interest extraction", () => {
    it("detects Vind interest", () => {
      const facts = extractFactsFromMessage("quero saber mais sobre o Vind")
      expect(facts).toContainEqual(
        expect.objectContaining({ predicate: "interested_in", object: "vind" })
      )
    })

    it("detects Yarden interest", () => {
      const facts = extractFactsFromMessage("o Yarden me interessou")
      expect(facts).toContainEqual(
        expect.objectContaining({ predicate: "interested_in", object: "yarden" })
      )
    })
  })

  // ============================================
  // Edge Cases
  // ============================================
  describe("edge cases", () => {
    it("returns empty for short messages", () => {
      expect(extractFactsFromMessage("")).toEqual([])
      expect(extractFactsFromMessage("a")).toEqual([])
    })

    it("returns empty for noise messages", () => {
      expect(extractFactsFromMessage("ok")).toEqual([])
      expect(extractFactsFromMessage("blz")).toEqual([])
    })

    it("extracts multiple facts from complex message", () => {
      const facts = extractFactsFromMessage(
        "Me chamo Ana, sou casada, quero 3 quartos no Yarden com andar alto"
      )
      expect(facts.length).toBeGreaterThanOrEqual(4)
      expect(facts.map((f) => f.predicate)).toContain("name")
      expect(facts.map((f) => f.predicate)).toContain("marital_status")
      expect(facts.map((f) => f.predicate)).toContain("prefers_bedrooms")
      expect(facts.map((f) => f.predicate)).toContain("interested_in")
    })
  })
})
