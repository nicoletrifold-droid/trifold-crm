import { describe, expect, it } from "vitest"

import { faixaLayout } from "./arte-faixa"
import { arteFileExtension, aspectRatioForFormato, buildArtePrompt, selectArteReferencias } from "./arte-gen"

// Story 75-240 — helpers puros do motor de arte
describe("aspectRatioForFormato", () => {
  it("story 9:16, estático 4:5, carrossel 1:1, reel não gera", () => {
    expect(aspectRatioForFormato("story")).toBe("9:16")
    expect(aspectRatioForFormato("estatico")).toBe("4:5")
    expect(aspectRatioForFormato("carrossel")).toBe("1:1")
    expect(aspectRatioForFormato("reel")).toBeNull()
  })
})

describe("buildArtePrompt", () => {
  const base = {
    descricao: "Fundo verde escuro, título 'Entrega em abril de 2027'",
    formato: "story" as const,
    marca: "Vind Residence",
    cores: [{ hex: "#11220F", nome: "Fundo" }, { hex: "#8FE6A7", nome: null }],
    fontes: ["Montserrat"],
  }

  it("carrega marca, direção, paleta com hex, tipografia e regras de PT", () => {
    const p = buildArtePrompt(base)
    expect(p).toContain("Vind Residence")
    expect(p).toContain("Entrega em abril de 2027")
    expect(p).toContain("#11220F (Fundo)")
    expect(p).toContain("#8FE6A7")
    expect(p).toContain("Montserrat")
    expect(p).toContain("português do Brasil PERFEITO")
  })

  // 75-244: 1ª leva de artes saiu quase toda preta com CTA em cinza miúdo.
  // 75-248 SUPERSEDE a regra de CTA: pedir "peso visual" gerou botão
  // desproporcional, então o CTA saiu do modelo e virou composição
  // (arte-cta.ts). Contraste segue; a proibição de moldura foi ENDURECIDA
  // porque o modelo a ignorou uma vez.
  it("exige contraste e proíbe moldura/forma solta — sem mais instruir CTA", () => {
    const p = buildArtePrompt(base)
    expect(p).toContain("CONTRASTE (obrigatório)")
    expect(p).toContain("nunca cinza sobre fundo escuro")
    expect(p).toContain("NÃO pode ser quase toda preta")
    expect(p).toContain("PROIBIDO — sem exceção")
    expect(p).toContain("Espaço vazio permanece vazio")
    // não instruímos mais o modelo a desenhar CTA
    expect(p).not.toContain("CTA (obrigatório)")
  })

  // 75-246 (logo) + 75-248 (CTA): os dois são compostos, o modelo não desenha
  // nenhum, e a zona reservada cresceu de 15% para 25% para caber os dois.
  it("proíbe desenhar logo E CTA e exige o quarto inferior limpo", () => {
    const p = buildArtePrompt(base)
    expect(p).toContain("LOGO E CTA — NÃO DESENHE")
    expect(p).toContain("É PROIBIDO desenhar o logo")
    expect(p).toContain("botão, pílula ou qualquer texto de call-to-action")
    expect(p).toContain("ÁREA RESERVADA (obrigatório)")
    expect(p).toContain("últimos 25% da altura")
    // instruções antigas não podem ter sobrado
    expect(p).not.toContain("aplicá-lo discreto e nítido")
    expect(p).not.toContain("últimos 15% da altura")
  })

  it("as regras valem em todos os formatos com imagem", () => {
    for (const formato of ["story", "estatico", "carrossel"] as const) {
      const p = buildArtePrompt({ ...base, formato })
      expect(p).toContain("CONTRASTE (obrigatório)")
      expect(p).toContain("LOGO E CTA — NÃO DESENHE")
      expect(p).toContain("ÁREA RESERVADA (obrigatório)")
    }
  })

  it("ajuste do humano vem DEPOIS das regras — prioridade máxima de verdade", () => {
    const p = buildArtePrompt({ ...base, ajuste: "deixa bem escuro, quero clima noturno" })
    expect(p.indexOf("AJUSTE PEDIDO PELO HUMANO")).toBeGreaterThan(p.indexOf("CONTRASTE (obrigatório)"))
  })

  it("ajuste do humano entra com prioridade máxima; sem cores/fontes não imprime seções vazias", () => {
    const p = buildArtePrompt({ ...base, cores: [], fontes: [], ajuste: "menos texto" })
    expect(p).toContain("AJUSTE PEDIDO PELO HUMANO (prioridade máxima): menos texto")
    expect(p).not.toContain("PALETA OBRIGATÓRIA")
    expect(p).not.toContain("TIPOGRAFIA")
    const sem = buildArtePrompt({ ...base, ajuste: "  " })
    expect(sem).not.toContain("AJUSTE PEDIDO")
  })

  // ─── Story 75-256 — faixa composta ────────────────────────────────────────

  describe("com faixa composta (fracaoReservada)", () => {
    const comFaixa = { ...base, fracaoReservada: 0.3242 }

    it("AC7 — proíbe TODO texto, não só logo e CTA", () => {
      const p = buildArtePrompt(comFaixa)
      expect(p).toContain("A ARTE NÃO TEM TEXTO")
      expect(p).toContain("sem título, sem subtítulo")
      expect(p).toContain("sem número, sem data, sem selo")
      expect(p).toContain("será COBERTO")
    })

    it("AC6 — imprime a fração recebida, arredondada, e não o 25% fixo", () => {
      const p = buildArtePrompt(comFaixa)
      expect(p).toContain("os últimos 32% da altura")
      expect(p).toContain("apenas os 68% de cima")
      expect(p).not.toContain("últimos 25% da altura")
      expect(p).not.toContain("ÁREA RESERVADA (obrigatório)")
    })

    it("troca CONTRASTE por LUZ — instruir contraste de texto perdeu objeto", () => {
      const p = buildArtePrompt(comFaixa)
      expect(p).toContain("LUZ (obrigatório)")
      expect(p).not.toContain("CONTRASTE (obrigatório)")
      expect(p).not.toContain("posicione o título")
      // a parte que continua valendo
      expect(p).toContain("área luminosa de verdade")
    })

    it("AC9 — sem fração, o prompt é EXATAMENTE o de antes", () => {
      const antes = buildArtePrompt(base)
      expect(buildArtePrompt({ ...base, fracaoReservada: null })).toBe(antes)
      expect(buildArtePrompt({ ...base, fracaoReservada: 0 })).toBe(antes)
      expect(antes).toContain("ÁREA RESERVADA (obrigatório)")
      expect(antes).toContain("CONTRASTE (obrigatório)")
      expect(antes).not.toContain("A ARTE NÃO TEM TEXTO")
    })

    it("a proibição de logo/CTA e a de moldura seguem valendo nos dois modos", () => {
      for (const p of [buildArtePrompt(base), buildArtePrompt(comFaixa)]) {
        expect(p).toContain("LOGO E CTA — NÃO DESENHE")
        expect(p).toContain("Espaço vazio permanece vazio")
      }
    })
  })
})

/**
 * Story 75-256, AC6 — o teste que impede a divergência que ESTA story existe
 * para fechar: a fração dita ao modelo tem de ser a que a faixa cobre. Se
 * alguém mexer na PILHA de `arte-faixa.ts` e não no prompt (ou o contrário),
 * isto quebra.
 */
describe("prompt × faixa — fonte única da fração (AC6)", () => {
  it("a fração impressa no prompt é a que o faixaLayout devolve", () => {
    for (const [ar, w, h] of [
      ["9:16", 1080, 1920],
      ["4:5", 1080, 1350],
      ["1:1", 1080, 1080],
    ] as const) {
      const layout = faixaLayout(ar, w, h, { temSubtitulo: true, temCta: true })
      const formato = ar === "9:16" ? "story" : ar === "4:5" ? "estatico" : "carrossel"
      const p = buildArtePrompt({
        descricao: "cena",
        formato,
        marca: "Vind",
        cores: [{ hex: "#11220F", nome: null }],
        fontes: [],
        fracaoReservada: layout.fracaoReservada,
      })
      const pct = Math.round(layout.fracaoReservada * 100)
      expect(p, `${ar}`).toContain(`os últimos ${pct}% da altura`)
      expect(p, `${ar}`).toContain(`apenas os ${100 - pct}% de cima`)
    }
  })
})

describe("arteFileExtension", () => {
  it("mapeia mime → extensão com fallback png", () => {
    expect(arteFileExtension("image/png")).toBe("png")
    expect(arteFileExtension("image/jpeg")).toBe("jpg")
    expect(arteFileExtension("image/webp")).toBe("webp")
    expect(arteFileExtension("application/octet-stream")).toBe("png")
  })
})

// QA 75-240 #5 — seleção de referências extraída como função pura
describe("selectArteReferencias", () => {
  const a = (brand_id: string, tipo: string, file_name: string) => ({ brand_id, tipo, file_name, file_url: `https://x/${file_name}` })
  const VIND = "b-vind"
  const INST = "b-inst"

  it("logo da identidade entra PRIMEIRO, mesmo com 4 fotos citadas (QA #3)", () => {
    const assets = [
      a(VIND, "logo", "logo.png"),
      a(VIND, "foto", "f1.jpg"), a(VIND, "foto", "f2.jpg"), a(VIND, "foto", "f3.jpg"), a(VIND, "foto", "f4.jpg"),
    ]
    const r = selectArteReferencias(assets, [VIND, INST], ["f1.jpg", "f2.jpg", "f3.jpg", "f4.jpg"])
    expect(r[0]!.file_name).toBe("logo.png")
    expect(r).toHaveLength(4) // logo + 3 fotos (a 4ª citada fica de fora)
  })

  it("fonte (.ttf) nunca gasta slot (QA #7); dedup por file_name", () => {
    const assets = [a(VIND, "fonte", "Montserrat.ttf"), a(VIND, "foto", "f1.jpg"), a(VIND, "foto", "f1.jpg")]
    const r = selectArteReferencias(assets, [VIND], ["Montserrat.ttf", "f1.jpg", "f1.jpg"])
    expect(r.map((x) => x.file_name)).toEqual(["f1.jpg"])
  })

  it("empate de file_name entre marcas resolve pela prioridade (QA #10)", () => {
    const assets = [a(INST, "logo", "logo.png"), a(VIND, "logo", "logo.png")]
    const r = selectArteReferencias(assets, [VIND, INST], [])
    expect(r).toHaveLength(1)
    expect(r[0]!.brand_id).toBe(VIND)
  })

  it("sem marca do empreendimento, logo institucional entra; ícone complementa", () => {
    const assets = [a(INST, "logo", "trifold.png"), a(INST, "icone", "pomba.png")]
    const r = selectArteReferencias(assets, [INST], [])
    expect(r.map((x) => x.file_name)).toEqual(["trifold.png", "pomba.png"])
  })
})
