/**
 * Story 900-60 · AC3/AC6/AC8 — a régua do texto do diálogo e do rótulo do botão.
 *
 * ## As âncoras são literais DIGITADOS À MÃO
 *
 * Nenhuma asserção de texto abaixo importa a constante que ela testa. Uma régua que monta o
 * esperado a partir da fonte muda junto com ela e não reprova nada: foi assim que o teste do
 * banner de ambiente ficou mudo exatamente sobre o ref de produção (PR #524). As três frases
 * são o produto desta story — o @po as escreveu depois de medir três consumidores de
 * `organizations.is_active` — então elas estão aqui recopiadas do AC3, palavra por palavra.
 *
 * ## Por que a varredura de texto-fonte existe além disso
 *
 * O módulo pode estar perfeito e o componente não usá-lo. A segunda parte do arquivo mede o
 * texto-fonte de `app/platform/**`: o rótulo do menu vem de `textoDaConfirmacao`, o badge vem de
 * `rotuloDoEstado`, e a palavra "Desativar" não sobrevive em lugar nenhum do console.
 *
 * ⚠️ **E é régua de FORMA, com o limite declarado**: ela reprova qualquer desvio da expressão
 * esperada, mas "sempre pausa" e "nunca pausa" produziriam o MESMO conjunto de morte, porque as
 * duas formas erradas são igualmente ≠ da certa. Pior: ela é cega a QUALQUER mutante que preserve
 * o texto. O que fecha o elo de verdade é a prova na tela, e ela é manual — está registrada no
 * Dev Agent Record da story.
 *
 * ## O desfecho do envio (AC7) — o que o gate cobrou, e onde ele mora agora
 *
 * O gate mediu que acrescentar `aoFechar()` ao ramo de erro do diálogo deixava a suíte INTEIRA
 * verde (QA-900-60-1): a decisão estava num `.tsx`, e o `include` do vitest casa `*.test.ts`.
 * Ela saiu para `decidirDesfecho()`, que é comportamento e tem carrasco de dois lados aqui —
 * falha **não** fecha, sucesso **fecha**. O que sobrou no componente é a obediência, e essa parte
 * é forma: o trecho do `confirmar()` tem `aoFechar()` **uma única vez**, e logo depois do
 * `router.refresh()`. As duas asserções juntas matam tanto "fecha na falha" quanto "nunca fecha".
 */

import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  decidirDesfecho,
  motivoEhValido,
  partirNaEnfase,
  rotuloDoEstado,
  sentidoDaAcao,
  textoDaConfirmacao,
} from "./console-pausa-empresa"
import { arquivosDeProducao, codigoDe, ocorrenciasNoCodigo, trechoDelimitado } from "./fonte-scan"

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(AQUI, "../..") // packages/web/src
const RAIZ_DO_CONSOLE = path.join(SRC, "app/platform")
const MENU = path.join(SRC, "app/platform/orgs/_components/org-row-menu.tsx")
const DIALOGO = path.join(SRC, "app/platform/orgs/_components/pausar-empresa-dialog.tsx")
const LISTA = path.join(SRC, "app/platform/orgs/page.tsx")

// ── ÂNCORAS LITERAIS, recopiadas do AC3 da story. Nunca importadas. ─────────────────────────
const FRASE_I_PAUSAR =
  "Isto pausa o processamento automático desta empresa nos crons da Trifold (leads, lembretes, campanhas)."
const FRASE_I_RETOMAR =
  "Isto retoma o processamento automático desta empresa nos crons da Trifold (leads, lembretes, campanhas)."
const FRASE_II =
  "Não impede login nem uso do sistema — o acesso de cada usuário é controlado individualmente, não pela empresa."
const FRASE_III =
  "Também altera a contagem de empresas ativas, que é o que decide o roteamento de leads de landing page e Telegram (webhooks sem identificador de empresa no payload). Isso pode mudar para onde vão os leads de OUTRA empresa."

describe("AC3 — as três frases, verbatim e nesta ordem", () => {
  it("pausar: (i) crons, (ii) não impede login, (iii) roteamento de OUTRA empresa", () => {
    expect(textoDaConfirmacao(true).frases.map((f) => f.texto)).toEqual([
      FRASE_I_PAUSAR,
      FRASE_II,
      FRASE_III,
    ])
  })

  it("retomar: a (i) muda de verbo; a (ii) e a (iii) são AS MESMAS", () => {
    // A (iii) não é adaptada de propósito: ativar uma segunda empresa faz `"resolvida"` virar
    // `"ambigua"` e PARA o roteamento de landing-page/telegram da primeira, sem erro visível. O
    // efeito é simétrico, então o aviso é o mesmo. Suavizá-lo no sentido de retomar deixaria
    // metade do risco sem aviso.
    expect(textoDaConfirmacao(false).frases.map((f) => f.texto)).toEqual([
      FRASE_I_RETOMAR,
      FRASE_II,
      FRASE_III,
    ])
  })

  it("a frase (iii) NÃO pode ser suavizada: ela nomeia a empresa que o operador não está olhando", () => {
    for (const atual of [true, false]) {
      const terceira = textoDaConfirmacao(atual).frases[2].texto
      expect(terceira, `is_active=${atual}`).toContain("OUTRA empresa")
      expect(terceira, `is_active=${atual}`).toContain("landing page e Telegram")
      expect(terceira, `is_active=${atual}`).toContain("contagem de empresas ativas")
    }
  })

  it("a frase (ii) nega o bloqueio de acesso — é a que impede a promessa falsa", () => {
    for (const atual of [true, false]) {
      expect(textoDaConfirmacao(atual).frases[1].texto).toContain(
        "Não impede login nem uso do sistema",
      )
    }
  })

  it("nenhuma frase promete bloqueio de acesso", () => {
    // Mutante realista: alguém "melhora" a (i) para "Isto desativa o acesso da empresa". A
    // asserção de igualdade acima já mataria, mas esta nomeia O QUE não pode aparecer, que é a
    // informação útil para quem for editar o texto no futuro.
    for (const atual of [true, false]) {
      const tudo = textoDaConfirmacao(atual).frases.map((f) => f.texto).join(" ")
      expect(tudo).not.toContain("bloqueia")
      expect(tudo).not.toContain("Desativa")
      expect(tudo).not.toContain("impede o acesso")
    }
  })
})

describe("AC8 — o rótulo nomeia o mecanismo, não a aspiração", () => {
  it("empresa ativa: item e título dizem `Pausar empresa`", () => {
    const t = textoDaConfirmacao(true)
    expect(t.rotuloDoMenu).toBe("Pausar empresa")
    expect(t.titulo).toBe("Pausar empresa")
    expect(t.rotuloDoBotao).toBe("Pausar empresa")
  })

  it("empresa pausada: item e título dizem `Retomar empresa`", () => {
    const t = textoDaConfirmacao(false)
    expect(t.rotuloDoMenu).toBe("Retomar empresa")
    expect(t.titulo).toBe("Retomar empresa")
    expect(t.rotuloDoBotao).toBe("Retomar empresa")
  })

  it("nenhum rótulo contém `Desativar` nem `Ativar` seco", () => {
    for (const atual of [true, false]) {
      const t = textoDaConfirmacao(atual)
      for (const rotulo of [t.rotuloDoMenu, t.titulo, t.rotuloDoBotao]) {
        expect(rotulo, `is_active=${atual}`).not.toContain("Desativar")
        expect(rotulo, `is_active=${atual}`).not.toContain("Ativar")
      }
    }
  })

  it("o estado na lista é `Ativa` / `Pausada`, nunca `Inativa`", () => {
    expect(rotuloDoEstado(true)).toBe("Ativa")
    expect(rotuloDoEstado(false)).toBe("Pausada")
  })
})

describe("o sentido e o valor pedido", () => {
  it("`sentidoDaAcao` deriva do estado ATUAL", () => {
    expect(sentidoDaAcao(true)).toBe("pausar")
    expect(sentidoDaAcao(false)).toBe("retomar")
  })

  it("`isActiveDesejado` é o INVERSO do atual, nos dois sentidos", () => {
    // Mutante que devolvesse o próprio estado atual produziria um botão que nunca muda nada e
    // ainda assim responde 200 — o pior desfecho: a trilha registra e o efeito não acontece.
    expect(textoDaConfirmacao(true).isActiveDesejado).toBe(false)
    expect(textoDaConfirmacao(false).isActiveDesejado).toBe(true)
  })
})

describe("`partirNaEnfase` — a marcação não pode divergir da frase", () => {
  it("toda ênfase declarada É substring do seu texto, nos dois sentidos", () => {
    // Este é o invariante que `partirNaEnfase` degrada em silêncio em runtime (para não derrubar
    // a tela por causa de uma marcação). Aqui ele pode falhar sem custo, que é o lugar certo.
    for (const atual of [true, false]) {
      for (const frase of textoDaConfirmacao(atual).frases) {
        if (frase.enfase === null) continue
        expect(frase.texto, frase.enfase).toContain(frase.enfase)
      }
    }
  })

  it("os três pedaços reconstituem a frase exatamente", () => {
    for (const atual of [true, false]) {
      for (const frase of textoDaConfirmacao(atual).frases) {
        const { antes, forte, depois } = partirNaEnfase(frase)
        expect(antes + forte + depois).toBe(frase.texto)
      }
    }
  })

  it("as frases (ii) e (iii) TÊM ênfase não-vazia; a (i) não tem", () => {
    // Sem esta asserção, uma marcação apagada (`enfase: null` em todas) passaria pelas duas de
    // cima — elas ficariam vacuamente verdes.
    for (const atual of [true, false]) {
      const frases = textoDaConfirmacao(atual).frases
      expect(partirNaEnfase(frases[0]).forte).toBe("")
      expect(partirNaEnfase(frases[1]).forte.length).toBeGreaterThan(0)
      expect(partirNaEnfase(frases[2]).forte.length).toBeGreaterThan(0)
    }
  })

  it("ênfase que não é substring degrada para texto plano, sem perder a frase", () => {
    const { antes, forte, depois } = partirNaEnfase({ texto: "abc", enfase: "zzz" })
    expect(antes).toBe("abc")
    expect(forte).toBe("")
    expect(depois).toBe("")
  })
})

describe("AC1 — `motivoEhValido`", () => {
  it("vazio, espaços e quebras de linha são inválidos", () => {
    expect(motivoEhValido("")).toBe(false)
    expect(motivoEhValido("   ")).toBe(false)
    expect(motivoEhValido("\n\t ")).toBe(false)
  })

  it("um caractere basta — não há mínimo inventado", () => {
    // Nenhuma fonte especifica tamanho mínimo de motivo (Artigo IV). Um número escolhido no
    // código seria regra de negócio nascida do nada, e esta asserção morre se alguém a plantar.
    expect(motivoEhValido("x")).toBe(true)
    expect(motivoEhValido("  x  ")).toBe(true)
  })
})

describe("o elo com a tela — varredura de texto-fonte (régua de FORMA)", () => {
  it("o 4º item do menu tira o rótulo de `textoDaConfirmacao`, não de um literal", () => {
    const fonte = codigoDe(fs.readFileSync(MENU, "utf8"))
    expect(fonte).toContain("textoDaConfirmacao(isActive).rotuloDoMenu")
  })

  it("o diálogo renderiza as frases do módulo, com a ênfase partida", () => {
    const fonte = codigoDe(fs.readFileSync(DIALOGO, "utf8"))
    expect(fonte).toContain("texto.frases.map")
    expect(fonte).toContain("partirNaEnfase(frase)")
    // O `isActive` que o diálogo recebe é o ATUAL; quem inverte é `isActiveDesejado`. Se o
    // componente mandasse `isActive` cru para a rota, o botão gravaria o estado que já existe.
    expect(fonte).toContain("isActive: texto.isActiveDesejado")
  })

  it("o badge da lista vem de `rotuloDoEstado`, e o literal `\"inativa\"` não sobrevive", () => {
    const fonte = codigoDe(fs.readFileSync(LISTA, "utf8"))
    expect(fonte).toContain("rotuloDoEstado(org.is_active)")
    expect(fonte).not.toContain('"inativa"')
    expect(fonte).not.toContain('"ativa"')
  })

  it("a palavra `Desativar` não sobrevive em NENHUM arquivo de `app/platform/**`", () => {
    const arquivos = arquivosDeProducao(RAIZ_DO_CONSOLE)
    // Vivacidade: "zero ocorrências" é indistinguível de "a varredura não olhou para arquivo
    // nenhum". O console tem dezenas de arquivos; se este número desabar, a régua morreu.
    expect(arquivos.length).toBeGreaterThan(5)
    const culpados = arquivos.filter((a) => codigoDe(fs.readFileSync(a, "utf8")).includes("Desativar"))
    expect(culpados).toEqual([])
  })

  it("controle positivo: o detector de `Desativar` DETECTA", () => {
    // Sem isto, a asserção acima ficaria verde se `codigoDe` passasse a devolver string vazia.
    expect(codigoDe('const r = "Desativar empresa"')).toContain("Desativar")
  })
})

describe("AC7 — `decidirDesfecho`: só o sucesso fecha o diálogo", () => {
  it("**controle positivo** — `200` fecha, e sem erro nenhum", () => {
    // Sem este caso, tudo abaixo seria satisfeito por um `decidirDesfecho` que NUNCA fecha — que
    // é o outro defeito, e o mais irritante de todos: o operador salva e a tela não sai da frente.
    expect(decidirDesfecho(true, 200, {})).toEqual({ fecha: true, erro: null })
    expect(decidirDesfecho(true, 200, { message: "ignorada" })).toEqual({ fecha: true, erro: null })
  })

  it("falha NÃO fecha — e a mensagem do servidor é a que o operador lê", () => {
    expect(decidirDesfecho(false, 400, { error: "MOTIVO_OBRIGATORIO", message: "motivo obrigatório" })).toEqual({
      fecha: false,
      erro: "motivo obrigatório",
    })
  })

  it("sem `message`, o código do `error` serve — é melhor que silêncio", () => {
    expect(decidirDesfecho(false, 403, { error: "FORBIDDEN" })).toEqual({
      fecha: false,
      erro: "FORBIDDEN",
    })
  })

  it("corpo vazio (5xx de gateway, sem JSON) cai no `HTTP {status}`, e o status é o REAL", () => {
    expect(decidirDesfecho(false, 502, {})).toEqual({ fecha: false, erro: "Falhou (HTTP 502)." })
    // Dois status diferentes, duas frases diferentes: `502` não pode virar um `500` de enfeite.
    expect(decidirDesfecho(false, 500, {}).erro).toBe("Falhou (HTTP 500).")
  })

  it("campo em BRANCO não é mensagem: `\"\"` não pode deixar o diálogo mudo", () => {
    // `corpo.message ?? corpo.error` — a forma anterior — aceitava `""`, porque string vazia não
    // é nullish. O diálogo ficaria aberto sem uma palavra sobre o que houve.
    expect(decidirDesfecho(false, 500, { message: "", error: "ESCRITA_FALHOU" }).erro).toBe("ESCRITA_FALHOU")
    expect(decidirDesfecho(false, 500, { message: "   ", error: "" }).erro).toBe("Falhou (HTTP 500).")
  })

  it("invariante: quando NÃO fecha, sempre há uma frase — nunca `null` nem `\"\"`", () => {
    const corpos = [
      {},
      { message: "" },
      { error: "" },
      { message: "  ", error: "  " },
      { error: "X" },
      { message: "Y" },
    ]
    for (const corpo of corpos) {
      const d = decidirDesfecho(false, 503, corpo)
      expect(d.fecha).toBe(false)
      expect(typeof d.erro).toBe("string")
      expect((d.erro ?? "").trim()).not.toBe("")
    }
  })
})

describe("AC7 — o diálogo OBEDECE à decisão (régua de forma sobre o `confirmar()`)", () => {
  // Recorte do `confirmar()` inteiro: da assinatura até o `return createPortal(` que abre o JSX.
  // `trechoDelimitado` é fail-closed — abertura ou fechamento ausente devolve `""` — e o `it`
  // abaixo afirma isso explicitamente, porque `""` satisfaz qualquer `not.toContain`.
  const confirmar = () =>
    trechoDelimitado(
      fs.readFileSync(DIALOGO, "utf8"),
      "async function confirmar()",
      "return createPortal(",
    )

  it("vivacidade: o trecho do `confirmar()` foi realmente recortado", () => {
    const trecho = confirmar()
    expect(trecho).not.toBe("")
    expect(trecho).toContain("await fetch(")
  })

  it("a decisão é CONSUMIDA — os dois campos, não só a chamada", () => {
    // Chamar `decidirDesfecho` e ignorar o retorno mediria a função, não o desfecho.
    const trecho = confirmar()
    expect(trecho).toContain("decidirDesfecho(res.ok, res.status, corpo)")
    expect(trecho).toContain("setErro(desfecho.erro)")
    expect(trecho).toContain("if (!desfecho.fecha)")
  })

  it("`aoFechar()` acontece UMA vez em `confirmar()`, e logo depois do `router.refresh()`", () => {
    const trecho = confirmar()
    // Uma: acrescentar `aoFechar()` ao ramo de erro vira 2 e reprova aqui (QA-900-60-1).
    expect(ocorrenciasNoCodigo(trecho, "aoFechar()")).toBe(1)
    // Depois do refresh: sem esta linha, mover o único `aoFechar()` do sucesso PARA o ramo de
    // erro manteria a contagem em 1 — o defeito passaria de novo.
    expect(trecho).toContain("router.refresh()\naoFechar()")
  })

  it("o ramo de falha preserva o diálogo: tem `return`, e NÃO tem `aoFechar`", () => {
    const ramo = trechoDelimitado(confirmar(), "if (!desfecho.fecha)", "}")
    // `""` passaria no `not.toContain` de graça — por isso as positivas vêm primeiro.
    expect(ramo).not.toBe("")
    expect(ramo).toContain("setEnviando(false)")
    expect(ramo).toContain("return")
    expect(ramo).not.toContain("aoFechar")
  })
})
