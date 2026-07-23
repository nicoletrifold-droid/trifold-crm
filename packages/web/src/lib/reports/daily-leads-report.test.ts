import { describe, it, expect } from "vitest"
import {
  channelLabel,
  formatChannels,
  firstName,
  formatBrokers,
  aggregateBrokerRows,
  formatDuration,
  formatTempo,
  formatDistribuidos,
  formatDateBR,
  isLeadFunil,
  formatPatrocinados,
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

// Story 75-212 — linha "Patrocinado Corretor" (ajuda de custo)
describe("formatPatrocinados", () => {
  it("total + por corretor (primeiro nome), ordenado desc", () => {
    expect(
      formatPatrocinados([
        { name: "Robson Silva", count: 1 },
        { name: "Valeria Costa", count: 2 },
      ])
    ).toBe("3 — Valeria 2 · Robson 1")
  })
  it("empate desalinha por nome (estável)", () => {
    expect(
      formatPatrocinados([
        { name: "Valeria Costa", count: 1 },
        { name: "Robson Silva", count: 1 },
      ])
    ).toBe("2 — Robson 1 · Valeria 1")
  })
  it("lead sem corretor atribuído agrupa como 'Sem corretor' (não vira 'Sem')", () => {
    expect(
      formatPatrocinados([
        { name: "Sem corretor", count: 1 },
        { name: "Valeria Costa", count: 2 },
      ])
    ).toBe("3 — Valeria 2 · Sem corretor 1")
  })
  it("sem leads patrocinados → '0'", () => {
    expect(formatPatrocinados([])).toBe("0")
  })
})

describe("aggregateBrokerRows", () => {
  const names = { b1: "Valeria Souza", b2: "Roberto Lima" }

  it("conta LEADS ÚNICOS, não eventos (redistribuição ao mesmo corretor = 1)", () => {
    // lead L1 distribuído 2x para b1 (redistribuição) → conta 1
    const rows = [
      { lead_id: "L1", broker_id: "b1" },
      { lead_id: "L1", broker_id: "b1" },
      { lead_id: "L2", broker_id: "b1" },
    ]
    const stages = { L1: "atendido", L2: "novo-id" }
    const out = aggregateBrokerRows(rows, stages, "novo-id", names)
    expect(out).toEqual([{ name: "Valeria Souza", distribuidos: 2, atenderam: 1 }])
  })

  it("lead redistribuído entre 2 corretores conta 1 para cada", () => {
    const rows = [
      { lead_id: "L1", broker_id: "b1" },
      { lead_id: "L1", broker_id: "b2" },
    ]
    const stages = { L1: "atendido" }
    const out = aggregateBrokerRows(rows, stages, "novo-id", names).sort((a, b) =>
      a.name.localeCompare(b.name)
    )
    expect(out).toEqual([
      { name: "Roberto Lima", distribuidos: 1, atenderam: 1 },
      { name: "Valeria Souza", distribuidos: 1, atenderam: 1 },
    ])
  })

  it("atenderam só conta leads distintos fora de 'novo'", () => {
    const rows = [
      { lead_id: "L1", broker_id: "b1" },
      { lead_id: "L2", broker_id: "b1" },
      { lead_id: "L3", broker_id: "b1" },
    ]
    const stages = { L1: "novo-id", L2: "visita", L3: null }
    const out = aggregateBrokerRows(rows, stages, "novo-id", names)
    expect(out).toEqual([{ name: "Valeria Souza", distribuidos: 3, atenderam: 1 }])
  })

  it("vazio → []", () => {
    expect(aggregateBrokerRows([], {}, "novo-id", names)).toEqual([])
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

describe("isLeadFunil", () => {
  const semSinal = { metadata: {}, ai_summary: null }
  it("cadastro manual puro (nenhum sinal) → false", () => {
    expect(isLeadFunil(semSinal, false, false)).toBe(false)
    expect(isLeadFunil({ metadata: null, ai_summary: "" }, false, false)).toBe(false)
  })
  it("metadata de campanha (Meta Ads/CTWA) → funil", () => {
    expect(isLeadFunil({ metadata: { ad_id: "123" }, ai_summary: null }, false, false)).toBe(true)
  })
  it("ai_summary (Nicole atuou) → funil", () => {
    expect(isLeadFunil({ metadata: {}, ai_summary: "resumo" }, false, false)).toBe(true)
  })
  it("tem mensagem → funil", () => {
    expect(isLeadFunil(semSinal, true, false)).toBe(true)
  })
  it("foi distribuído → funil", () => {
    expect(isLeadFunil(semSinal, false, true)).toBe(true)
  })
})

describe("formatDistribuidos", () => {
  it("caso do relatório 13/07: cobertura + envios + origem das redistribuições", () => {
    // 15 de entrada, 14 distribuídos, 18 envios, 14 únicos → 4 redistrib, todas de bolsão.
    expect(
      formatDistribuidos({
        funil: 15,
        coberturaUnica: 14,
        totalEventos: 18,
        leadsUnicos: 14,
        redistribBolsao: 4,
      })
    ).toBe("14 de 15 do funil · 18 envios no total (4 redistribuições: bolsão 4 · roleta 0)")
  })

  it("redistribuição mista bolsão + roleta", () => {
    expect(
      formatDistribuidos({
        funil: 10,
        coberturaUnica: 9,
        totalEventos: 13,
        leadsUnicos: 10,
        redistribBolsao: 1,
      })
    ).toBe("9 de 10 do funil · 13 envios no total (3 redistribuições: bolsão 1 · roleta 2)")
  })

  it("guard carryover: bolsão não passa do total de redistribuições, roleta nunca negativa", () => {
    // pulls (2) > redistrib da janela (1) → bolsão clampado a 1, roleta 0.
    expect(
      formatDistribuidos({
        funil: 3,
        coberturaUnica: 3,
        totalEventos: 4,
        leadsUnicos: 3,
        redistribBolsao: 2,
      })
    ).toBe("3 de 3 do funil · 4 envios no total (1 redistribuição: bolsão 1 · roleta 0)")
  })

  it("1:1 (sem envio extra) → só a cobertura", () => {
    expect(
      formatDistribuidos({
        funil: 5,
        coberturaUnica: 5,
        totalEventos: 5,
        leadsUnicos: 5,
        redistribBolsao: 0,
      })
    ).toBe("5 de 5 do funil")
  })

  it("carryover sem redistribuição (leads de dias anteriores, sem repetição)", () => {
    // 3 de entrada, todos distribuídos; +2 leads antigos distribuídos hoje = 5 eventos, 5 únicos.
    expect(
      formatDistribuidos({
        funil: 3,
        coberturaUnica: 3,
        totalEventos: 5,
        leadsUnicos: 5,
        redistribBolsao: 0,
      })
    ).toBe("3 de 3 do funil · 5 envios no total")
  })

  it("singular: 1 redistribuição (roleta) / 1 funil / 1 envio", () => {
    expect(
      formatDistribuidos({
        funil: 1,
        coberturaUnica: 1,
        totalEventos: 2,
        leadsUnicos: 1,
        redistribBolsao: 0,
      })
    ).toBe("1 de 1 do funil · 2 envios no total (1 redistribuição: bolsão 0 · roleta 1)")
  })

  it("zero funil", () => {
    expect(
      formatDistribuidos({
        funil: 0,
        coberturaUnica: 0,
        totalEventos: 0,
        leadsUnicos: 0,
        redistribBolsao: 0,
      })
    ).toBe("0 de 0 do funil")
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
