/**
 * Story 86-11 — a allowlist do bloco `tracking`.
 *
 * É a fronteira entre um corpo público e dois destinos sensíveis: o payload que
 * vai ao Meta e o JSONB `leads.metadata`. Um `lerTracking` permissivo deixaria
 * qualquer chamador com o token escrever chaves arbitrárias na ficha do lead.
 */
import { describe, it, expect } from "vitest"
import { lerTracking, eventIdValido } from "./landing-page-tracking"

describe("lerTracking — allowlist", () => {
  it("mantém só as chaves conhecidas", () => {
    const t = lerTracking({
      event_id: "11111111-1111-4111-8111-111111111111",
      complete_registration_event_id: "22222222-2222-4222-8222-222222222222",
      visitor_id: "v-1",
      fbc: "fb.1.1.c",
      fbp: "fb.1.1.p",
      fbclid: "IwAR1",
      client_ip: "187.1.2.3",
      client_ua: "Mozilla/5.0",
      page_url: "https://trifold.eng.br/vindresidence/",
      // Tudo abaixo tem que sumir.
      qualification_score: 100,
      raw_fields: { cpf: "000.000.000-00" },
      nome: "Maria",
    })

    expect(Object.keys(t!).sort()).toEqual([
      "client_ip",
      "client_ua",
      "complete_registration_event_id",
      "event_id",
      "fbc",
      "fbclid",
      "fbp",
      "page_url",
      "visitor_id",
    ])
    expect(JSON.stringify(t)).not.toContain("Maria")
    expect(JSON.stringify(t)).not.toContain("000.000.000")
  })

  it("devolve undefined para corpo que não é objeto útil (AC10)", () => {
    for (const invalido of [undefined, null, "texto", 42, [], {}, { nome: "Maria" }]) {
      expect(lerTracking(invalido)).toBeUndefined()
    }
  })

  it("descarta strings vazias e corta valores absurdamente longos", () => {
    const t = lerTracking({
      fbp: "   ",
      client_ua: "U".repeat(2000),
      visitor_id: "v-1",
    })
    expect(t?.fbp).toBeUndefined()
    expect(t?.client_ua).toHaveLength(512)
    expect(t?.visitor_id).toBe("v-1")
  })

  it("ignora valores que não são string (número, objeto, array)", () => {
    const t = lerTracking({ event_id: 12345, fbp: { a: 1 }, fbc: ["x"], visitor_id: "v-1" })
    expect(t).toEqual({ visitor_id: "v-1" })
  })
})

describe("eventIdValido", () => {
  it("aceita UUID e o fallback do helper vanilla da landing", () => {
    expect(eventIdValido("11111111-1111-4111-8111-111111111111")).toBe(true)
    // Navegador sem `crypto.randomUUID` (contexto inseguro / versão antiga):
    // recusar aqui descartaria em silêncio os eventos mais frágeis do funil.
    expect(eventIdValido("e-m3k9x1p-a7f2b9c1")).toBe(true)
  })

  it("recusa vazio, curto demais, longo demais e não-string", () => {
    for (const invalido of ["", "curto", "x".repeat(65), undefined, null, 123, {}]) {
      expect(eventIdValido(invalido)).toBe(false)
    }
  })

  it("recusa caracteres que não pertencem a um id (injeção em log/URL)", () => {
    expect(eventIdValido("abc def12")).toBe(false)
    expect(eventIdValido("abc/../12")).toBe(false)
    expect(eventIdValido("<script>x</script>")).toBe(false)
  })
})
