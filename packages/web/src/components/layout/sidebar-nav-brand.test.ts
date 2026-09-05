/**
 * Story 900-64 (AC2/AC4) — o carrasco da DECISÃO de marca.
 *
 * Este arquivo mede a função pura. O caso `imgFailed: true` só existe aqui: o harness de
 * `sidebar-nav.test.ts` usa `renderToStaticMarkup`, que não executa handler de evento, e o mock de
 * `next/image` de lá descarta `onError`. A FIAÇÃO (`onError` ⇒ `setImgFailed` ⇒ esta função)
 * continua **sem carrasco automatizado** — lacuna nomeada na AC4, conferida à mão na tela.
 *
 * Os valores esperados são LITERAIS, não as constantes exportadas pelo módulo. Montar o esperado a
 * partir da constante que se testa faz a régua concordar com qualquer troca do asset — ela deixaria
 * de reprovar a fonte.
 */

import { describe, it, expect } from "vitest"
import { resolveSidebarBrand } from "./sidebar-nav-brand"

const URL_DO_LOGO =
  "https://xnxvygyfyyyzwhiuoehz.supabase.co/storage/v1/object/public/org-logos/aurora/logo.png?v=0123456789abcdef"

const MARCA_DA_TRIFOLD = { src: "/logo-trifold.webp", alt: "Trifold", isCustom: false }

describe("resolveSidebarBrand — sem logo, a marca é a da Trifold (o estado de HOJE)", () => {
  it.each([
    ["prop ausente", undefined],
    ["nulo", null],
    ["string vazia", ""],
    ["só espaço em branco", "   "],
  ])("%s ⇒ marca da Trifold", (_rotulo, orgLogoUrl) => {
    expect(
      resolveSidebarBrand({ orgLogoUrl, orgName: "Construtora Aurora", imgFailed: false })
    ).toEqual(MARCA_DA_TRIFOLD)
  })
})

describe("resolveSidebarBrand — com logo, a marca é a da empresa", () => {
  it("usa a URL da empresa e o nome dela como texto alternativo", () => {
    expect(
      resolveSidebarBrand({ orgLogoUrl: URL_DO_LOGO, orgName: "Construtora Aurora", imgFailed: false })
    ).toEqual({ src: URL_DO_LOGO, alt: "Construtora Aurora", isCustom: true })
  })

  it.each([
    ["nome ausente", undefined],
    ["nome nulo", null],
    ["nome em branco", "  "],
  ])("%s ⇒ texto alternativo genérico, nunca vazio", (_rotulo, orgName) => {
    // `alt=""` marcaria a imagem como decorativa e apagaria a marca justamente para quem só tem
    // o texto. O logo continua sendo o da empresa.
    expect(resolveSidebarBrand({ orgLogoUrl: URL_DO_LOGO, orgName, imgFailed: false })).toEqual({
      src: URL_DO_LOGO,
      alt: "Logo da empresa",
      isCustom: true,
    })
  })
})

describe("resolveSidebarBrand — a imagem que falha degrada para o fallback, nunca para o vazio", () => {
  it("`imgFailed` vence o logo da empresa (AC4)", () => {
    // O desfecho de TODA falha de carregamento — arquivo removido do balde, host fora do
    // `remotePatterns` do `next.config.ts` (que responde 400 em `/_next/image`), rede — é este.
    expect(
      resolveSidebarBrand({ orgLogoUrl: URL_DO_LOGO, orgName: "Construtora Aurora", imgFailed: true })
    ).toEqual(MARCA_DA_TRIFOLD)
  })

  it("`imgFailed` sem logo nenhum também: mesma marca, sem `src` vazio", () => {
    expect(resolveSidebarBrand({ imgFailed: true })).toEqual(MARCA_DA_TRIFOLD)
  })
})
