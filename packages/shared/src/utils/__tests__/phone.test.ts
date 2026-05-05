import { describe, it, expect } from "vitest"
import { normalizePhoneBR } from "../phone"

describe("normalizePhoneBR — invalid inputs", () => {
  it("returns null for null input", () => {
    expect(normalizePhoneBR(null)).toBeNull()
  })

  it("returns null for undefined input", () => {
    expect(normalizePhoneBR(undefined)).toBeNull()
  })

  it("returns null for empty string", () => {
    expect(normalizePhoneBR("")).toBeNull()
  })

  it("returns null for whitespace-only string", () => {
    expect(normalizePhoneBR("   ")).toBeNull()
    expect(normalizePhoneBR("\t\n  ")).toBeNull()
  })

  it("returns null for input with no digits", () => {
    expect(normalizePhoneBR("abc")).toBeNull()
    expect(normalizePhoneBR("---")).toBeNull()
    expect(normalizePhoneBR("(--)")).toBeNull()
  })

  it("returns null for less than 10 digits after cleanup", () => {
    expect(normalizePhoneBR("12345")).toBeNull()
    expect(normalizePhoneBR("123456789")).toBeNull() // 9 digits
    expect(normalizePhoneBR("(11) 99-9")).toBeNull()
  })

  it("returns null for non-string types (defensive)", () => {
    // Cast to any to test runtime defense
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(normalizePhoneBR(12345 as any)).toBeNull()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(normalizePhoneBR({} as any)).toBeNull()
  })
})

describe("normalizePhoneBR — valid BR formats → canonical 5544999689446", () => {
  const CANONICAL = "5544999689446"

  it("11 digits without 55 → prefixes 55", () => {
    expect(normalizePhoneBR("44999689446")).toBe(CANONICAL)
  })

  it("13 digits with +55 prefix → strips + and returns canonical", () => {
    expect(normalizePhoneBR("+5544999689446")).toBe(CANONICAL)
  })

  it("13 digits canonical passthrough", () => {
    expect(normalizePhoneBR("5544999689446")).toBe(CANONICAL)
  })

  it("12 digits starting with 55 (legacy without 9) → inserts 9", () => {
    expect(normalizePhoneBR("554499689446")).toBe(CANONICAL)
  })

  it("13 digits with spaces and hyphens → strips and returns canonical", () => {
    expect(normalizePhoneBR("5544 9 9968-9446")).toBe(CANONICAL)
    expect(normalizePhoneBR("55 44 99968-9446")).toBe(CANONICAL)
  })

  it("11 digits with parens and hyphens → prefixes 55", () => {
    expect(normalizePhoneBR("(44) 99968-9446")).toBe(CANONICAL)
  })

  it("11 digits with spaces → prefixes 55", () => {
    expect(normalizePhoneBR("44 9 9968 9446")).toBe(CANONICAL)
  })

  it("13 digits with multiple spaces → strips and returns canonical", () => {
    expect(normalizePhoneBR("+55 44 999 689 446")).toBe(CANONICAL)
  })

  it("12 digits with spaces (no 9) → inserts 9", () => {
    expect(normalizePhoneBR("55 44 9968-9446")).toBe(CANONICAL)
  })
})

describe("normalizePhoneBR — edge cases for 12-digit insertion logic", () => {
  it("inserts 9 in correct position for any DDD", () => {
    // Inputs: 55 + DDD (11) + 8-digit number → insert 9 after pos 4
    expect(normalizePhoneBR("551191234567")).toBe("5511991234567") // 12 → 13
    expect(normalizePhoneBR("552181234567")).toBe("5521981234567")
    expect(normalizePhoneBR("558581234567")).toBe("5585981234567")
  })
})

describe("normalizePhoneBR — non-BR / international fallback", () => {
  it("13 digits NOT starting with 55 → returns as-is (international)", () => {
    // 13-digit US-style with country code 1 (improbable but documented)
    expect(normalizePhoneBR("1234567890123")).toBe("1234567890123")
  })

  it("10 digits (local without DDI/DDD) → returns as-is", () => {
    // 10 digits is unusual for BR but must not be silently re-prefixed
    expect(normalizePhoneBR("4499689446")).toBe("4499689446")
  })

  it("more than 13 digits → returns the digits as-is", () => {
    // International numbers may have more digits
    expect(normalizePhoneBR("123456789012345")).toBe("123456789012345")
  })
})

describe("normalizePhoneBR — production bug regression (multiple formats → same canonical)", () => {
  // The exact bug from the story: 4 leads created for the same user
  // because phone arrived in 4 different formats from Meta.
  it("normalizes all variants of the bug to the same canonical phone", () => {
    const variants = [
      "+5544999689446",
      "554499689446",
      "5544 99968-9446",
      "44999689446",
      "(44) 99968-9446",
      "5544999689446",
    ]
    for (const v of variants) {
      expect(normalizePhoneBR(v)).toBe("5544999689446")
    }
  })
})
