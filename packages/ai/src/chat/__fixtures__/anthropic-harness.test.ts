/**
 * Story 88-2 — o CONTRATO do harness, e a catraca que impede a 7ª fábrica ad-hoc.
 *
 * POR QUE A AC1 SE EXERCE AQUI, E NUNCA SOBRE UM TURNO REAL
 * --------------------------------------------------------
 * A contagem de chamadas de um turno **depende do relógio**: `processMessage` dispara
 * duas escritas fire-and-forget, e uma delas (`atualizarResumoComLastro`) tem um
 * `await` antes do `create` — então ela cai FORA do tick em que o turno resolve.
 * Medido nesta árvore: 2 no retorno, 3 depois de ~300 ms quando `msgCount % 5 == 0`.
 * Qualquer asserção sobre `chamadas.length` em cima de um turno é flaky por
 * construção, e a `87-16` ainda muda o número. Aqui as chamadas são feitas
 * DIRETAMENTE no fake, N vezes, sem pipeline e sem fire-and-forget: determinístico.
 * Sobre turno real só valem `doTurno()`, `resposta()` e `auxiliares()`.
 *
 * ⚠️ POR QUE OS CASTS DAS FIXTURES DE MUTAÇÃO SÃO MONTADOS, E NÃO ESCRITOS
 * ------------------------------------------------------------------------
 * Este arquivo ESTÁ na população que a catraca varre (`chat/(...)/*.test.ts`) e É
 * lido do disco pelo caso de igualdade de conjunto. Se as fixtures da régua
 * trouxessem o padrão procurado por extenso — inclusive dentro de um comentário —,
 * a varredura acenderia contra o próprio arquivo que a testa, e o "conserto" natural
 * seria pôr este arquivo na lista de exceções: a auto-exceção que a `87-16` proibiu
 * por escrito. Por isso as fixtures montam o padrão por `join`, e por isso **nenhuma
 * linha deste arquivo — código ou comentário — transcreve o que a régua procura**.
 * Já mordeu quatro vezes nesta casa; a última foi um docstring de uma linha.
 */
import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import type Anthropic from "@anthropic-ai/sdk"
import { findRepoRoot } from "../../prompts/snapshot"
import {
  criarAnthropicFake,
  arquivosComFabricaAdHoc,
  arquivosExcecionados,
  EXCECOES_DECLARADAS,
  type FonteVarrida,
} from "./anthropic-harness"

/** Params mínimos válidos para uma chamada DE TURNO (tem `system`). */
function paramsDeTurno(texto: string): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: [{ type: "text", text: `sistema — ${texto}` }],
    messages: [{ role: "user", content: [{ type: "text", text: texto }] }],
  }
}

/** Params de uma chamada AUXILIAR (sem `system`) — o formato do writer/resumo. */
function paramsAuxiliares(texto: string): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    messages: [{ role: "user", content: texto }],
  }
}

// ────────────────────────────────────────────────────────────────────────────
// AC1 — uma fábrica, TODAS as chamadas, em ordem, sem sobrescrever
// ────────────────────────────────────────────────────────────────────────────

describe("AC1 — captura todas as chamadas, em ordem, com os params crus", () => {
  it("três chamadas viram três entradas, com indice 0,1,2 na ordem de invocação", async () => {
    const { anthropic, captura } = criarAnthropicFake()
    await anthropic.messages.create(paramsDeTurno("primeira"))
    await anthropic.messages.create(paramsAuxiliares("segunda"))
    await anthropic.messages.create(paramsAuxiliares("terceira"))

    expect(captura.chamadas).toHaveLength(3)
    expect(captura.chamadas.map((c) => c.indice)).toEqual([0, 1, 2])
    // As pontas são o que discrimina: um teste que só conte 3 passa verde num
    // harness que sobrescreva e reinsira.
    expect(captura.chamadas[0]!.bloco).toBe("primeira")
    expect(captura.chamadas[1]!.bloco).toBe("segunda")
    expect(captura.chamadas[2]!.bloco).toBe("terceira")
  })

  it("o MessageCreateParams cru é preservado — nada é normalizado fora dos acessores", async () => {
    const { anthropic, captura } = criarAnthropicFake()
    const params = paramsDeTurno("cru")
    await anthropic.messages.create(params)

    expect(captura.chamadas[0]!.params).toBe(params as unknown as Record<string, unknown>)
    expect(captura.chamadas[0]!.model).toBe("claude-sonnet-4-6")
    expect(captura.chamadas[0]!.maxTokens).toBe(1024)
  })

  it("duas chamadas IDÊNTICAS geram duas entradas — nenhuma é descartada ou deduplicada", async () => {
    const { anthropic, captura } = criarAnthropicFake()
    await anthropic.messages.create(paramsAuxiliares("igual"))
    await anthropic.messages.create(paramsAuxiliares("igual"))
    expect(captura.chamadas).toHaveLength(2)
    expect(captura.auxiliares()).toHaveLength(2)
  })

  it("acessores derivados: historico, papeis, bloco e blocosDoSystem saem da mesma chamada", async () => {
    const { anthropic, captura } = criarAnthropicFake()
    await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 10,
      system: [
        { type: "text", text: "estatico", cache_control: { type: "ephemeral" } },
        { type: "text", text: "|dinamico" },
      ],
      messages: [
        { role: "user", content: "m1" },
        { role: "assistant", content: "m2" },
        { role: "user", content: [{ type: "text", text: "[SISTEMA: x] atual" }] },
      ],
    })

    const c = captura.resposta()
    expect(c.historico).toEqual(["m1", "m2"])
    expect(c.papeis).toEqual(["user", "assistant"])
    expect(c.bloco).toBe("[SISTEMA: x] atual")
    expect(c.system).toBe("estatico|dinamico")
    expect(c.blocosDoSystem).toEqual([
      { text: "estatico", cacheavel: true },
      { text: "|dinamico", cacheavel: false },
    ])
  })
})

// ────────────────────────────────────────────────────────────────────────────
// AC2 — o rótulo é declarado e a ambiguidade FALHA ALTO
// ────────────────────────────────────────────────────────────────────────────

describe("AC2 — rótulo por `system`, e `resposta()` estoura na ambiguidade", () => {
  it("(i) chamada com `system` é 'resposta'; sem `system` é 'auxiliar'", async () => {
    const { anthropic, captura } = criarAnthropicFake()
    await anthropic.messages.create(paramsDeTurno("com system"))
    await anthropic.messages.create(paramsAuxiliares("sem system"))
    expect(captura.chamadas.map((c) => c.rotulo)).toEqual(["resposta", "auxiliar"])
  })

  /**
   * 🔴 M3 — fail-loud. É o que separa este harness dos cinco que ele substitui:
   * quatro deles resolviam a ambiguidade escolhendo em silêncio ("a primeira que
   * trouxer `system`", flag `capturou`), e foi assim que nasceu o falso verde
   * documentado no repositório.
   */
  it("(ii) com DUAS chamadas de turno, resposta() estoura dizendo quantas achou", async () => {
    const { anthropic, captura } = criarAnthropicFake()
    await anthropic.messages.create(paramsDeTurno("a"))
    await anthropic.messages.create(paramsDeTurno("b"))

    expect(() => captura.resposta()).toThrowError(/EXATAMENTE uma chamada de turno/)
    expect(() => captura.resposta()).toThrowError(/achei 2/)
    expect(() => captura.resposta()).toThrowError(/doTurno\(\)\[i\]/)
  })

  it("(ii-b) com ZERO chamadas de turno, resposta() estoura em vez de devolver a auxiliar", async () => {
    const { anthropic, captura } = criarAnthropicFake()
    await anthropic.messages.create(paramsAuxiliares("só auxiliar"))
    expect(() => captura.resposta()).toThrowError(/achei 0/)
    // Controle: a auxiliar ESTÁ capturada — o estouro é sobre o rótulo, não sobre
    // o harness ter perdido a chamada.
    expect(captura.auxiliares()).toHaveLength(1)
  })

  it("(iii) doTurno() devolve as chamadas de turno em ordem — é o que a Onda 3 usa", async () => {
    const { anthropic, captura } = criarAnthropicFake()
    await anthropic.messages.create(paramsDeTurno("t1"))
    await anthropic.messages.create(paramsAuxiliares("aux"))
    await anthropic.messages.create(paramsDeTurno("t2"))

    expect(captura.doTurno().map((c) => c.bloco)).toEqual(["t1", "t2"])
    expect(captura.doTurno().map((c) => c.indice)).toEqual([0, 2])
    expect(captura.auxiliares().map((c) => c.indice)).toEqual([1])
  })

  /**
   * 🔴 M4 — quebra a colinearidade `primeira == resposta`, que é VERDADEIRA em
   * produção hoje e por isso nunca foi testada. Um harness que rotulasse por ordem
   * passaria em todos os casos acima e cairia só aqui.
   */
  it("(iv) com a AUXILIAR chegando primeiro, a de `system` continua sendo a resposta", async () => {
    const { anthropic, captura } = criarAnthropicFake()
    await anthropic.messages.create(paramsAuxiliares("auxiliar veio antes"))
    await anthropic.messages.create(paramsDeTurno("a resposta é esta"))

    expect(captura.chamadas.map((c) => c.rotulo)).toEqual(["auxiliar", "resposta"])
    expect(captura.resposta().indice).toBe(1)
    expect(captura.resposta().bloco).toBe("a resposta é esta")
  })

  it("auxiliares() pode ser vazio, e isso é válido (a 87-16 remove a chamada do writer)", async () => {
    const { anthropic, captura } = criarAnthropicFake()
    await anthropic.messages.create(paramsDeTurno("turno solitário"))
    expect(captura.auxiliares()).toEqual([])
    expect(captura.resposta().indice).toBe(0)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// AC3 — `tools` e `tool_choice` voltam IDÊNTICOS ao que entrou
// ────────────────────────────────────────────────────────────────────────────

const TOOL_AGENDAR = {
  name: "agendar_visita",
  description: "Agenda uma visita ao decorado",
  input_schema: {
    type: "object" as const,
    properties: {
      data: { type: "string" },
      hora: { type: "string" },
    },
    required: ["data", "hora"],
  },
}

describe("AC3 — tools e tool_choice são lidos dos params", () => {
  /**
   * 🔴 M6 — sem este caso a AC3 nasce satisfeita. Em 100% dos turnos de HOJE os dois
   * campos são `undefined`; afirmar `undefined` é afirmar nada. O que mede é a
   * igualdade com o que entrou.
   */
  const TOOL_CHOICE_FORCADO = { type: "tool" as const, name: "agendar_visita" }

  async function turnoComTool() {
    const { anthropic, captura } = criarAnthropicFake()
    await anthropic.messages.create({
      ...paramsDeTurno("quero visitar sábado"),
      tools: [TOOL_AGENDAR],
      tool_choice: TOOL_CHOICE_FORCADO,
    })
    return captura.resposta()
  }

  // Os dois acessores têm caso PRÓPRIO de propósito: num caso só, neutralizar
  // `tools` e neutralizar `toolChoice` acenderiam o MESMO vermelho, e uma das duas
  // guardas ficaria escondida atrás da outra.
  it("`tools` volta idêntico ao que entrou", async () => {
    const c = await turnoComTool()
    expect(c.tools).toEqual([TOOL_AGENDAR])
    expect((c.tools as Array<{ name: string }>)[0]!.name).toBe("agendar_visita")
  })

  it("`tool_choice` volta idêntico ao que entrou — mesma referência", async () => {
    const c = await turnoComTool()
    expect(c.toolChoice).toEqual(TOOL_CHOICE_FORCADO)
    expect(c.toolChoice).toBe(TOOL_CHOICE_FORCADO)
  })

  it("CONTROLE — numa chamada sem tools, os dois acessores devolvem undefined", async () => {
    // Este é o estado de produção hoje. Ele sozinho NÃO prova nada (é o que um
    // acessor quebrado devolveria); vale só ao lado do caso de cima.
    const { anthropic, captura } = criarAnthropicFake()
    await anthropic.messages.create(paramsDeTurno("turno de hoje"))
    expect(captura.resposta().tools).toBeUndefined()
    expect(captura.resposta().toolChoice).toBeUndefined()
  })
})

// ────────────────────────────────────────────────────────────────────────────
// AC4 — a resposta do fake aceita BLOCOS arbitrários, na ordem dada
// ────────────────────────────────────────────────────────────────────────────

interface RespostaCrua {
  content: Array<Record<string, unknown>>
  usage: Record<string, number>
}

describe("AC4 — blocos de resposta chegam na ordem dada", () => {
  it("tool_use na posição 0 e texto na 1 — é o que habilita a 88-1", async () => {
    const blocos = [
      { type: "tool_use", id: "toolu_1", name: "agendar_visita", input: { data: "2026-08-17" } },
      { type: "text", text: "Marquei!" },
    ]
    const { anthropic } = criarAnthropicFake({ resposta: blocos })
    const r = (await anthropic.messages.create(paramsDeTurno("x"))) as unknown as RespostaCrua

    expect(r.content).toEqual(blocos)
    expect(r.content[0]!.type).toBe("tool_use")
    expect(r.content[1]!.type).toBe("text")
  })

  it("string vira um único bloco de texto", async () => {
    const { anthropic } = criarAnthropicFake({ resposta: "Oi!" })
    const r = (await anthropic.messages.create(paramsDeTurno("x"))) as unknown as RespostaCrua
    expect(r.content).toEqual([{ type: "text", text: "Oi!" }])
  })

  it("`respostas` serve uma por chamada DE TURNO — o loop de tool das Ondas 2–3", async () => {
    const { anthropic } = criarAnthropicFake({ respostas: ["primeira volta", "segunda volta"] })
    const r1 = (await anthropic.messages.create(paramsDeTurno("a"))) as unknown as RespostaCrua
    // A auxiliar no meio NÃO consome a lista: ela não é chamada de turno.
    await anthropic.messages.create(paramsAuxiliares("aux"))
    const r2 = (await anthropic.messages.create(paramsDeTurno("b"))) as unknown as RespostaCrua

    expect(r1.content[0]!.text).toBe("primeira volta")
    expect(r2.content[0]!.text).toBe("segunda volta")
  })

  it("usage é sobrescrevível sem perder as chaves de cache que o pipeline lê", async () => {
    const { anthropic } = criarAnthropicFake({ usage: { cache_read_input_tokens: 7 } })
    const r = (await anthropic.messages.create(paramsDeTurno("x"))) as unknown as RespostaCrua
    expect(r.usage.cache_read_input_tokens).toBe(7)
    expect(r.usage.cache_creation_input_tokens).toBe(0)
    expect(r.usage.input_tokens).toBe(1)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// AC7 — a catraca: pura, tolerante a multilinha, e sabe o que faz consigo mesma
// ────────────────────────────────────────────────────────────────────────────

/**
 * O padrão procurado, MONTADO — ver o cabeçalho. Os quatro pedaços são inertes
 * separados; só o `join` produz o que a régua casa.
 */
const PEDACOS_DO_CAST = ["as", "unknown", "as", "Anthropic"]
const CAST_EM_UMA_LINHA = PEDACOS_DO_CAST.join(" ")
const CAST_EM_DUAS_LINHAS = PEDACOS_DO_CAST.join("\n      ")

const FONTE_COM_FABRICA_AD_HOC = [
  "function fakeAnthropic(resposta: string): Anthropic {",
  "  return {",
  "    messages: { create: async () => ({ content: [] }) },",
  `  } ${CAST_EM_UMA_LINHA}`,
  "}",
].join("\n")

const FONTE_COM_CAST_MULTILINHA = [
  "function fakeAnthropic(resposta: string): Anthropic {",
  "  return {",
  "    messages: { create: async () => ({ content: [] }) },",
  `  } ${CAST_EM_DUAS_LINHAS}`,
  "}",
].join("\n")

const FONTE_MIGRADA = [
  'import { criarAnthropicFake } from "./__fixtures__/anthropic-harness"',
  "const { anthropic, captura } = criarAnthropicFake({ resposta: 'Certo!' })",
].join("\n")

describe("AC7-i — a régua é pura e detecta por arquivo, tolerando multilinha", () => {
  it("M5a — fonte com fábrica ad-hoc numa linha: +1", () => {
    expect(arquivosComFabricaAdHoc([{ path: "a.test.ts", source: FONTE_COM_FABRICA_AD_HOC }])).toEqual([
      "a.test.ts",
    ])
  })

  it("M5b — o mesmo cast QUEBRADO EM DUAS LINHAS: +1 (a lição da 87-16)", () => {
    // A régua por linha da 87-16 perdeu 4 de 23 RPCs exatamente aqui: o formatador
    // quebrou a chamada e a varredura devolveu zero pelo motivo errado.
    expect(CAST_EM_DUAS_LINHAS).toContain("\n")
    expect(arquivosComFabricaAdHoc([{ path: "b.test.ts", source: FONTE_COM_CAST_MULTILINHA }])).toEqual([
      "b.test.ts",
    ])
  })

  it("M5c — fonte já migrada para a fábrica única: +0", () => {
    expect(arquivosComFabricaAdHoc([{ path: "c.test.ts", source: FONTE_MIGRADA }])).toEqual([])
  })

  it("a mistura devolve só os dois que casam, preservando a ordem de entrada", () => {
    const encontrados = arquivosComFabricaAdHoc([
      { path: "c.test.ts", source: FONTE_MIGRADA },
      { path: "a.test.ts", source: FONTE_COM_FABRICA_AD_HOC },
      { path: "b.test.ts", source: FONTE_COM_CAST_MULTILINHA },
    ])
    expect(encontrados).toEqual(["a.test.ts", "b.test.ts"])
  })
})

// ────────────────────────────────────────────────────────────────────────────
// AC7-ii/iii/v — a varredura de disco e a igualdade de conjunto
// ────────────────────────────────────────────────────────────────────────────

/**
 * POPULAÇÃO DECLARADA: `packages/ai/src/chat/(...)/*.test.ts`, recursivo.
 *
 * PONTOS CEGOS, declarados e não escondidos:
 *  · `packages/ai/src/flows/*.test.ts` — cinco arquivos também constroem fake da
 *    Anthropic (`classify-contact`, `behavior-analysis`, `marketing-post-request`,
 *    `marketing-suggestions`, `message-review`). Ficam de fora **de propósito**: são
 *    mocks de UM FLOW, não de um TURNO. Varrê-los daria 5 vermelhos legítimos, e é
 *    assim que régua vira ruído que todo mundo aprende a ignorar.
 *  · Um teste de turno criado FORA de `chat/` escapa da varredura. Aceito e escrito.
 */
const RAIZ = findRepoRoot()
const DIR_POPULACAO = path.join("packages", "ai", "src", "chat")

function varrerPopulacao(): FonteVarrida[] {
  const fontes: FonteVarrida[] = []
  const descer = (relativo: string) => {
    for (const entrada of readdirSync(path.join(RAIZ, relativo), { withFileTypes: true })) {
      const filho = `${relativo}/${entrada.name}`
      if (entrada.isDirectory()) descer(filho)
      else if (entrada.name.endsWith(".test.ts")) {
        fontes.push({ path: filho, source: readFileSync(path.join(RAIZ, filho), "utf8") })
      }
    }
  }
  descer(DIR_POPULACAO.split(path.sep).join("/"))
  return fontes
}

const ESTE_ARQUIVO = "packages/ai/src/chat/__fixtures__/anthropic-harness.test.ts"

describe("AC7-ii/iii — a varredura de disco bate com EXCECOES_DECLARADAS, por igualdade de conjunto", () => {
  it("a população não é vazia e contém este próprio arquivo (senão o caso abaixo é vácuo)", () => {
    const fontes = varrerPopulacao()
    expect(fontes.length).toBeGreaterThan(5)
    expect(fontes.map((f) => f.path)).toContain(ESTE_ARQUIVO)
  })

  it("igualdade de CONJUNTO — acende quando alguém cria a próxima E quando alguém esquece de tirar", () => {
    const encontrados = arquivosComFabricaAdHoc(varrerPopulacao()).slice().sort()
    const declarados = arquivosExcecionados().slice().sort()
    expect(encontrados).toEqual(declarados)
  })

  /**
   * 🔴 AC7-vi — a quarta camada da auto-régua, e a razão de ela existir.
   *
   * As três camadas originais (o harness não é `.test.ts`; as fixtures de mutação são
   * strings em memória; o teste do harness fica limpo) protegem o INPUT da régua — e
   * **não o arquivo que carrega o literal**. Este arquivo está na população e é lido
   * do disco logo acima. Sem os `join` do bloco de fixtures, a varredura devolveria
   * ele mesmo, e o conserto natural seria a auto-exceção.
   *
   * Sem este caso, a camada 4 é intenção, não contrato.
   */
  it("AC7-vi — a varredura NÃO devolve este arquivo, embora ele carregue as fixtures da régua", () => {
    const encontrados = arquivosComFabricaAdHoc(varrerPopulacao())
    expect(encontrados).not.toContain(ESTE_ARQUIVO)
    // Controle de vivacidade: a fixture montada REALMENTE casa a régua. Se este
    // `expect` cair, o caso de cima virou verde por a fixture ter deixado de ser
    // um exemplo válido — não por o arquivo estar limpo.
    expect(arquivosComFabricaAdHoc([{ path: "x.test.ts", source: CAST_EM_UMA_LINHA }])).toEqual([
      "x.test.ts",
    ])
  })

  it("toda exceção tem motivo, DONO e condição de saída — e aponta para arquivo existente", () => {
    const populacao = varrerPopulacao().map((f) => f.path)
    for (const e of EXCECOES_DECLARADAS) {
      expect(e.motivo.length).toBeGreaterThan(20)
      expect(e.saida.length).toBeGreaterThan(20)
      // "Condição de saída" sem pagador não é condição, é intenção.
      expect(e.dono).toContain("88-2b")
      expect(populacao).toContain(e.arquivo)
    }
  })
})
