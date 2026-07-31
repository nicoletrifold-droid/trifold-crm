import { describe, expect, it } from "vitest"

import { temLink, tokenizeLinks } from "./linkify"

// Story 75-252 — tokenização de URL no texto da mensagem. PURA (AC7).
const links = (t: string) => tokenizeLinks(t).filter((s) => s.tipo === "link")
const texto = (t: string) =>
  tokenizeLinks(t)
    .map((s) => s.valor)
    .join("")

describe("tokenizeLinks — o caso do Marcos", () => {
  it("link que o lead manda no meio da frase vira link, e o resto continua texto", () => {
    const t = "Oi, vi esse aqui https://www.vivareal.com.br/imovel/123 o que acha?"
    const segs = tokenizeLinks(t)
    expect(segs.map((s) => s.tipo)).toEqual(["texto", "link", "texto"])
    expect(segs[1]).toMatchObject({
      tipo: "link",
      valor: "https://www.vivareal.com.br/imovel/123",
      href: "https://www.vivareal.com.br/imovel/123",
    })
  })

  it("nada é perdido: concatenar os segmentos devolve o texto original", () => {
    for (const t of [
      "Oi, vi https://x.com/a o que acha?",
      "sem link nenhum aqui",
      "https://x.com/a no começo",
      "no fim https://x.com/a",
      "dois https://a.com e https://b.com juntos",
      "",
    ]) {
      expect(texto(t)).toBe(t)
    }
  })

  it("múltiplos links na mesma mensagem", () => {
    expect(links("veja https://a.com e também www.b.com.br agora")).toHaveLength(2)
  })
})

// 🔒 AC3 — a parte que importa: texto de terceiro.
describe("segurança de esquema (AC3)", () => {
  it("javascript: NÃO vira link", () => {
    const t = "clica aqui javascript:alert(document.cookie)"
    expect(links(t)).toHaveLength(0)
    expect(texto(t)).toBe(t)
  })

  it("data:, vbscript:, file: NÃO viram link", () => {
    for (const t of [
      "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
    ]) {
      expect(links(t)).toHaveLength(0)
    }
  })

  it("payload de XSS clássico atravessa como TEXTO, nunca como link", () => {
    const t = `<script>alert('xss')</script> e <img src=x onerror=alert(1)>`
    expect(links(t)).toHaveLength(0)
    expect(texto(t)).toBe(t) // o React escapa na renderização; aqui nada é interpretado
  })

  it("javascript: DISFARÇADO dentro de uma URL http não escapa do http", () => {
    const segs = links("https://x.com/?next=javascript:alert(1)")
    expect(segs).toHaveLength(1)
    expect(segs[0]!.tipo === "link" && segs[0]!.href.startsWith("https://")).toBe(true)
  })
})

describe("www. sem esquema (AC4)", () => {
  it("href ganha https://, mas o texto exibido continua o que a pessoa escreveu", () => {
    const s = links("acessa www.trifold.eng.br")[0]!
    expect(s.tipo === "link" && s.valor).toBe("www.trifold.eng.br")
    expect(s.tipo === "link" && s.href).toBe("https://www.trifold.eng.br/")
  })
})

describe("pontuação e parênteses (AC6)", () => {
  it("ponto final da frase não entra no link", () => {
    const s = links("veja https://x.com/a.")[0]!
    expect(s.tipo === "link" && s.valor).toBe("https://x.com/a")
    expect(texto("veja https://x.com/a.")).toBe("veja https://x.com/a.")
  })

  it("vírgula, ponto-e-vírgula, exclamação e interrogação também não", () => {
    for (const [entrada, esperado] of [
      ["https://x.com/a,", "https://x.com/a"],
      ["https://x.com/a!", "https://x.com/a"],
      ["https://x.com/a?", "https://x.com/a"],
      ["https://x.com/a;", "https://x.com/a"],
    ] as const) {
      expect((links(entrada)[0] as { valor: string }).valor).toBe(esperado)
    }
  })

  it("parêntese de fechar não entra quando é da frase", () => {
    const s = links("(veja https://x.com/a)")[0]!
    expect(s.tipo === "link" && s.valor).toBe("https://x.com/a")
  })

  it("parêntese BALANCEADO entra, porque é parte da URL", () => {
    const s = links("https://pt.wikipedia.org/wiki/Curitiba_(cidade)")[0]!
    expect(s.tipo === "link" && s.valor).toBe("https://pt.wikipedia.org/wiki/Curitiba_(cidade)")
  })

  it("query string com = e & sobrevive inteira", () => {
    const s = links("https://x.com/b?a=1&b=2#topo fim")[0]!
    expect(s.tipo === "link" && s.valor).toBe("https://x.com/b?a=1&b=2#topo")
  })
})

// Risco 1 da story: detecção conservadora de propósito.
describe("falso positivo (risco 1)", () => {
  it("nome de arquivo NÃO vira link", () => {
    expect(links("manda o arquivo.pdf por favor")).toHaveLength(0)
    expect(links("VIND_RENDER_FACHADA.png")).toHaveLength(0)
  })

  it("domínio escrito sem esquema e sem www NÃO vira link", () => {
    expect(links("acessa trifold.eng.br")).toHaveLength(0)
  })

  it("frase com ponto entre palavras não vira link", () => {
    expect(links("ok.vou ver isso hoje")).toHaveLength(0)
  })
})

describe("temLink", () => {
  it("responde certo para os dois casos", () => {
    expect(temLink("oi https://x.com")).toBe(true)
    expect(temLink("oi tudo bem")).toBe(false)
    expect(temLink("")).toBe(false)
  })
})

describe("entradas degeneradas", () => {
  it("null/undefined/vazio não quebram", () => {
    expect(tokenizeLinks("")).toEqual([])
    expect(tokenizeLinks(undefined as unknown as string)).toEqual([])
    expect(tokenizeLinks(null as unknown as string)).toEqual([])
  })

  it("quebra de linha é preservada no segmento de texto (AC8)", () => {
    const t = "linha 1\nlinha 2 https://x.com\nlinha 3"
    expect(texto(t)).toBe(t)
    expect(links(t)).toHaveLength(1)
  })
})
