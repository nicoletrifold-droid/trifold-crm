import { describe, it, expect } from "vitest"
import { getBubbleStyle, resolveBubbleLabel } from "./bubble-styles"

describe("resolveBubbleLabel (Story 75-165)", () => {
  const names = { u_val: "Valeria Costa", u_jon: "Jonathan" }
  it("broker do próprio espectador → 'Você'", () => {
    expect(resolveBubbleLabel({ role: "broker", metadata: { sent_by: "u_jon" } }, { currentUserId: "u_jon", senderNames: names })).toBe("Você")
  })
  it("broker de OUTRO corretor → nome real (não 'Você')", () => {
    expect(resolveBubbleLabel({ role: "broker", metadata: { sent_by: "u_val" } }, { currentUserId: "u_jon", senderNames: names })).toBe("Valeria Costa")
  })
  it("broker com sent_by desconhecido → 'Corretor'", () => {
    expect(resolveBubbleLabel({ role: "broker", metadata: { sent_by: "u_x" } }, { currentUserId: "u_jon", senderNames: names })).toBe("Corretor")
  })
  it("broker sem sent_by (legado/otimista) → mantém 'Você'", () => {
    expect(resolveBubbleLabel({ role: "broker", metadata: {} }, { currentUserId: "u_jon", senderNames: names })).toBe("Você")
    expect(resolveBubbleLabel({ role: "broker", metadata: null }, {})).toBe("Você")
  })
  it("lead e Nicole usam o rótulo padrão", () => {
    expect(resolveBubbleLabel({ role: "user", metadata: { sent_by: "u_val" } }, { currentUserId: "u_jon", senderNames: names })).toBe("Lead")
    expect(resolveBubbleLabel({ role: "assistant" }, { currentUserId: "u_jon" })).toBe("Nicole")
  })
})

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
