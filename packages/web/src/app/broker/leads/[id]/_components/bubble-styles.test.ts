import { describe, it, expect } from "vitest"
import { getBubbleStyle } from "./bubble-styles"

describe("getBubbleStyle", () => {
  it("broker → direita, laranja, rótulo 'Você'", () => {
    const s = getBubbleStyle("broker")
    expect(s.side).toBe("right")
    expect(s.label).toBe("Você")
    expect(s.bubbleClass).toMatch(/orange/)
    expect(s.containerClass).toBe("justify-end")
  })

  it("user → esquerda, cinza (stone), rótulo 'Lead'", () => {
    const s = getBubbleStyle("user")
    expect(s.side).toBe("left")
    expect(s.label).toBe("Lead")
    expect(s.bubbleClass).toMatch(/stone/)
    expect(s.containerClass).toBe("justify-start")
  })

  it("assistant → esquerda, roxo (purple), rótulo 'Nicole'", () => {
    const s = getBubbleStyle("assistant")
    expect(s.side).toBe("left")
    expect(s.label).toBe("Nicole")
    expect(s.bubbleClass).toMatch(/purple/)
    expect(s.containerClass).toBe("justify-start")
  })

  it("system → centro, sem rótulo", () => {
    const s = getBubbleStyle("system")
    expect(s.side).toBe("center")
    expect(s.label).toBe("")
    expect(s.containerClass).toBe("justify-center")
  })

  it("role desconhecido → default seguro à esquerda, sem throw", () => {
    expect(() => getBubbleStyle("")).not.toThrow()
    const s = getBubbleStyle("qualquer-coisa")
    expect(s.side).toBe("left")
    expect(s.label).toBe("")
    expect(s.bubbleClass).toMatch(/stone/)
  })
})
