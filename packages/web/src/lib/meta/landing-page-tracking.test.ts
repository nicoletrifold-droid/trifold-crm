/**
 * Story 86-11 — a allowlist do bloco `tracking`.
 *
 * É a fronteira entre um corpo público e dois destinos sensíveis: o payload que
 * vai ao Meta e o JSONB `leads.metadata`. Um `lerTracking` permissivo deixaria
 * qualquer chamador com o token escrever chaves arbitrárias na ficha do lead.
 */
import { describe, it, expect } from "vitest"
import {
  lerTracking,
  eventIdValido,
  resolveLandingConfig,
  LANDING_CONFIGS,
  DEFAULT_LANDING_SLUG,
} from "./landing-page-tracking"

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

  // --- Story 86-12 (AC5.2) ---
  it("propaga `landing` quando presente, e o ignora quando ausente", () => {
    expect(lerTracking({ visitor_id: "v-1", landing: "yarden" })?.landing).toBe("yarden")
    expect(lerTracking({ visitor_id: "v-1" })?.landing).toBeUndefined()
  })

  it("propaga `landing` mesmo desconhecido — quem valida é resolveLandingConfig", () => {
    // Duas allowlists divergentes é pior que uma: `lerTracking` só sanitiza a
    // string; a decisão de o que ela significa é do `Record` fixo (AC5.3).
    expect(lerTracking({ landing: "empreendimento-que-nao-existe" })?.landing).toBe(
      "empreendimento-que-nao-existe",
    )
  })

  it("corta `landing` em 32 chars e descarta vazio/não-string", () => {
    expect(lerTracking({ landing: "y".repeat(80) })?.landing).toHaveLength(32)
    expect(lerTracking({ landing: "   " })).toBeUndefined()
    expect(lerTracking({ landing: 42 })).toBeUndefined()
  })

  it("`landing` sozinho já basta para o bloco existir", () => {
    // É o caso real do proxy do Yarden quando o browser tem ad-blocker: nada de
    // tracking, mas o CRM ainda precisa saber de qual landing veio.
    expect(lerTracking({ landing: "yarden" })).toEqual({ landing: "yarden" })
  })
})

/**
 * Story 86-12 (AC5) — o discriminador multi-landing.
 *
 * O risco que estes testes travam é de REGRESSÃO, não de feature nova: as três
 * constantes `LANDING_VIND_*` da 86-11 foram substituídas por este resolver, e a
 * landing do Vind Residence continua em produção SEM enviar `landing`. Se o
 * default mudar, todo evento dela troca de `content_category` em silêncio.
 */
describe("resolveLandingConfig — 86-12 AC5", () => {
  /** Valores byte a byte das constantes removidas da 86-11. */
  const VIND_86_11 = {
    contentCategory: "landing_vind_residence",
    contentName: "Landing Vind Residence",
    urlPadrao: "https://trifold.eng.br/vindresidence/",
  }

  it("sem slug devolve exatamente as três strings da 86-11 (não-regressão)", () => {
    // Os proxies do Vind Residence não mandam `landing` e não foram tocados.
    expect(resolveLandingConfig(undefined)).toEqual(VIND_86_11)
  })

  it("slug explícito 'vind_residence' devolve o mesmo (opcional, cosmético)", () => {
    expect(resolveLandingConfig("vind_residence")).toEqual(VIND_86_11)
  })

  it("'yarden' devolve a categoria, o nome e a URL próprios", () => {
    expect(resolveLandingConfig("yarden")).toEqual({
      contentCategory: "landing_yarden",
      contentName: "Landing Yarden",
      urlPadrao: "https://trifold.eng.br/yarden/",
    })
  })

  it("as duas landings NUNCA compartilham content_category", () => {
    // É a única separação entre os empreendimentos: o dataset Meta é o mesmo
    // (`1337310707164669`, decisão travada no AC1).
    const categorias = Object.values(LANDING_CONFIGS).map((c) => c.contentCategory)
    expect(new Set(categorias).size).toBe(categorias.length)
  })

  it("slug desconhecido cai no default em vez de lançar", () => {
    // Nunca quebrar a criação do lead por causa de telemetria (AC11).
    for (const invalido of ["algo-invalido", "", 42, null, undefined, {}, ["yarden"]]) {
      expect(resolveLandingConfig(invalido)).toEqual(LANDING_CONFIGS[DEFAULT_LANDING_SLUG])
    }
  })

  it("chave herdada do Object.prototype não vaza como config", () => {
    // `slug in LANDING_CONFIGS` aceitaria "constructor"/"toString" e devolveria
    // uma FUNÇÃO no lugar de uma config — `contentCategory` viria undefined e o
    // evento sairia sem categoria. Daí o `hasOwnProperty`.
    for (const herdada of ["constructor", "toString", "hasOwnProperty", "__proto__"]) {
      expect(resolveLandingConfig(herdada)).toEqual(LANDING_CONFIGS[DEFAULT_LANDING_SLUG])
    }
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
