import { describe, it, expect } from "vitest"
import {
  channelLabel,
  formatChannels,
  firstName,
  formatBrokers,
  formatDuration,
  formatTempo,
  formatDistribuidos,
  formatDateBR,
} from "./daily-leads-report"

describe("channelLabel", () => {
  it("mapeia canais conhecidos", () => {
    expect(channelLabel("meta_ads")).toBe("Meta Ads")
    expect(channelLabel("whatsapp")).toBe("WhatsApp")
    expect(channelLabel("website")).toBe("Site")
  })
  it("capitaliza desconhecidos e trata vazio", () => {
    expect(channelLabel("instagram")).toBe("Instagram")
    expect(channelLabel("")).toBe("Desconhecido")
  })
})

describe("formatChannels", () => {
  it("ordena por contagem desc e usa separador ·", () => {
    expect(formatChannels({ whatsapp: 12, meta_ads: 7, website: 1 })).toBe(
      "WhatsApp 12 · Meta Ads 7 · Site 1"
    )
  })
  it("vazio → traço", () => {
    expect(formatChannels({})).toBe("—")
  })
})

describe("firstName", () => {
  it("pega o primeiro nome", () => {
    expect(firstName("Robson Silva")).toBe("Robson")
    expect(firstName("  Odair Ferreira dos Santos ")).toBe("Odair")
  })
  it("vazio → ?", () => {
    expect(firstName("")).toBe("?")
  })
})

describe("formatBrokers", () => {
  it("ordena por distribuídos desc e formata distribuídos→atenderam", () => {
    const r = formatBrokers([
      { name: "Odair Ferreira", distribuidos: 3, atenderam: 2 },
      { name: "Robson Silva", distribuidos: 8, atenderam: 8 },
    ])
    expect(r).toBe("Robson 8→8 · Odair 3→2")
  })
  it("nenhum distribuído", () => {
    expect(formatBrokers([])).toBe("Nenhum lead distribuído")
  })
})

describe("formatDuration", () => {
  it("minutos < 60", () => {
    expect(formatDuration(14)).toBe("14 min")
    expect(formatDuration(0.4)).toBe("0 min")
  })
  it("horas com e sem resto", () => {
    expect(formatDuration(60)).toBe("1h")
    expect(formatDuration(72)).toBe("1h12")
    expect(formatDuration(125)).toBe("2h05")
  })
})

describe("formatTempo", () => {
  it("sem dados → texto de início", () => {
    expect(formatTempo([])).toBe("começando a medir a partir de hoje")
  })
  it("média + mín + máx", () => {
    expect(formatTempo([3, 14, 72])).toBe(
      `${formatDuration((3 + 14 + 72) / 3)} (mín 3 min · máx 1h12)`
    )
  })
})

describe("formatDistribuidos", () => {
  it("caso do relatório: cobertura + envios + redistribuições", () => {
    // 9 recebidos, 8 deles distribuídos, 13 eventos, 10 leads únicos → 3 redistrib.
    expect(
      formatDistribuidos({ recebidos: 9, coberturaUnica: 8, totalEventos: 13, leadsUnicos: 10 })
    ).toBe("8 de 9 recebidos · 13 envios no total (3 redistribuições)")
  })

  it("nunca mais 'X de Y' com X > Y (o bug do 13 de 9)", () => {
    const s = formatDistribuidos({ recebidos: 9, coberturaUnica: 8, totalEventos: 13, leadsUnicos: 10 })
    expect(s.startsWith("8 de 9")).toBe(true)
    expect(s).not.toContain("13 de 9")
  })

  it("1:1 (sem redistribuição nem carryover) → só a cobertura", () => {
    expect(
      formatDistribuidos({ recebidos: 5, coberturaUnica: 5, totalEventos: 5, leadsUnicos: 5 })
    ).toBe("5 de 5 recebidos")
  })

  it("carryover sem redistribuição (leads de dias anteriores, sem repetição)", () => {
    // 3 recebidos, todos distribuídos; +2 leads antigos distribuídos hoje = 5 eventos, 5 únicos
    expect(
      formatDistribuidos({ recebidos: 3, coberturaUnica: 3, totalEventos: 5, leadsUnicos: 5 })
    ).toBe("3 de 3 recebidos · 5 envios no total")
  })

  it("singular: 1 redistribuição / 1 recebido / 1 envio", () => {
    expect(
      formatDistribuidos({ recebidos: 1, coberturaUnica: 1, totalEventos: 2, leadsUnicos: 1 })
    ).toBe("1 de 1 recebido · 2 envios no total (1 redistribuição)")
  })

  it("zero recebidos", () => {
    expect(
      formatDistribuidos({ recebidos: 0, coberturaUnica: 0, totalEventos: 0, leadsUnicos: 0 })
    ).toBe("0 de 0 recebidos")
  })
})

describe("formatDateBR", () => {
  it("formata dd/mm/yyyy no fuso de Brasília", () => {
    // 2026-06-24T13:00:00Z → 24/06/2026 (BRT = UTC-3)
    expect(formatDateBR(new Date("2026-06-24T13:00:00Z"))).toBe("24/06/2026")
  })
  it("vira o dia conforme o fuso de Brasília", () => {
    // 2026-06-25T02:00:00Z = 23:00 BRT do dia 24
    expect(formatDateBR(new Date("2026-06-25T02:00:00Z"))).toBe("24/06/2026")
  })
})
