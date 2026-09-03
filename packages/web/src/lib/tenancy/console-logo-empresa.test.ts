/**
 * Story 900-63 · AC3/AC4/AC8/AC9 — o carrasco das decisões do logo.
 *
 * Elas moram fora do `.tsx` porque `vitest.config.ts` casa `*.test.ts` e **não** `.tsx`: decisão
 * escrita num componente não tem juiz. Aqui cada uma tem um `it` que fica vermelho quando ela
 * muda.
 */

import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  AVISO_DE_QUE_ISTO_SO_GUARDA,
  EXTENSAO_POR_MIME,
  LIMITE_DE_BYTES,
  MENSAGEM_POR_CODIGO_DO_LOGO,
  PLACEHOLDER_DE_PASTA_VAZIA,
  avisoDeArquivoNaoRemovido,
  caminhoDoLogo,
  decidirDesfechoDoLogo,
  objetosAPurgar,
  urlDePreVisualizacao,
  urlVersionadaDoLogo,
  validarArquivoDeLogo,
} from "./console-logo-empresa"

const ORG = "11111111-1111-1111-1111-111111111111"

describe("AC1/AC3 — os três tipos aceitos", () => {
  it("a lista é exatamente PNG, JPEG e WebP — sem SVG, e sem GIF", () => {
    // Literal de propósito, e não derivado da constante: um teste que monta o esperado a partir
    // da fonte que vigia nunca reprova a fonte. Sem SVG porque SVG carrega script embutido;
    // sem GIF porque `campaigns/upload-image` aceitar não é razão para este bucket aceitar.
    expect(Object.keys(EXTENSAO_POR_MIME).sort()).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
    ])
    expect(EXTENSAO_POR_MIME["image/jpeg"]).toBe("jpg")
  })

  it("é a MESMA lista do `allowed_mime_types` do bucket na migration 254", () => {
    // A do bucket é a segunda rede; a daqui é o erro legível. Divergirem quer dizer um arquivo
    // aceito pela rota e recusado pelo Storage com uma mensagem que não é para humano — ou pior,
    // o contrário. A migration é a fonte, e por isso é ela que se lê.
    const aqui = path.dirname(fileURLToPath(import.meta.url))
    const sql = fs.readFileSync(
      path.resolve(aqui, "../../../../../supabase/migrations/254_logo_da_empresa.sql"),
      "utf8",
    )
    const i = sql.indexOf("ARRAY['image/png'")
    expect(i, "o ARRAY de allowed_mime_types na migration 254").toBeGreaterThanOrEqual(0)
    const trecho = sql.slice(i, sql.indexOf("]", i) + 1)
    for (const mime of Object.keys(EXTENSAO_POR_MIME)) {
      expect(trecho, mime).toContain(`'${mime}'`)
    }
    expect(trecho).not.toContain("svg")
    // E o limite de bytes é o mesmo número dos dois lados.
    expect(sql).toContain(String(LIMITE_DE_BYTES))
    expect(LIMITE_DE_BYTES).toBe(2097152)
  })
})

describe("AC3 — validarArquivoDeLogo", () => {
  it("arquivo bom devolve `null`", () => {
    expect(validarArquivoDeLogo({ tipo: "image/png", tamanho: 1024 })).toBeNull()
  })

  it("ausência devolve ARQUIVO_OBRIGATORIO / 400", () => {
    // Rótulo `null`, e não `undefined`: um default de parâmetro comeria justamente o caso.
    const r = validarArquivoDeLogo(null)
    expect(r?.codigo).toBe("ARQUIVO_OBRIGATORIO")
    expect(r?.status).toBe(400)
  })

  it("tipo fora da lista devolve TIPO_NAO_SUPORTADO / 422", () => {
    const r = validarArquivoDeLogo({ tipo: "image/svg+xml", tamanho: 10 })
    expect(r?.codigo).toBe("TIPO_NAO_SUPORTADO")
    expect(r?.status).toBe(422)
  })

  it("tamanho acima do limite devolve ARQUIVO_MUITO_GRANDE / 422", () => {
    const r = validarArquivoDeLogo({ tipo: "image/png", tamanho: LIMITE_DE_BYTES + 1 })
    expect(r?.codigo).toBe("ARQUIVO_MUITO_GRANDE")
    expect(r?.status).toBe(422)
  })

  it("EXATAMENTE no limite passa — a comparação é `>`, não `>=`", () => {
    expect(validarArquivoDeLogo({ tipo: "image/png", tamanho: LIMITE_DE_BYTES })).toBeNull()
  })

  it("tipo errado E grande demais: o TIPO vence — trocar a extensão não faria caber", () => {
    const r = validarArquivoDeLogo({ tipo: "image/gif", tamanho: LIMITE_DE_BYTES + 1 })
    expect(r?.codigo).toBe("TIPO_NAO_SUPORTADO")
  })

  it("uma chave herdada de Object.prototype não passa por tipo aceito", () => {
    // `"constructor" in EXTENSAO_POR_MIME` é `true` pela cadeia de protótipos. Sem cuidado, um
    // arquivo com `type: "constructor"` chegaria ao `caminhoDoLogo`, que estouraria — e um 500
    // no lugar de um 422 é a rota escondendo um pedido inválido atrás de um defeito do servidor.
    const r = validarArquivoDeLogo({ tipo: "constructor", tamanho: 10 })
    expect(r?.codigo).toBe("TIPO_NAO_SUPORTADO")
  })
})

describe("caminhoDoLogo", () => {
  it("é `{org_id}/logo.{ext}`", () => {
    expect(caminhoDoLogo(ORG, "image/jpeg")).toBe(`${ORG}/logo.jpg`)
  })

  it("MIME sem extensão mapeada ESTOURA — nunca produz `logo.undefined`", () => {
    expect(() => caminhoDoLogo(ORG, "image/gif")).toThrow()
  })
})

describe("AC4 — objetosAPurgar", () => {
  const destino = `${ORG}/logo.png`

  it("devolve o CAMINHO COMPLETO, e não o nome relativo que o `list` entrega", () => {
    // `remove()` recebe caminho completo. Passar o relativo apagaria — silenciosamente e com
    // sucesso aparente — nada.
    expect(objetosAPurgar(ORG, ["logo.jpg"], destino)).toEqual([`${ORG}/logo.jpg`])
  })

  it("o destino NÃO entra na purga", () => {
    expect(objetosAPurgar(ORG, ["logo.png"], destino)).toEqual([])
  })

  it("o caso da AC: PNG antigo + WebP novo → só o PNG sai", () => {
    expect(objetosAPurgar(ORG, ["logo.png", "logo.webp"], `${ORG}/logo.webp`)).toEqual([
      `${ORG}/logo.png`,
    ])
  })

  it("o placeholder de pasta vazia não é objeto do logo", () => {
    expect(objetosAPurgar(ORG, [PLACEHOLDER_DE_PASTA_VAZIA], destino)).toEqual([])
  })

  it("destino vazio (remoção) purga o prefixo INTEIRO", () => {
    expect(objetosAPurgar(ORG, ["logo.png", "logo.jpg"], "")).toEqual([
      `${ORG}/logo.png`,
      `${ORG}/logo.jpg`,
    ])
  })

  it("lista vazia devolve lista vazia (e não estoura)", () => {
    expect(objetosAPurgar(ORG, [], destino)).toEqual([])
  })
})

describe("AC0/AC9 — o texto que impede a tela de prometer o que ela não faz", () => {
  it("diz que GUARDA o arquivo e que ainda NÃO há tela lendo", () => {
    // Literal, e não `toBeTruthy()`: o valor desta constante É a AC. Um texto que dissesse
    // "logo atualizado com sucesso" satisfaria qualquer régua de existência.
    expect(AVISO_DE_QUE_ISTO_SO_GUARDA).toBe(
      "Isto guarda o arquivo — ainda não há tela do CRM do cliente (login, cabeçalho, e-mails) " +
        "lendo este logo automaticamente. É um cadastro pronto para quando essa exibição existir.",
    )
  })

  it("nomeia as três superfícies de marca que a `900-64` vai ter que resolver", () => {
    for (const superficie of ["login", "cabeçalho", "e-mails"]) {
      expect(AVISO_DE_QUE_ISTO_SO_GUARDA, superficie).toContain(superficie)
    }
  })
})

describe("AC8 — decidirDesfechoDoLogo", () => {
  it("`ok` → sucesso, sem erro", () => {
    expect(decidirDesfechoDoLogo(true, 200, {})).toEqual({ sucesso: true, erro: null })
  })

  it("falha NUNCA vira sucesso, nem com corpo vazio", () => {
    expect(decidirDesfechoDoLogo(false, 500, {}).sucesso).toBe(false)
  })

  it("código conhecido vence o `message` cru do servidor", () => {
    const d = decidirDesfechoDoLogo(false, 409, {
      error: "CONFLITO_DE_CONCORRENCIA",
      message: "PGRST116 row not found in schema cache",
    })
    expect(d.erro).toBe(MENSAGEM_POR_CODIGO_DO_LOGO.CONFLITO_DE_CONCORRENCIA)
    expect(d.erro).toContain("Recarregue a página")
  })

  it("os quatro códigos da AC8 têm frase própria", () => {
    for (const codigo of [
      "TIPO_NAO_SUPORTADO",
      "ARQUIVO_MUITO_GRANDE",
      "ARQUIVO_OBRIGATORIO",
      "CONFLITO_DE_CONCORRENCIA",
    ]) {
      expect(decidirDesfechoDoLogo(false, 422, { error: codigo }).erro, codigo).toBe(
        MENSAGEM_POR_CODIGO_DO_LOGO[codigo],
      )
    }
  })

  it("código desconhecido cai no `message` do servidor", () => {
    expect(decidirDesfechoDoLogo(false, 500, { error: "X", message: "boom" }).erro).toBe("boom")
  })

  it("`message` em branco NÃO vira a mensagem — `\"\"` não é nullish", () => {
    // Com `??`, o operador ficaria olhando uma tela sem uma palavra sobre o que houve.
    expect(decidirDesfechoDoLogo(false, 500, { error: "X", message: "   " }).erro).toBe("X")
  })

  it("sem código e sem mensagem, a frase carrega o status", () => {
    expect(decidirDesfechoDoLogo(false, 503, {}).erro).toBe("Falhou (HTTP 503).")
  })
})

describe("AC4 — avisoDeArquivoNaoRemovido", () => {
  it("`arquivoRemovido: false` avisa que o arquivo continua acessível", () => {
    const aviso = avisoDeArquivoNaoRemovido({ arquivoRemovido: false })
    expect(aviso).toContain("continua acessível")
  })

  it("`arquivoRemovido: true` não avisa nada", () => {
    expect(avisoDeArquivoNaoRemovido({ arquivoRemovido: true })).toBeNull()
  })

  it("campo AUSENTE não avisa — 'não sei' não autoriza afirmar que ficou lixo", () => {
    expect(avisoDeArquivoNaoRemovido({})).toBeNull()
  })

  it("um valor que não é booleano não vira aviso", () => {
    expect(avisoDeArquivoNaoRemovido({ arquivoRemovido: "false" })).toBeNull()
  })
})

describe("AC8 — urlDePreVisualizacao (DOC-002: UMA marca de versão, não duas)", () => {
  const URL_BASE = "https://x.supabase.co/storage/v1/object/public/org-logos/o/logo.png"
  /** O que a ROTA grava em `logo_url`: já versionado pelo sha256 do conteúdo. */
  const URL_GRAVADA = `${URL_BASE}?v=93497ee4808a75d0`

  it("🔴 a URL gravada passa INTEIRA — nenhuma segunda marca é pendurada", () => {
    // A 1ª versão devolvia `…?v=<sha>&v=<updated_at>`. Funcionava por acidente e era errado nos
    // dois sentidos: `updated_at` anda a cada UPDATE da linha (a `900-62` edita nome/slug/fiscal
    // na MESMA linha, o que invalidaria o cache de um arquivo que não mudou um byte), e `v`
    // repetido é ambíguo para quem lê — `URLSearchParams.get("v")` devolve o PRIMEIRO.
    expect(urlDePreVisualizacao(URL_GRAVADA)).toBe(URL_GRAVADA)
  })

  it("🔴 e a chave `v` aparece UMA vez só — a asserção que o `&v=` de antes reprova", () => {
    const previa = urlDePreVisualizacao(URL_GRAVADA)
    expect(previa).not.toBeNull()
    expect([...new URL(previa!).searchParams.keys()]).toEqual(["v"])
    expect(new URL(previa!).searchParams.get("v")).toBe("93497ee4808a75d0")
  })

  it("URL SEM query nenhuma também passa igual — não se inventa versão que o banco não gravou", () => {
    // `logo_url` sem `?v=` só existiria se algo fora desta rota tivesse escrito a coluna. Inventar
    // uma marca aqui esconderia esse fato em vez de deixá-lo visível.
    expect(urlDePreVisualizacao(URL_BASE)).toBe(URL_BASE)
  })

  it("`null` entra, `null` sai — não se inventa pré-visualização do que não existe", () => {
    expect(urlDePreVisualizacao(null)).toBeNull()
  })

  it("string vazia vira `null`: `<img src=\"\">` requisita a PÁGINA ATUAL como se fosse imagem", () => {
    expect(urlDePreVisualizacao("")).toBeNull()
  })
})

describe("AC4/AC5 — urlVersionadaDoLogo", () => {
  const BASE = "https://x.supabase.co/storage/v1/object/public/org-logos/o/logo.png"

  it("pendura a versão do CONTEÚDO na URL gravada", () => {
    expect(urlVersionadaDoLogo(BASE, "abc123")).toBe(`${BASE}?v=abc123`)
  })

  it("versões diferentes produzem URLs diferentes — é isso que tira a troca do no-op", () => {
    expect(urlVersionadaDoLogo(BASE, "a")).not.toBe(urlVersionadaDoLogo(BASE, "b"))
  })

  it("a MESMA versão produz a MESMA URL — reenviar o idêntico segue sendo no-op", () => {
    expect(urlVersionadaDoLogo(BASE, "a")).toBe(urlVersionadaDoLogo(BASE, "a"))
  })

  it("URL que já tem query ganha `&`", () => {
    expect(urlVersionadaDoLogo(`${BASE}?t=1`, "a")).toBe(`${BASE}?t=1&v=a`)
  })
})
