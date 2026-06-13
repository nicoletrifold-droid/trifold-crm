import { describe, it, expect } from "vitest"
import { injectUtmToHtml, type ImageVariant } from "./campaign-utm"

const img: ImageVariant = {
  variant_id: "abc-123",
  link_url: "https://trifold.eng.br/landing",
  image_url: "https://cdn.supabase.co/img.jpg",
}

describe("injectUtmToHtml", () => {
  it("adiciona ?utm_content quando link não tem query params", () => {
    const html = `<a href="https://trifold.eng.br/landing"><img src="x.jpg"/></a>`
    const result = injectUtmToHtml(html, [img])
    expect(result).toContain('href="https://trifold.eng.br/landing?utm_content=abc-123"')
  })

  it("adiciona &utm_content quando link já tem query params", () => {
    const variant = { ...img, link_url: "https://trifold.eng.br/landing?origem=email" }
    const html = `<a href="https://trifold.eng.br/landing?origem=email"><img/></a>`
    const result = injectUtmToHtml(html, [variant])
    expect(result).toContain("utm_content=abc-123")
    expect(result).toContain("origem=email")
  })

  it("retorna HTML inalterado quando lista de imagens está vazia", () => {
    const html = `<a href="https://trifold.eng.br/landing"><img/></a>`
    expect(injectUtmToHtml(html, [])).toBe(html)
  })

  it("não duplica utm_content se link já o contém", () => {
    const variant = {
      ...img,
      link_url: "https://trifold.eng.br/landing?utm_content=abc-123",
    }
    const html = `<a href="https://trifold.eng.br/landing?utm_content=abc-123"><img/></a>`
    const result = injectUtmToHtml(html, [variant])
    const count = (result.match(/utm_content/g) ?? []).length
    expect(count).toBe(1)
  })

  it("ignora imagens sem link_url", () => {
    const variant: ImageVariant = { variant_id: "x", link_url: null, image_url: "y.jpg" }
    const html = `<p>sem link</p>`
    expect(injectUtmToHtml(html, [variant])).toBe(html)
  })

  it("processa múltiplas variantes de imagem no mesmo HTML", () => {
    const img2: ImageVariant = {
      variant_id: "def-456",
      link_url: "https://trifold.eng.br/outra",
      image_url: "https://cdn.supabase.co/img2.jpg",
    }
    const html = [
      `<a href="https://trifold.eng.br/landing"><img/></a>`,
      `<a href="https://trifold.eng.br/outra"><img/></a>`,
    ].join("")
    const result = injectUtmToHtml(html, [img, img2])
    expect(result).toContain("utm_content=abc-123")
    expect(result).toContain("utm_content=def-456")
  })
})
