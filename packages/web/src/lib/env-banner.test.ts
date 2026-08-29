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

/**
 * TEST-002 (gate `@qa`, 3ª rodada) — o carrasco que faltava nesta ponta.
 *
 * ## Por que os casos acima não bastavam
 *
 * Eles montam a URL esperada a partir de `REF_PRODUCAO`/`REF_TESTE`, que por sua vez são
 * **derivados** de `@trifold/shared`. Ou seja: a régua tira o alvo da mesma fonte que
 * pretende vigiar. Mexer na fonte move o código **e a expectativa junto**, e o teste
 * continua verde. Medido pelo `@qa`: com o ref de produção trocado na fonte, ou com a
 * normalização de caixa removida, as suítes `shared`, `db-env` e `supabase-check` acendem —
 * e `env-banner` fica **22 ✅**, mudo.
 *
 * A consequência que ele mediu é a pior possível para esta AC: sob a mutação, o banner
 * devolve **`ok` para produção em MAIÚSCULAS**. O instrumento da AC2 ficaria cego
 * exatamente sobre produção, que é o único caso para o qual ele existe.
 *
 * ## A regra que estes casos aplicam
 *
 * **Uma régua que deriva o esperado da mesma fonte que testa não pode reprovar a fonte.**
 * Por isso as URLs abaixo são **literais**, escritas à mão, sem importar constante nenhuma.
 *
 * Se um dia o ref de produção mudar de verdade, estes casos falham — e **é para falhar**:
 * trocar o projeto de produção tem de ser uma decisão deliberada, com diff revisado nos dois
 * lugares, não uma propagação automática que ninguém enxerga.
 */
describe("TEST-002 — URLs LITERAIS, independentes da fonte sob teste", () => {
  // Refs escritos à mão de propósito. NÃO substituir por REF_PRODUCAO/REF_TESTE.
  const PROD_LITERAL = "dsopqkqjkmhytudaaolv"
  const TESTE_LITERAL = "xnxvygyfyyyzwhiuoehz"

  describe("produção é reconhecida em QUALQUER caixa", () => {
    it.each([
      ["minúsculas", `https://${PROD_LITERAL}.supabase.co`],
      ["MAIÚSCULAS", "https://DSOPQKQJKMHYTUDAAOLV.supabase.co"],
      ["caixa mista", "https://DsOpQkQjKmHyTuDaAoLv.supabase.co"],
    ])("%s ⇒ 'alerta' em modo development", (_rotulo, url) => {
      expect(avaliarRefDoAmbiente(url, "development")).toBe("alerta")
    })

    it("MAIÚSCULAS em NODE_ENV=production ⇒ 'ok' (é o deploy), não 'ausente'", () => {
      // Guarda contra um conserto preguiçoso que fizesse caixa alta virar "ausente":
      // ficaria verde no caso acima e quebraria o deploy legítimo.
      expect(avaliarRefDoAmbiente("https://DSOPQKQJKMHYTUDAAOLV.supabase.co", "production")).toBe("ok")
    })
  })

  describe("teste é reconhecido em QUALQUER caixa", () => {
    it.each([
      ["minúsculas", `https://${TESTE_LITERAL}.supabase.co`],
      ["MAIÚSCULAS", "https://XNXVYGYFYYYZWHIUOEHZ.supabase.co"],
    ])("%s ⇒ 'ok' em modo development", (_rotulo, url) => {
      expect(avaliarRefDoAmbiente(url, "development")).toBe("ok")
    })

    it("MAIÚSCULAS em NODE_ENV=production ⇒ 'alerta' (risco R5)", () => {
      expect(avaliarRefDoAmbiente("https://XNXVYGYFYYYZWHIUOEHZ.supabase.co", "production")).toBe("alerta")
    })
  })

  it("extrairRef normaliza a caixa, contra literal", () => {
    expect(extrairRef("https://DSOPQKQJKMHYTUDAAOLV.supabase.co")).toBe(PROD_LITERAL)
    expect(extrairRef("https://XNXVYGYFYYYZWHIUOEHZ.supabase.co")).toBe(TESTE_LITERAL)
  })

  it("o banner ROTULA produção em maiúsculas como PRODUÇÃO, não como 'não catalogado'", () => {
    // Se a classificação cair, o rótulo cai junto — e o operador lê "ref não catalogado"
    // no lugar de "PRODUÇÃO", que é a pior mensagem possível neste caso.
    const t = textoDoBanner("alerta", "https://DSOPQKQJKMHYTUDAAOLV.supabase.co", "development")
    expect(t).toContain(PROD_LITERAL)
    expect(t).toMatch(/PRODUÇÃO fora de um deploy/i)
  })

  it("as constantes derivadas ainda batem com os literais (se falhar, a fonte mudou)", () => {
    // Único caso que compara as duas coisas. Ele NÃO substitui os de cima: aqui o objetivo
    // é justamente denunciar divergência entre a fonte e o que esta suíte assume.
    expect(REF_PRODUCAO).toBe(PROD_LITERAL)
    expect(REF_TESTE).toBe(TESTE_LITERAL)
  })
})
