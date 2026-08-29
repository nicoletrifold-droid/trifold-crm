/**
 * Story 900-3b · AC2 — o carrasco da decisão do banner.
 *
 * A prova de integração é o `pnpm dev`/`pnpm dev:prod` (um humano lendo stdout, irrepetível).
 * Estes casos são a parte repetível: rodam em CI, sem env, sem rede, sem banco.
 *
 * O caso mais importante é o de `"ausente"` (emenda D1 do `@po`). Ele não afirma
 * "não lança" — afirmar "não lança" deixaria passar a implementação natural de um tipo
 * binário (`undefined → "ok"`, porque "não é o ref de produção, logo não alerta"), que é
 * exatamente o defeito que a decisão do C1 criou de propósito: `pnpm build` sem nenhuma env
 * de Supabase assa `undefined` no bundle **sem falhar**. A asserção é o **retorno
 * específico**.
 */

import { describe, it, expect } from "vitest"
import {
  avaliarRefDoAmbiente,
  extrairRef,
  textoDoBanner,
  REF_PRODUCAO,
  REF_TESTE,
} from "./env-banner"

const URL_PROD = `https://${REF_PRODUCAO}.supabase.co`
const URL_TESTE = `https://${REF_TESTE}.supabase.co`

describe("avaliarRefDoAmbiente — os quatro casos nomeados na AC2", () => {
  it("ref de produção em modo development ⇒ 'alerta'", () => {
    expect(avaliarRefDoAmbiente(URL_PROD, "development")).toBe("alerta")
  })

  it("ref de teste em modo development ⇒ 'ok'", () => {
    expect(avaliarRefDoAmbiente(URL_TESTE, "development")).toBe("ok")
  })

  it("url undefined ⇒ 'ausente' (D1 — o retorno específico, não 'não lança')", () => {
    expect(avaliarRefDoAmbiente(undefined, "development")).toBe("ausente")
  })

  it("url string vazia ⇒ 'ausente' (mesmo tratamento)", () => {
    expect(avaliarRefDoAmbiente("", "production")).toBe("ausente")
  })
})

describe("avaliarRefDoAmbiente — 'ausente' não pode ser dobrado em 'ok'", () => {
  // Se alguém colapsar o tipo para dois estados, TODOS estes viram "ok" e o build vazio
  // volta a subir calado.
  it.each([
    ["undefined", undefined],
    ["string vazia", ""],
    ["só espaços", "   "],
    ["placeholder não substituído", "PREENCHER_NO_PAINEL_SUPABASE"],
    ["URL de outro host", "https://exemplo.com"],
    ["URL sem o subdomínio de ref", "https://supabase.co"],
    ["ref com caractere inválido", "https://ref-com-hifen.supabase.co"],
  ])("%s ⇒ 'ausente'", (_rotulo, valor) => {
    expect(avaliarRefDoAmbiente(valor as string | undefined, "development")).toBe("ausente")
  })

  it("nenhum desses é 'ok' nem 'alerta'", () => {
    const vereditos = [undefined, "", "   ", "https://exemplo.com"].map((v) =>
      avaliarRefDoAmbiente(v, "production"),
    )
    expect(vereditos).toEqual(["ausente", "ausente", "ausente", "ausente"])
  })
})

describe("avaliarRefDoAmbiente — nodeEnv é load-bearing nos dois sentidos", () => {
  it("produção + NODE_ENV=production ⇒ 'ok' (é o deploy da Vercel, não um alarme)", () => {
    expect(avaliarRefDoAmbiente(URL_PROD, "production")).toBe("ok")
  })

  it("teste + NODE_ENV=production ⇒ 'alerta' (risco R5: next start sobre um build:teste)", () => {
    expect(avaliarRefDoAmbiente(URL_TESTE, "production")).toBe("alerta")
  })

  it("produção com NODE_ENV indefinido ⇒ 'alerta' (não silencia por omissão)", () => {
    expect(avaliarRefDoAmbiente(URL_PROD, undefined)).toBe("alerta")
  })

  // Guarda de vivacidade do parâmetro: se alguém apagar `nodeEnv` do corpo da função,
  // os dois vereditos abaixo colapsam no mesmo valor e este caso acende.
  it("o mesmo ref produz vereditos DIFERENTES conforme o nodeEnv", () => {
    expect(avaliarRefDoAmbiente(URL_PROD, "production")).not.toBe(
      avaliarRefDoAmbiente(URL_PROD, "development"),
    )
    expect(avaliarRefDoAmbiente(URL_TESTE, "production")).not.toBe(
      avaliarRefDoAmbiente(URL_TESTE, "development"),
    )
  })
})

describe("extrairRef", () => {
  it("extrai o ref de uma URL bem formada, com e sem barra final", () => {
    expect(extrairRef(URL_TESTE)).toBe(REF_TESTE)
    expect(extrairRef(`${URL_TESTE}/`)).toBe(REF_TESTE)
  })

  it("devolve null para o que não é URL de projeto Supabase", () => {
    expect(extrairRef(undefined)).toBeNull()
    expect(extrairRef("")).toBeNull()
    expect(extrairRef("http://xnxvygyfyyyzwhiuoehz.supabase.co")).toBeNull() // http, não https
    expect(extrairRef("https://xnxvygyfyyyzwhiuoehz.supabase.co/rest/v1")).toBeNull()
  })
})

describe("textoDoBanner — os três estados falam, nenhum cala", () => {
  it("'ausente' diz que não há banco nenhum e nomeia o estado da variável", () => {
    const t = textoDoBanner("ausente", undefined, "production")
    expect(t).toMatch(/AMBIENTE AUSENTE/)
    expect(t).toMatch(/não fala com banco nenhum/i)
  })

  it("'alerta' com ref de produção nomeia o ref e a causa", () => {
    const t = textoDoBanner("alerta", URL_PROD, "development")
    expect(t).toContain(REF_PRODUCAO)
    expect(t).toMatch(/PRODUÇÃO fora de um deploy/i)
  })

  it("'alerta' com ref de teste em NODE_ENV=production nomeia a causa oposta", () => {
    const t = textoDoBanner("alerta", URL_TESTE, "production")
    expect(t).toContain(REF_TESTE)
    expect(t).toMatch(/NODE_ENV=production .* banco de TESTE/i)
  })

  it("'ok' NÃO é silêncio — nomeia o ref (senão é indistinguível de não ter banner)", () => {
    const t = textoDoBanner("ok", URL_TESTE, "development")
    expect(t).toContain(REF_TESTE)
    expect(t.trim().length).toBeGreaterThan(0)
  })
})
