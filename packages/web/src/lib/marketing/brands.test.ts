import { describe, expect, it } from "vitest"

import {
  BRAND_ASSET_EXTENSIONS,
  BRAND_SELECT,
  scopeBrandsForPost,
  arquivosCitadosNoTexto,
  resolvePaletaDoPost,
  MARKETING_BRAND_ASSET_TIPOS,
  brandAssetUploadBody,
  fonteAssetIds,
  isAllowedBrandAssetFile,
  mimeForBrandAssetFile,
  isValidBrandAssetTipo,
  validateBrandConsistency,
  validateMarketingBrandInput,
} from "./brands"

// Story 75-229 — Kit de Marcas: validação pura (padrão posts.test.ts)
describe("validateMarketingBrandInput", () => {
  const base = { nome: "Vind Residence", tipo: "empreendimento", property_id: "11111111-2222-3333-4444-555555555555" }

  it("POST válido normaliza cores {hex,nome} e fontes {papel,nome}", () => {
    const r = validateMarketingBrandInput(
      {
        ...base,
        cores: [{ hex: "#e8856a", nome: " Primária " }, { hex: " #FFF ", nome: "" }, { hex: "" }],
        fontes: [{ papel: " Título ", nome: " Montserrat " }, { papel: "", nome: "" }],
        voz_da_marca: "",
        diretrizes: null,
      },
      { partial: false }
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.cores).toEqual([
      { hex: "#E8856A", nome: "Primária" },
      { hex: "#FFF", nome: null },
    ])
    expect(r.value.fontes).toEqual([{ papel: "Título", nome: "Montserrat", asset_id: null }])
    expect(r.value.voz_da_marca).toBeNull()
    expect(r.value.diretrizes).toBeNull()
  })

  it("cores aceita formato v1 (strings) e converte", () => {
    const r = validateMarketingBrandInput({ ...base, cores: ["#e8856a"] }, { partial: false })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.cores).toEqual([{ hex: "#E8856A", nome: null }])
  })

  it("fonte com papel mas sem nome nem arquivo falha; papel vazio vira Geral", () => {
    const bad = validateMarketingBrandInput({ ...base, fontes: [{ papel: "Título", nome: "" }] }, { partial: false })
    expect(bad.ok).toBe(false)
    const ok = validateMarketingBrandInput({ ...base, fontes: [{ papel: "", nome: "Inter" }] }, { partial: false })
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.value.fontes).toEqual([{ papel: "Geral", nome: "Inter", asset_id: null }])
  })

  // Story 75-234 — upload do arquivo da fonte
  it("fonte SÓ com arquivo vale (nome deixa de ser obrigatório)", () => {
    const assetId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    const r = validateMarketingBrandInput(
      { ...base, fontes: [{ papel: "Título", nome: "", asset_id: assetId }] },
      { partial: false }
    )
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.fontes).toEqual([{ papel: "Título", nome: "", asset_id: assetId }])
  })

  it("asset_id não-uuid falha; linha 100% vazia é descartada", () => {
    const bad = validateMarketingBrandInput({ ...base, fontes: [{ papel: "T", nome: "Inter", asset_id: "x" }] }, { partial: false })
    expect(bad.ok).toBe(false)
    const ok = validateMarketingBrandInput({ ...base, fontes: [{ papel: "", nome: "", asset_id: null }] }, { partial: false })
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.value.fontes).toEqual([])
  })

  it("POST sem nome falha", () => {
    const r = validateMarketingBrandInput({ ...base, nome: "  " }, { partial: false })
    expect(r.ok).toBe(false)
  })

  it("tipo fora da whitelist falha", () => {
    const r = validateMarketingBrandInput({ ...base, tipo: "produto" }, { partial: false })
    expect(r.ok).toBe(false)
  })

  it("cor não-hex falha", () => {
    const r = validateMarketingBrandInput({ ...base, cores: [{ hex: "laranja", nome: null }] }, { partial: false })
    expect(r.ok).toBe(false)
  })

  it("PATCH parcial só devolve campos presentes", () => {
    const r = validateMarketingBrandInput({ cores: [{ hex: "#000", nome: "Fundo" }] }, { partial: true })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toEqual({ cores: [{ hex: "#000", nome: "Fundo" }] })
  })

  it("property_id vazio vira null; inválido falha", () => {
    const ok = validateMarketingBrandInput({ ...base, tipo: "institucional", property_id: "" }, { partial: false })
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.value.property_id).toBeNull()
    const bad = validateMarketingBrandInput({ ...base, property_id: "abc" }, { partial: false })
    expect(bad.ok).toBe(false)
  })
})

describe("validateBrandConsistency", () => {
  it("empreendimento exige property; institucional proíbe", () => {
    expect(validateBrandConsistency("empreendimento", null)).toBeTruthy()
    expect(validateBrandConsistency("empreendimento", "id")).toBeNull()
    expect(validateBrandConsistency("institucional", "id")).toBeTruthy()
    expect(validateBrandConsistency("institucional", null)).toBeNull()
  })
})

describe("isValidBrandAssetTipo", () => {
  it("whitelist logo/icone/foto/elemento/fonte", () => {
    expect(isValidBrandAssetTipo("logo")).toBe(true)
    expect(isValidBrandAssetTipo("icone")).toBe(true)
    expect(isValidBrandAssetTipo("foto")).toBe(true)
    expect(isValidBrandAssetTipo("elemento")).toBe(true)
    expect(isValidBrandAssetTipo("fonte")).toBe(true)
    expect(isValidBrandAssetTipo("video")).toBe(false)
  })
})

// Story 75-234 — a extensão é a barreira real (o mime vai canônico ao bucket)
describe("isAllowedBrandAssetFile", () => {
  it("imagem não aceita fonte e fonte não aceita imagem", () => {
    expect(isAllowedBrandAssetFile("logo", "marca.png")).toBe(true)
    expect(isAllowedBrandAssetFile("logo", "Montserrat.ttf")).toBe(false)
    expect(isAllowedBrandAssetFile("fonte", "Montserrat-SemiBold.TTF")).toBe(true)
    expect(isAllowedBrandAssetFile("fonte", "Inter.woff2")).toBe(true)
    expect(isAllowedBrandAssetFile("fonte", "arte.png")).toBe(false)
    expect(isAllowedBrandAssetFile("fonte", "fonte")).toBe(false)
  })

  it("ícone aceita imagem, não aceita fonte (75-235)", () => {
    expect(isAllowedBrandAssetFile("icone", "simbolo.svg")).toBe(true)
    expect(isAllowedBrandAssetFile("icone", "simbolo.png")).toBe(true)
    expect(isAllowedBrandAssetFile("icone", "Montserrat.ttf")).toBe(false)
  })

  it("jfif/jpe seguem aceitos como imagem (QA 75-234)", () => {
    expect(isAllowedBrandAssetFile("foto", "fachada.jfif")).toBe(true)
    expect(isAllowedBrandAssetFile("foto", "fachada.jpe")).toBe(true)
  })
})

describe("mimeForBrandAssetFile", () => {
  it("mime vem da extensão, não do navegador", () => {
    expect(mimeForBrandAssetFile("Montserrat.ttf")).toBe("font/ttf")
    expect(mimeForBrandAssetFile("Inter.WOFF2")).toBe("font/woff2")
    expect(mimeForBrandAssetFile("fachada.jfif")).toBe("image/jpeg")
    expect(mimeForBrandAssetFile("marca.svg")).toBe("image/svg+xml")
    expect(mimeForBrandAssetFile("planilha.xlsx")).toBeNull()
  })

  it("todo formato aceito tem mime canônico (nada cai em octet-stream)", () => {
    for (const tipo of MARKETING_BRAND_ASSET_TIPOS) {
      for (const ext of BRAND_ASSET_EXTENSIONS[tipo]) {
        expect(mimeForBrandAssetFile(`arquivo.${ext}`)).toBeTruthy()
      }
    }
  })
})

// Regressão do bug de 30/07: o Chrome manda .ttf como application/octet-stream e
// o SDK ignora `contentType` quando o corpo é File → o bucket recusava. O corpo
// enviado ao Storage precisa CARREGAR o mime canônico no próprio arquivo.
describe("brandAssetUploadBody", () => {
  it("fonte com mime do navegador errado é reembalada com o mime canônico", () => {
    const f = new File([new Uint8Array([1, 2, 3])], "Montserrat-Italic-VariableFont_wght.ttf", {
      type: "application/octet-stream",
    })
    const out = brandAssetUploadBody(f)
    expect(out.type).toBe("font/ttf")
    expect(out.name).toBe(f.name)
    expect(out.size).toBe(f.size)
  })

  it("fonte sem mime nenhum também sai com o canônico", () => {
    expect(brandAssetUploadBody(new File(["x"], "Inter.otf", { type: "" })).type).toBe("font/otf")
  })

  it("navegador já certo → devolve o MESMO arquivo (sem cópia)", () => {
    const f = new File(["x"], "logo.png", { type: "image/png" })
    expect(brandAssetUploadBody(f)).toBe(f)
  })

  it("extensão desconhecida → devolve o mesmo arquivo (a rota /sign recusa antes)", () => {
    const f = new File(["x"], "planilha.xlsx", { type: "application/octet-stream" })
    expect(brandAssetUploadBody(f)).toBe(f)
  })
})

describe("fonteAssetIds", () => {
  it("dedup e ignora nulos", () => {
    expect(
      fonteAssetIds([
        { papel: "T", nome: "A", asset_id: "id-1" },
        { papel: "C", nome: "B", asset_id: "id-1" },
        { papel: "L", nome: "C", asset_id: null },
        { papel: "X", nome: "D" },
      ])
    ).toEqual(["id-1"])
  })
})

// Story 75-238 — briefing por marca
describe("briefing (Story 75-238)", () => {
  it("BRAND_SELECT devolve o briefing — sem isso o modal abre vazio e o próximo Salvar APAGA o conteúdo em prod", () => {
    expect(BRAND_SELECT).toContain("briefing")
  })

  it("PATCH parcial sem briefing não devolve a chave (autosave de fontes não pode tocar no briefing)", () => {
    const r = validateMarketingBrandInput({ fontes: [{ papel: "T", nome: "Inter" }] }, { partial: true })
    expect(r.ok).toBe(true)
    if (r.ok) expect("briefing" in r.value).toBe(false)
  })

  it("briefing é validado como texto opcional e tem teto de tamanho", () => {
    const ok = validateMarketingBrandInput({ briefing: "  time desde 1997  " }, { partial: true })
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.value.briefing).toBe("time desde 1997")
    const vazio = validateMarketingBrandInput({ briefing: "   " }, { partial: true })
    expect(vazio.ok).toBe(true)
    if (vazio.ok) expect(vazio.value.briefing).toBeNull()
    const gigante = validateMarketingBrandInput({ briefing: "x".repeat(20_001) }, { partial: true })
    expect(gigante.ok).toBe(false)
  })
})

// Story 75-239 — escopo do Kit num post
describe("scopeBrandsForPost", () => {
  const inst = { tipo: "institucional", property_id: null, nome: "Trifold" }
  const vind = { tipo: "empreendimento", property_id: "prop-vind", nome: "Vind" }
  const yarden = { tipo: "empreendimento", property_id: "prop-yarden", nome: "Yarden" }
  const orfa = { tipo: "empreendimento", property_id: null, nome: "Órfã" }
  const all = [inst, vind, yarden, orfa]

  it("post de empreendimento = institucional + A marca dele (nunca as outras)", () => {
    expect(scopeBrandsForPost(all, "prop-vind").map((b) => b.nome)).toEqual(["Trifold", "Vind"])
  })

  it("post institucional = só a institucional", () => {
    expect(scopeBrandsForPost(all, null).map((b) => b.nome)).toEqual(["Trifold"])
  })

  it("marca de empreendimento SEM property (órfã) nunca entra — nem em post institucional", () => {
    expect(scopeBrandsForPost(all, "prop-yarden").some((b) => b.nome === "Órfã")).toBe(false)
    expect(scopeBrandsForPost(all, null).some((b) => b.nome === "Órfã")).toBe(false)
  })

  it("empreendimento sem marca própria = só a institucional", () => {
    expect(scopeBrandsForPost(all, "prop-sem-marca").map((b) => b.nome)).toEqual(["Trifold"])
  })
})

// Story 75-250 — regra única de paleta + referências que o humano citou.
describe("resolvePaletaDoPost (AC6)", () => {
  const VIND = { tipo: "empreendimento", cores: [{ hex: "#FFFFFF", nome: null }, { hex: "#8FE6A7", nome: null }] }
  const INST = { tipo: "institucional", cores: [{ hex: "#000000", nome: "Preto" }, { hex: "#F27A5E", nome: "Laranja" }] }

  it("paleta do empreendimento ganha da institucional", () => {
    expect(resolvePaletaDoPost([INST, VIND]).map((c) => c.hex)).toEqual(["#FFFFFF", "#8FE6A7"])
  })

  it("empreendimento SEM paleta cai para a institucional (o caso do Yarden)", () => {
    expect(resolvePaletaDoPost([INST, { tipo: "empreendimento", cores: [] }]).map((c) => c.hex)).toEqual(["#000000", "#F27A5E"])
    expect(resolvePaletaDoPost([INST, { tipo: "empreendimento", cores: null }]).map((c) => c.hex)).toHaveLength(2)
  })

  it("hex inválido é descartado; nada cadastrado → vazio (sem inventar)", () => {
    expect(resolvePaletaDoPost([{ tipo: "empreendimento", cores: [{ hex: 42 as unknown as string, nome: null }, { hex: "#8FE6A7", nome: null }] }])).toHaveLength(1)
    expect(resolvePaletaDoPost([])).toEqual([])
  })
})

describe("arquivosCitadosNoTexto (AC1/AC3)", () => {
  const KIT = [
    "VIND_RENDER_FACHADA_NOITE.png",
    "VIND_RENDER_FACHADA_DIA.png",
    "VIND_RENDER_PISCINA.png",
    "vind_logo_branco 7.png",
  ]

  it("acha os arquivos citados no pedido real do Marcos (o caso que falhou)", () => {
    const pedido =
      "Usa o render da fachada à noite e a piscina como apoio.\n" +
      "Arquivos: VIND_RENDER_FACHADA_NOITE.png, VIND_RENDER_PISCINA.png"
    expect(arquivosCitadosNoTexto(pedido, KIT)).toEqual([
      "VIND_RENDER_FACHADA_NOITE.png",
      "VIND_RENDER_PISCINA.png",
    ])
  })

  it("é case-insensitive e tolera pontuação em volta", () => {
    expect(arquivosCitadosNoTexto("usa (vind_render_piscina.PNG).", KIT)).toEqual(["VIND_RENDER_PISCINA.png"])
  })

  it("NÃO casa por fragmento — o falso positivo que o AC3 proíbe", () => {
    // 'VIND_RENDER_FACHADA' é prefixo de dois arquivos: não pode casar nenhum
    expect(arquivosCitadosNoTexto("quero VIND_RENDER_FACHADA", KIT)).toEqual([])
    // nome com espaço no meio só casa inteiro
    expect(arquivosCitadosNoTexto("usa vind_logo_branco 7.png", KIT)).toEqual(["vind_logo_branco 7.png"])
    expect(arquivosCitadosNoTexto("usa vind_logo_branco", KIT)).toEqual([])
  })

  it("texto vazio, nulo ou sem citação → lista vazia", () => {
    expect(arquivosCitadosNoTexto("", KIT)).toEqual([])
    expect(arquivosCitadosNoTexto(null, KIT)).toEqual([])
    expect(arquivosCitadosNoTexto("story bonito pro Vind", KIT)).toEqual([])
  })

  it("não duplica quando o mesmo arquivo aparece duas vezes", () => {
    expect(arquivosCitadosNoTexto("VIND_RENDER_PISCINA.png e de novo VIND_RENDER_PISCINA.png", KIT)).toEqual([
      "VIND_RENDER_PISCINA.png",
    ])
  })
})

// ─── Story 75-295 — rede de segurança: prédio inventado ─────────────────────
import { garantirFachadaNaCena, referenciasDeFachada } from "./brands"

describe("referenciasDeFachada (75-295)", () => {
  const assets = [
    { tipo: "logo", label: null, file_name: "logo.png" },
    { tipo: "elemento", label: "Fachada noite", file_name: "VIND_RENDER_NOITE.png" },
    { tipo: "foto", label: null, file_name: "piscina.jpg" },
    { tipo: "fonte", label: null, file_name: "Font.ttf" },
  ]

  it("prioriza o que se declara fachada por nome/label", () => {
    expect(referenciasDeFachada(assets)).toEqual(["VIND_RENDER_NOITE.png"])
  })

  it("sem 'fachada' declarada, cai para as fotos; fonte nunca entra", () => {
    const semFachada = assets.filter((a) => a.label !== "Fachada noite")
    expect(referenciasDeFachada(semFachada)).toEqual(["piscina.jpg"])
  })

  it("kit sem fachada nem foto = vazio", () => {
    expect(referenciasDeFachada([{ tipo: "logo", label: null, file_name: "logo.png" }])).toEqual([])
  })
})

describe("garantirFachadaNaCena (75-295)", () => {
  const assets = [
    { tipo: "foto", label: "Fachada", file_name: "fachada-vind.jpg" },
    { tipo: "logo", label: null, file_name: "logo.png" },
  ]

  it("cena com prédio sem referência de fachada → força as do Kit, NA FRENTE", () => {
    expect(garantirFachadaNaCena("obra do edifício ao entardecer, torre em destaque", ["logo.png"], assets)).toEqual([
      "fachada-vind.jpg",
      "logo.png",
    ])
  })

  it("cena sem prédio → lista intocada", () => {
    expect(garantirFachadaNaCena("família na piscina ao pôr do sol", [], assets)).toEqual([])
  })

  it("referência de fachada já presente → não duplica", () => {
    expect(garantirFachadaNaCena("fachada iluminada", ["fachada-vind.jpg"], assets)).toEqual(["fachada-vind.jpg"])
  })

  it("kit sem fachada disponível → lista intocada (o prompt cuida da cena)", () => {
    expect(garantirFachadaNaCena("prédio ao entardecer", [], [{ tipo: "logo", label: null, file_name: "logo.png" }])).toEqual([])
  })
})
