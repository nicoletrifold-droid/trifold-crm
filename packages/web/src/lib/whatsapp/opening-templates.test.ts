/**
 * Story 75-217 — múltiplos templates de abertura.
 * Cobre: resolução de variáveis por template, render do corpo (preview/espelho)
 * e filtragem da listagem da Meta (só APROVADO + prefixo + conhecido no mapa).
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import {
  resolveOpeningParams,
  renderOpeningBody,
  listApprovedOpeningTemplates,
} from "./opening-templates"

const ctx = { nomeLead: "Carina", corretor: "Robson Silva", empreendimento: "Yarden" }

describe("resolveOpeningParams", () => {
  it("template original: nome, corretor e empreendimento na ordem", () => {
    expect(resolveOpeningParams("abertura_atendimento_corretor", ctx)).toEqual([
      "Carina",
      "Robson Silva",
      "Yarden",
    ])
  })

  it("templates novos: só o nome do lead", () => {
    expect(resolveOpeningParams("abertura_interesse_prioridades", ctx)).toEqual(["Carina"])
    expect(resolveOpeningParams("abertura_interesse_status", ctx)).toEqual(["Carina"])
    expect(resolveOpeningParams("abertura_basica", ctx)).toEqual(["Carina"])
  })

  it("template desconhecido → null", () => {
    expect(resolveOpeningParams("qualquer_outro", ctx)).toBe(null)
  })
})

describe("renderOpeningBody", () => {
  it("substitui {{1}}, {{2}}… posicionalmente", () => {
    expect(renderOpeningBody("Oi {{1}}! Aqui é {{2}}.", ["Carina", "Robson"])).toBe(
      "Oi Carina! Aqui é Robson.",
    )
  })

  it("placeholder sem valor vira vazio (nunca vaza {{n}})", () => {
    expect(renderOpeningBody("Oi {{1}}{{9}}!", ["Carina"])).toBe("Oi Carina!")
  })
})

describe("listApprovedOpeningTemplates", () => {
  afterEach(() => vi.unstubAllGlobals())

  function stubMeta(data: unknown[]) {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data }), { status: 200 })))
  }

  it("filtra: só APROVADO, prefixo abertura_, pt_BR e conhecido no mapa; ordena pela ordem do mapa", async () => {
    stubMeta([
      { name: "abertura_interesse_status", status: "APPROVED", language: "pt_BR", components: [{ type: "BODY", text: "B" }] },
      { name: "abertura_interesse_prioridades", status: "PENDING", language: "pt_BR", components: [{ type: "BODY", text: "A" }] },
      { name: "abertura_atendimento_corretor", status: "APPROVED", language: "pt_BR", components: [{ type: "BODY", text: "C" }] },
      { name: "abertura_de_outro_time", status: "APPROVED", language: "pt_BR", components: [{ type: "BODY", text: "X" }] },
      { name: "relatorio_diario_diretor", status: "APPROVED", language: "pt_BR", components: [{ type: "BODY", text: "Y" }] },
      { name: "abertura_interesse_status", status: "APPROVED", language: "en_US", components: [{ type: "BODY", text: "Z" }] },
    ])

    const out = await listApprovedOpeningTemplates("waba-1", "token")
    expect(out.map((t) => t.name)).toEqual([
      "abertura_atendimento_corretor",
      "abertura_interesse_status",
    ])
    expect(out.find((t) => t.name === "abertura_interesse_status")?.body).toBe("B")
  })

  it("erro HTTP da Meta → lança (rota converte em 502)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })))
    await expect(listApprovedOpeningTemplates("waba-1", "token")).rejects.toThrow("Graph API templates 500")
  })
})
