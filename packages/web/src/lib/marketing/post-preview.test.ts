import { describe, expect, it } from "vitest"

import { buildPostPreview, quantasArtes, tipoDePreview, MAX_ARTES_POR_POST } from "./post-preview"

// Story 75-254 — parsing do preview. PURA (AC8). Copys reais de produção.
const b = (copy: string | null, formato: Parameters<typeof tipoDePreview>[0], temArte = true, roteiro?: string) =>
  buildPostPreview({ copy, formato, temArteGerada: temArte, roteiro })

describe("tipoDePreview", () => {
  it("mapeia os 4 formatos, e NULL vira indefinido (AC7 — 11 posts legados)", () => {
    expect(tipoDePreview("story")).toBe("story")
    expect(tipoDePreview("carrossel")).toBe("carrossel")
    expect(tipoDePreview("estatico")).toBe("feed")
    expect(tipoDePreview("reel")).toBe("reel")
    expect(tipoDePreview(null)).toBe("indefinido")
  })
})

describe("story — o caso do Marcos (AC2)", () => {
  it("copy real com TELA em linhas separadas vira 2 telas", () => {
    const copy = `TELA 1: Vind Residence: obra avançando. Revestimento e pavimentos em execução — entrega contratual mais próxima do mercado: abril/2027.

TELA 2: 72% vendido. Liberado para Airbnb. Venha conhecer de perto.`
    const p = b(copy, "story")
    expect(p.tipo).toBe("story")
    expect(p.aspecto).toBe("9:16")
    expect(p.telas).toHaveLength(2)
    expect(p.telas[0]!.rotulo).toBe("Tela 1")
    expect(p.telas[1]!.rotulo).toBe("Tela 2")
    expect(p.telas[1]!.texto).toBe("72% vendido. Liberado para Airbnb. Venha conhecer de perto.")
  })

  it("🔥 GOTCHA REAL: marcador NO MEIO DA LINHA também quebra", () => {
    // copy real de produção: as duas telas na mesma linha
    const copy = "TELA 1: Vind. Obra avançando, rumo à entrega. TELA 2: Área de lazer já ganhando forma."
    const p = b(copy, "story")
    expect(p.telas).toHaveLength(2)
    expect(p.telas[0]!.texto).toBe("Vind. Obra avançando, rumo à entrega.")
    expect(p.telas[1]!.texto).toBe("Área de lazer já ganhando forma.")
  })

  it("no story não há legenda embaixo — o texto é DA tela", () => {
    expect(b("TELA 1: oi", "story").legenda).toBeNull()
  })
})

// 🔴 AC3 — o coração da story (ressalva (a) do @po).
describe("AC3 — a arte é de UMA tela só, e o preview não mente", () => {
  it("story de 2 telas: só a tela 1 tem arte", () => {
    const p = b("TELA 1: primeira. TELA 2: segunda.", "story")
    expect(p.telas.map((t) => t.temArte)).toEqual([true, false])
  })

  it("story de 3 telas: as duas últimas ficam SEM arte", () => {
    const p = b("TELA 1: a. TELA 2: b. TELA 3: c.", "story")
    expect(p.telas.map((t) => t.temArte)).toEqual([true, false, false])
  })

  it("post sem arte gerada: NENHUMA tela ganha arte", () => {
    const p = b("TELA 1: a. TELA 2: b.", "story", false)
    expect(p.telas.every((t) => !t.temArte)).toBe(true)
  })

  it("carrossel: a arte é a CAPA (card 1), os demais não têm", () => {
    const p = b("CARD 1: capa. CARD 2: dois. CARD 3: três.", "carrossel")
    expect(p.telas.map((t) => t.temArte)).toEqual([true, false, false])
  })
})

// Ressalva (c) do @po — perda silenciosa de conteúdo.
describe("nada de texto se perde (risco 2)", () => {
  it("texto ANTES do primeiro marcador é preservado como tela própria", () => {
    const p = b("Legenda geral aqui. TELA 1: primeira. TELA 2: segunda.", "story")
    expect(p.telas).toHaveLength(3)
    expect(p.telas[0]!.rotulo).toBeNull()
    expect(p.telas[0]!.texto).toBe("Legenda geral aqui.")
  })

  it("todo o texto original aparece em alguma tela", () => {
    for (const copy of [
      "TELA 1: um. TELA 2: dois.",
      "preambulo. TELA 1: um.",
      "sem marcador nenhum aqui",
      "TELA 1: só uma",
    ]) {
      const p = b(copy, "story")
      const junto = p.telas.map((t) => t.texto).join(" ")
      // cada palavra significativa do original tem que estar em alguma tela
      for (const palavra of copy.replace(/TELA\s*\d+\s*:/gi, " ").split(/\s+/).filter((w) => w.length > 2)) {
        expect(junto).toContain(palavra)
      }
    }
  })

  it("sem marcador: uma tela única com a copy inteira", () => {
    const p = b("Texto corrido sem marcador", "story")
    expect(p.telas).toHaveLength(1)
    expect(p.telas[0]!.rotulo).toBeNull()
    expect(p.telas[0]!.texto).toBe("Texto corrido sem marcador")
  })
})

describe("tolerância do marcador (risco 1)", () => {
  it("aceita minúscula, sem espaço, e outros separadores", () => {
    for (const copy of ["Tela 1) a Tela 2) b", "TELA1: a TELA2: b", "tela 1 - a tela 2 - b"]) {
      expect(b(copy, "story").telas).toHaveLength(2)
    }
  })

  it("numeração fora de ordem não reordena nem some", () => {
    const p = b("TELA 2: segunda. TELA 1: primeira.", "story")
    expect(p.telas.map((t) => t.rotulo)).toEqual(["Tela 2", "Tela 1"])
  })
})

describe("feed, reel e legado", () => {
  it("estatico (AC5): 4:5, uma peça, copy vira legenda", () => {
    const p = b("Legenda completa do feed #hashtag", "estatico")
    expect([p.tipo, p.aspecto]).toEqual(["feed", "4:5"])
    expect(p.telas).toHaveLength(1)
    expect(p.legenda).toBe("Legenda completa do feed #hashtag")
  })

  it("reel (AC6): sem arte, mostra o ROTEIRO e a legenda", () => {
    const p = b("Legenda do reel", "reel", true, "CENA 1: fachada\nCENA 2: piscina")
    expect(p.tipo).toBe("reel")
    expect(p.telas[0]!.rotulo).toBe("Roteiro")
    expect(p.telas[0]!.temArte).toBe(false) // vídeo é humano
    expect(p.legenda).toBe("Legenda do reel")
  })

  it("reel sem roteiro não inventa tela", () => {
    expect(b("só legenda", "reel").telas).toEqual([])
  })

  it("formato NULL (AC7): não quebra, trata como peça única 4:5", () => {
    const p = b("post legado sem formato", null)
    expect([p.tipo, p.aspecto]).toEqual(["indefinido", "4:5"])
    expect(p.telas).toHaveLength(1)
    expect(p.telas[0]!.temArte).toBe(true)
  })

  it("carrossel (AC4): 1:1 e a copy é a legenda embaixo", () => {
    const p = b("CARD 1: capa CARD 2: dois", "carrossel")
    expect(p.aspecto).toBe("1:1")
    expect(p.legenda).toContain("CARD 1")
  })
})

describe("entradas degeneradas", () => {
  it("copy vazia ou nula não gera tela e não quebra", () => {
    for (const c of ["", "   ", null]) {
      const p = b(c, "story")
      expect(p.telas).toEqual([])
      expect(p.legenda).toBeNull()
    }
  })
})

// Story 75-255 — decisão por formato (AC8).
describe("quantasArtes", () => {
  it("story: UMA POR TELA — o conserto da 75-255", () => {
    expect(quantasArtes("story", 1)).toBe(1)
    expect(quantasArtes("story", 2)).toBe(2)
    expect(quantasArtes("story", 3)).toBe(3)
  })

  it("story respeita o TETO — sem ele a rota estoura no meio e deixa arte órfã", () => {
    expect(quantasArtes("story", 8)).toBe(MAX_ARTES_POR_POST)
    expect(MAX_ARTES_POR_POST).toBe(3)
  })

  it("AC2 — carrossel gera SÓ A CAPA, mesmo com 7 cards", () => {
    expect(quantasArtes("carrossel", 7)).toBe(1)
  })

  it("AC2 — estatico 1, reel 0 (vídeo é humano)", () => {
    expect(quantasArtes("estatico", 1)).toBe(1)
    expect(quantasArtes("reel", 3)).toBe(0)
  })

  it("legado sem formato vira peça única (11 posts em produção)", () => {
    expect(quantasArtes(null, 5)).toBe(1)
  })

  it("story sem tela detectada ainda gera 1 — nunca zero por acidente", () => {
    expect(quantasArtes("story", 0)).toBe(1)
  })
})
