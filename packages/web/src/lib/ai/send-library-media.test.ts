import { describe, it, expect } from "vitest"
import {
  detectMediaRequest,
  detectMaterialRequest,
  selectAssets,
  MAX_MEDIA_PER_TURN,
  type MediaAsset,
} from "./send-library-media"

// Acervo espelhando o Vind Residence (pós-curadoria 2026-07-10): 1 planta real,
// 1 fachada, e lazer/localização em `outro` com título descritivo.
const VIND: MediaAsset[] = [
  { id: "planta", title: "Planta", category: "planta", file_url: "u", file_name: "planta.png", file_type: "image" },
  { id: "fachada", title: "Fachada", category: "fachada", file_url: "u", file_name: "fachada.jpg", file_type: "image" },
  { id: "academia", title: "Academia", category: "outro", file_url: "u", file_name: "academia.png", file_type: "image" },
  { id: "brinquedoteca", title: "Brinquedoteca", category: "outro", file_url: "u", file_name: "brinq.png", file_type: "image" },
  { id: "pilates", title: "Pilates", category: "outro", file_url: "u", file_name: "pilates.png", file_type: "image" },
  { id: "piscina", title: "Piscina", category: "outro", file_url: "u", file_name: "piscina.png", file_type: "image" },
  { id: "localizacao", title: "Localização", category: "outro", file_url: "u", file_name: "local.png", file_type: "image" },
]

describe("detectMediaRequest", () => {
  it("AC1 — caso Carlos: pedido educado/implícito dispara", () => {
    // A frase exata que NÃO disparava na Story 75-17.
    const kinds = detectMediaRequest("Se possível mais fotos, metragem e valor.")
    expect(kinds).toContain("generic") // "mais" + "fotos"
    expect(kinds).toContain("planta") // "metragem"
    expect(kinds).toContain("tabela") // "valor"
  })

  it("AC2 — casa tipos específicos", () => {
    expect(detectMediaRequest("me manda a planta?")).toContain("planta")
    expect(detectMediaRequest("como é a fachada do prédio")).toContain("fachada")
    expect(detectMediaRequest("qual a tabela de valores")).toContain("tabela")
    expect(detectMediaRequest("tem foto da piscina?")).toContain("lazer")
    expect(detectMediaRequest("onde fica o empreendimento?")).toContain("localizacao")
  })

  it("tipos específicos disparam mesmo sem verbo de comando", () => {
    expect(detectMediaRequest("e a planta?")).toEqual(["planta"])
    expect(detectMediaRequest("area de lazer")).toEqual(["lazer"])
  })

  it("generic exige sinal de pedido (evita falso positivo)", () => {
    expect(detectMediaRequest("recebi as fotos, obrigado")).toEqual([])
    expect(detectMediaRequest("gostei das fotos")).toEqual([]) // sem sinal de pedido
    expect(detectMediaRequest("pode me mandar as fotos")).toContain("generic")
  })

  it("guarda de negação / já recebido", () => {
    expect(detectMediaRequest("não quero fotos agora")).toEqual([])
    expect(detectMediaRequest("já vi a planta, obrigado")).toEqual([])
    expect(detectMediaRequest("sem fotos por enquanto")).toEqual([])
  })

  it("texto vazio/irrelevante não dispara", () => {
    expect(detectMediaRequest("")).toEqual([])
    expect(detectMediaRequest(null)).toEqual([])
    expect(detectMediaRequest("bom dia, tudo bem?")).toEqual([])
    expect(detectMediaRequest("[Mensagem de voz recebida]")).toEqual([])
  })
})

describe("selectAssets", () => {
  it("AC3 — pedido genérico vira combo curado (fachada + lazer + planta)", () => {
    const chosen = selectAssets(VIND, ["generic"])
    const ids = chosen.map((a) => a.id)
    expect(ids).toContain("fachada")
    expect(ids).toContain("planta")
    // um item de lazer (o primeiro por ordem determinística: Academia)
    expect(ids.some((id) => ["academia", "brinquedoteca", "pilates", "piscina"].includes(id))).toBe(true)
    expect(chosen.length).toBe(3)
  })

  it("AC4 — nunca ultrapassa o teto", () => {
    const chosen = selectAssets(VIND, ["planta", "fachada", "lazer", "localizacao", "generic"])
    expect(chosen.length).toBeLessThanOrEqual(MAX_MEDIA_PER_TURN)
  })

  it("AC2 — pedido específico traz o asset certo", () => {
    expect(selectAssets(VIND, ["planta"]).map((a) => a.id)).toEqual(["planta"])
    expect(selectAssets(VIND, ["localizacao"]).map((a) => a.id)).toEqual(["localizacao"])
    expect(selectAssets(VIND, ["lazer"]).length).toBe(1)
  })

  it("caso Carlos completo → planta + fachada + lazer (tabela inexistente é ignorada)", () => {
    const kinds = detectMediaRequest("Se possível mais fotos, metragem e valor.")
    const chosen = selectAssets(VIND, kinds)
    const ids = chosen.map((a) => a.id)
    expect(chosen.length).toBe(3)
    expect(ids).toContain("planta")
    expect(ids).toContain("fachada")
    expect(ids.some((id) => ["academia", "brinquedoteca", "pilates", "piscina"].includes(id))).toBe(true)
  })

  it("AC7 — não reenvia asset já enviado", () => {
    const chosen = selectAssets(VIND, ["planta"], new Set(["planta"]))
    expect(chosen).toEqual([]) // única planta já foi enviada
  })

  it("não repete o mesmo asset entre tipos", () => {
    const chosen = selectAssets(VIND, ["planta", "planta"])
    expect(chosen.length).toBe(1)
  })

  it("degrada com acervo vazio", () => {
    expect(selectAssets([], ["generic"])).toEqual([])
  })

  it("é determinístico independentemente da ordem de entrada", () => {
    const a = selectAssets(VIND, ["generic"]).map((x) => x.id)
    const b = selectAssets([...VIND].reverse(), ["generic"]).map((x) => x.id)
    expect(a).toEqual(b)
  })
})

describe("detectMaterialRequest (compat 75-17)", () => {
  it("mantém a semântica de tipo único", () => {
    expect(detectMaterialRequest("me manda a planta")).toBe("planta")
    expect(detectMaterialRequest("tabela de valores")).toBe("tabela")
    expect(detectMaterialRequest("pode mandar fotos")).toBe("qualquer")
    expect(detectMaterialRequest("bom dia")).toBe(null)
  })
})
