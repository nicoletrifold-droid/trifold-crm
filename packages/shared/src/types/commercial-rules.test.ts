import { describe, it, expect } from "vitest"
import {
  CommercialRulesSchema,
  type CommercialRules,
} from "./commercial-rules"

describe("CommercialRulesSchema — Zod validation (5 scenarios from AC 8)", () => {
  it("(a) parses a complete valid input without throwing", () => {
    const validInput: CommercialRules = {
      requires_down_payment: true,
      min_down_payment_pct: 10,
      example_down_payment_brl: 40000,
      down_payment_flexible: true,
      financing_options: ["banco", "construtora_direto", "consorcio_contemplado"],
      mcmv_eligible: false,
      key_selling_points: [
        "Churrasqueira a carvão na sacada (raro em apartamentos)",
        "2 suítes em 67m² (compacto otimizado)",
      ],
      ideal_buyer_profile:
        "Quem busca praticidade com diferencial pessoal e entrega mais próxima",
      identification_keywords: ["vind", "67m2", "churrasqueira"],
      status_label: "próximo da entrega",
      notes: null,
    }

    expect(() => CommercialRulesSchema.parse(validInput)).not.toThrow()
    const parsed = CommercialRulesSchema.parse(validInput)
    expect(parsed.min_down_payment_pct).toBe(10)
    expect(parsed.financing_options).toEqual([
      "banco",
      "construtora_direto",
      "consorcio_contemplado",
    ])
  })

  it("(b) rejects min_down_payment_pct > 100 (upper boundary)", () => {
    const result = CommercialRulesSchema.safeParse({
      min_down_payment_pct: 101,
    })
    expect(result.success).toBe(false)
  })

  it("(c) rejects invalid financing_options enum value", () => {
    const result = CommercialRulesSchema.safeParse({
      financing_options: ["cartao"],
    })
    expect(result.success).toBe(false)
  })

  it("(d) accepts empty object {} due to .partial()", () => {
    const result = CommercialRulesSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it("(e) rejects min_down_payment_pct < 0 (lower boundary, symmetric to b)", () => {
    const result = CommercialRulesSchema.safeParse({
      min_down_payment_pct: -5,
    })
    expect(result.success).toBe(false)
  })
})
