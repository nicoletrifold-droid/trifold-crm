import { describe, it, expect } from "vitest"
import {
  selectLatestMessageAt,
  windowUrgencyKey,
  sortByWindowUrgency,
} from "./leads-window"

const HOUR = 60 * 60 * 1000
const NOW = new Date("2026-06-18T12:00:00.000Z")
const iso = (msAgo: number) => new Date(NOW.getTime() - msAgo).toISOString()

describe("selectLatestMessageAt", () => {
  it("null/undefined → null", () => {
    expect(selectLatestMessageAt(null)).toBeNull()
    expect(selectLatestMessageAt(undefined)).toBeNull()
  })

  it("array vazio → null", () => {
    expect(selectLatestMessageAt([])).toBeNull()
  })

  it("conversa única (array) → seu last_message_at", () => {
    const ts = iso(1 * HOUR)
    expect(selectLatestMessageAt([{ last_message_at: ts }])).toBe(ts)
  })

  it("objeto único (não-array) → seu last_message_at", () => {
    const ts = iso(2 * HOUR)
    expect(selectLatestMessageAt({ last_message_at: ts })).toBe(ts)
  })

  it("múltiplas conversas → seleciona a MAIS RECENTE", () => {
    const recent = iso(1 * HOUR)
    const old = iso(50 * HOUR)
    const older = iso(100 * HOUR)
    expect(
      selectLatestMessageAt([
        { last_message_at: old },
        { last_message_at: recent },
        { last_message_at: older },
      ])
    ).toBe(recent)
  })

  it("ignora entradas null/sem timestamp", () => {
    const ts = iso(3 * HOUR)
    expect(
      selectLatestMessageAt([
        { last_message_at: null },
        { last_message_at: ts },
      ])
    ).toBe(ts)
    expect(selectLatestMessageAt([{ last_message_at: null }])).toBeNull()
  })
})

describe("windowUrgencyKey", () => {
  it("janela fechada → +Infinity (vai para o final)", () => {
    const key = windowUrgencyKey(
      { phone: "5511999", last_message_at: iso(30 * HOUR) },
      NOW
    )
    expect(key).toBe(Number.POSITIVE_INFINITY)
  })

  it("sem histórico (janela fechada) → +Infinity", () => {
    const key = windowUrgencyKey(
      { phone: "5511999", last_message_at: null },
      NOW
    )
    expect(key).toBe(Number.POSITIVE_INFINITY)
  })

  it("janela aberta → remainingMs (menor = mais urgente)", () => {
    const key = windowUrgencyKey(
      { phone: "5511999", last_message_at: iso(1 * HOUR) },
      NOW
    )
    expect(key).toBe(23 * HOUR)
  })

  it("Telegram (tg:) → +Infinity (sem janela, sem urgência)", () => {
    const key = windowUrgencyKey(
      { phone: "tg:123456", last_message_at: iso(1 * HOUR) },
      NOW
    )
    expect(key).toBe(Number.POSITIVE_INFINITY)
  })
})

describe("sortByWindowUrgency", () => {
  it("ordena janela ativa por menor tempo restante; fechadas no final", () => {
    const leads = [
      { id: "closed", phone: "5511000", last_message_at: iso(30 * HOUR) }, // fechada
      { id: "open-23h", phone: "5511111", last_message_at: iso(1 * HOUR) }, // 23h restantes
      { id: "closing-1h", phone: "5511222", last_message_at: iso(23 * HOUR) }, // 1h restante
      { id: "telegram", phone: "tg:999", last_message_at: iso(1 * HOUR) }, // sem janela
    ]
    const sorted = sortByWindowUrgency(leads, NOW).map((l) => l.id)
    // closing-1h (menos tempo) primeiro, depois open-23h; closed/telegram no final
    expect(sorted[0]).toBe("closing-1h")
    expect(sorted[1]).toBe("open-23h")
    expect(sorted.slice(2)).toEqual(expect.arrayContaining(["closed", "telegram"]))
  })

  it("não muta o array original", () => {
    const leads = [
      { id: "a", phone: "5511111", last_message_at: iso(23 * HOUR) },
      { id: "b", phone: "5511222", last_message_at: iso(1 * HOUR) },
    ]
    const copy = [...leads]
    sortByWindowUrgency(leads, NOW)
    expect(leads).toEqual(copy)
  })
})
