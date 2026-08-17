/**
 * Story 88-2 — O harness que afirma o que a Nicole RECEBEU, não só o que respondeu.
 *
 * POR QUE ESTE MÓDULO EXISTE
 * -------------------------
 * Até aqui, todo teste que roda um turno construía a SUA própria fábrica de fake da
 * Anthropic: 5 arquivos em `chat/`, 5 implementações, **4 mecanismos diferentes** de
 * decidir qual das chamadas do turno guardar — guarda por `=== ""`, flag `capturou`,
 * `TypeError` engolido pelo `.catch` do fire-and-forget, e "não capturar nada".
 * Nenhum deles diz **qual** chamada está sendo afirmada, e nenhum captura
 * `tools`/`tool_choice` — que é a parte de que as Ondas 1–3 do Epic 88 dependem.
 *
 * O modo de falha já está documentado dentro do próprio repositório (`nicole-enabled`,
 * no comentário da fábrica local que esta story remove): apontar a asserção para a
 * chamada auxiliar zera o `system` e o teste passa verde contra string vazia.
 *
 * AS TRÊS DECISÕES QUE FAZEM O INSTRUMENTO VALER
 * ----------------------------------------------
 *  1. **Rótulo por `system`, não por ordem.** É o único eixo estável hoje: as duas
 *     auxiliares (`writer.ts` e `lead-memory.ts`) são ambas `claude-haiku-4-5` e só
 *     se distinguem por `max_tokens` — um eixo que a `87-16` apaga. A regra mora em
 *     `rotular()`, e em lugar nenhum mais.
 *  2. **`resposta()` falha alto.** "Pega a primeira que serve" é exatamente o que
 *     produziu o falso verde acima. Zero ou duas candidatas ⇒ `throw` com a contagem
 *     e a instrução de usar `doTurno()[i]`. **Silêncio aqui é o defeito que esta
 *     story existe para matar.**
 *  3. **`params` cru guardado inteiro.** Todo acessor futuro (`betas`,
 *     `disable_parallel_tool_use`, o que vier) sai daí sem tocar o harness.
 *
 * O QUE ELE NÃO É
 * ---------------
 * **Ele faz o fake do CLIENTE; ele não semeia banco.** Cada arquivo semeia um mundo
 * diferente (`createFakeSupabase`), e unificar o *seed* junto com o *fake* é o
 * caminho mais curto para uma fixture compartilhada mutável — armadilha que o
 * `pipeline-agenda-state.test.ts` já documenta ("função, não constante: o
 * `processMessage` MUTA o `collected_data`").
 *
 * ⚠️ ESTE ARQUIVO NÃO É `.test.ts`, E ISSO É DESENHO
 * --------------------------------------------------
 * Ele contém o cast que a catraca `arquivosComFabricaAdHoc` procura — é ele quem
 * constrói o fake. A população da catraca é `packages/ai/src/chat/(...)/*.test.ts`;
 * este arquivo fica de fora por **estrutura**, não por lista de exceção. Auto-exceção
 * em lista de ignore é o que a `87-16` proibiu por escrito.
 */
import type Anthropic from "@anthropic-ai/sdk"

// ────────────────────────────────────────────────────────────────────────────
// O que uma chamada capturada expõe
// ────────────────────────────────────────────────────────────────────────────

export interface BlocoDeSystem {
  text: string
  /** `cache_control` presente no bloco — é o que a 21.3 mede. */
  cacheavel: boolean
}

export interface MensagemCapturada {
  role: string
  content: unknown
}

export interface ChamadaCapturada {
  /** Posição na ordem de invocação. Nunca reordenado. */
  indice: number
  /** "resposta" ⇔ `params.system !== undefined`. Regra única (`rotular`). */
  rotulo: "resposta" | "auxiliar"
  /** O `MessageCreateParams` CRU, como chegou. Nada é normalizado fora dos acessores. */
  params: Record<string, unknown>
  /** Blocos de `system` concatenados (`""` quando ausente). */
  system: string
  blocosDoSystem: BlocoDeSystem[]
  messages: MensagemCapturada[]
  /** Conteúdos de TODAS as mensagens menos a última — o `history` carregado. */
  historico: string[]
  /** Papéis de todas menos a última. */
  papeis: string[]
  /** Texto da ÚLTIMA mensagem — é onde mora o bloco `[SISTEMA]`. */
  bloco: string
  tools: unknown | undefined
  toolChoice: unknown | undefined
  model: string | undefined
  maxTokens: number | undefined
}

export interface CapturaAnthropic {
  /** TODAS, em ordem de invocação. Nunca sobrescrito, nunca filtrado. */
  chamadas: ChamadaCapturada[]
  /** As rotuladas "resposta", em ordem. Na Onda 3 o loop de tool terá DUAS. */
  doTurno(): ChamadaCapturada[]
  /** Açúcar para o caso de hoje. ESTOURA se `doTurno().length !== 1`. */
  resposta(): ChamadaCapturada
  /**
   * As rotuladas "auxiliar". **Pode ser `[]` e isso é válido** — a `87-16` remove o
   * `processConversationTurn`, e depois dela pode não haver auxiliar nenhuma.
   */
  auxiliares(): ChamadaCapturada[]
}

/** Bloco de conteúdo da resposta do fake — string vira `[{ type:"text", text }]`. */
export type RespostaDoFake = string | Array<Record<string, unknown>>

export interface OpcoesDoFake {
  /** Resposta usada por todas as chamadas (o caso comum). */
  resposta?: RespostaDoFake
  /**
   * Respostas por chamada DE TURNO (índice em `doTurno()`), para o loop de tool das
   * Ondas 2–3. Quando a lista acaba, repete a última. Não se aplica às auxiliares.
   */
  respostas?: RespostaDoFake[]
  usage?: Partial<
    Record<
      "input_tokens" | "output_tokens" | "cache_creation_input_tokens" | "cache_read_input_tokens",
      number
    >
  >
}

const RESPOSTA_PADRAO = "Certo!"

const USAGE_PADRAO = {
  input_tokens: 1,
  output_tokens: 1,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
}

// ────────────────────────────────────────────────────────────────────────────
// Os acessores — um por eixo, de propósito
// ────────────────────────────────────────────────────────────────────────────
//
// Cada leitura vive numa função-folha própria porque é assim que a família de
// mutações M1a/M1b/M1c consegue isolar UM caminho por vez. Se `historico`,
// `papeis` e `bloco` saíssem todos de `lerMessages`, mutar a leitura de mensagens
// acenderia os três de uma vez e a tabela "arquivo → acessor → vermelhos" mediria
// um número só, sem dizer de onde ele veio.

/**
 * 🔴 A REGRA DO RÓTULO — mora AQUI e em lugar nenhum mais (AC2-i).
 *
 * Não é por ORDEM: em produção a chamada de resposta é sempre a primeira, o que
 * torna `primeira == resposta` verdadeiro hoje e faz um harness que rotule por ordem
 * passar em tudo. A colinearidade só se quebra com a auxiliar chegando primeiro (M4).
 */
function rotular(params: Record<string, unknown>): "resposta" | "auxiliar" {
  return params.system !== undefined ? "resposta" : "auxiliar"
}

function lerSystem(params: Record<string, unknown>): string {
  const s = params.system
  if (Array.isArray(s)) {
    return (s as Array<{ text?: string }>).map((b) => b.text ?? "").join("")
  }
  return s === undefined || s === null ? "" : String(s)
}

function lerBlocosDoSystem(params: Record<string, unknown>): BlocoDeSystem[] {
  const s = params.system
  if (Array.isArray(s)) {
    return (s as Array<{ text?: string; cache_control?: unknown }>).map((b) => ({
      text: b.text ?? "",
      cacheavel: b.cache_control != null,
    }))
  }
  if (s === undefined || s === null) return []
  return [{ text: String(s), cacheavel: false }]
}

function lerMessages(params: Record<string, unknown>): MensagemCapturada[] {
  const m = params.messages
  return Array.isArray(m) ? (m as MensagemCapturada[]) : []
}

function lerHistorico(messages: MensagemCapturada[]): string[] {
  return messages.slice(0, -1).map((m) => (typeof m.content === "string" ? m.content : ""))
}

function lerPapeis(messages: MensagemCapturada[]): string[] {
  return messages.slice(0, -1).map((m) => m.role)
}

function lerBloco(messages: MensagemCapturada[]): string {
  const ultima = messages[messages.length - 1]
  if (!ultima) return ""
  const conteudo = ultima.content
  if (Array.isArray(conteudo)) {
    return (conteudo as Array<{ type?: string; text?: string }>)
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("")
  }
  return conteudo === undefined || conteudo === null ? "" : String(conteudo)
}

function lerTools(params: Record<string, unknown>): unknown | undefined {
  return params.tools
}

function lerToolChoice(params: Record<string, unknown>): unknown | undefined {
  return params.tool_choice
}

function montarChamada(params: Record<string, unknown>, indice: number): ChamadaCapturada {
  const messages = lerMessages(params)
  return {
    indice,
    rotulo: rotular(params),
    params,
    system: lerSystem(params),
    blocosDoSystem: lerBlocosDoSystem(params),
    messages,
    historico: lerHistorico(messages),
    papeis: lerPapeis(messages),
    bloco: lerBloco(messages),
    tools: lerTools(params),
    toolChoice: lerToolChoice(params),
    model: typeof params.model === "string" ? params.model : undefined,
    maxTokens: typeof params.max_tokens === "number" ? params.max_tokens : undefined,
  }
}

function normalizarResposta(r: RespostaDoFake): Array<Record<string, unknown>> {
  // Array passa CRU, na ordem dada — é o que habilita a 88-1 a pôr `tool_use` na
  // posição 0 sem escrever mais um mock (AC4).
  return Array.isArray(r) ? r : [{ type: "text", text: r }]
}

// ────────────────────────────────────────────────────────────────────────────
// A fábrica
// ────────────────────────────────────────────────────────────────────────────

export function criarAnthropicFake(opts: OpcoesDoFake = {}): {
  anthropic: Anthropic
  captura: CapturaAnthropic
} {
  const chamadas: ChamadaCapturada[] = []

  const doTurno = () => chamadas.filter((c) => c.rotulo === "resposta")
  const auxiliares = () => chamadas.filter((c) => c.rotulo === "auxiliar")

  const resposta = () => {
    const doTurnoAgora = doTurno()
    if (doTurnoAgora.length !== 1) {
      throw new Error(
        `[88-2] resposta() exige EXATAMENTE uma chamada de turno (com \`system\`), e achei ${doTurnoAgora.length} ` +
          `(de ${chamadas.length} chamadas no total: ${chamadas.map((c) => `${c.indice}:${c.rotulo}`).join(", ") || "nenhuma"}). ` +
          `Se o turno faz mais de uma chamada de resposta — o loop de tool das Ondas 2–3 faz —, ` +
          `use doTurno()[i] e diga QUAL você está afirmando. Se faz zero, o turno não chegou ao modelo: ` +
          `veja se o pipeline retornou antes (fora de expediente, guarda de canal) em vez de ajustar a asserção.`
      )
    }
    return doTurnoAgora[0]!
  }

  const captura: CapturaAnthropic = { chamadas, doTurno, resposta, auxiliares }

  const escolherResposta = (rotulo: "resposta" | "auxiliar", indiceDeTurno: number): RespostaDoFake => {
    if (rotulo === "resposta" && opts.respostas && opts.respostas.length > 0) {
      return opts.respostas[Math.min(indiceDeTurno, opts.respostas.length - 1)]!
    }
    return opts.resposta ?? RESPOSTA_PADRAO
  }

  const create = async (params: Record<string, unknown>) => {
    const chamada = montarChamada(params ?? {}, chamadas.length)
    chamadas.push(chamada)
    const indiceDeTurno = doTurno().length - 1
    return {
      content: normalizarResposta(escolherResposta(chamada.rotulo, indiceDeTurno)),
      usage: { ...USAGE_PADRAO, ...opts.usage },
    }
  }

  return { anthropic: { messages: { create } } as unknown as Anthropic, captura }
}

// ────────────────────────────────────────────────────────────────────────────
// A catraca — função PURA, para as fixtures de mutação nunca tocarem o disco
// ────────────────────────────────────────────────────────────────────────────

/**
 * Detecção POR ARQUIVO (não por linha) e tolerante a quebra de linha entre os
 * termos. A lição é da `87-16`: uma régua por linha perdeu 4 de 23 RPCs porque a
 * chamada estava quebrada em duas linhas pelo formatador.
 *
 * O padrão usa `\s+` entre os termos, então **ele próprio não contém** a sequência
 * que procura — o que é um bônus, não a defesa. A defesa é este arquivo não ser
 * `.test.ts`.
 */
export const PADRAO_FABRICA_AD_HOC = /as\s+unknown\s+as\s+Anthropic/

export interface FonteVarrida {
  /** Caminho relativo à raiz do repo, com `/`. */
  path: string
  source: string
}

export function arquivosComFabricaAdHoc(fontes: FonteVarrida[]): string[] {
  return fontes.filter((f) => PADRAO_FABRICA_AD_HOC.test(f.source)).map((f) => f.path)
}

export interface ExcecaoDeclarada {
  /** Caminho relativo à raiz do repo. */
  arquivo: string
  motivo: string
  /** Quem paga. Exceção com condição de saída e sem dono é porta aberta, não contenção. */
  dono: string
  saida: string
}

/**
 * 🔴 MEDIDA NA HORA DA IMPLEMENTAÇÃO, contra a base desta branch (`a60a1bc6`).
 *
 * A comparação da AC7-ii é por **IGUALDADE DE CONJUNTO**, não por "está contido".
 * Ela acende nos DOIS sentidos: alguém cria a próxima fábrica ad-hoc ⇒ vermelho;
 * alguém migra uma exceção e esquece de tirá-la daqui ⇒ vermelho. Régua que só
 * cresce é régua que nasce satisfeita.
 *
 * ⚠️ ESTA LISTA VAI ACENDER NO MERGE, E ISSO É O DESENHO FUNCIONANDO. Duas fábricas
 * que não existem nesta base chegam com a fila:
 *   · `pipeline-collected-data.test.ts`      — criado pelo #428 (`87-11`)
 *   · `pipeline-ai-summary-no-prompt.test.ts` — criado pela `87-16`
 * Quem fizer o merge migra as duas ou as acrescenta aqui, com motivo e dono. O
 * vermelho é o pedido de decisão; não é para ser silenciado com uma linha a mais
 * sem que alguém tenha olhado.
 */
export const EXCECOES_DECLARADAS: ReadonlyArray<ExcecaoDeclarada> = [
  {
    arquivo: "packages/ai/src/chat/pipeline-corretor-no-historico.test.ts",
    motivo:
      "Editado pelo #428 (Story 87-11), aberto. Migrar aqui é fabricar conflito num PR que já tem janela de deploy marcada.",
    dono: "88-2b — migrar as fábricas residuais",
    saida: "Depois do merge do #428, a 88-2b migra este arquivo e remove esta entrada.",
  },
]

export function arquivosExcecionados(): string[] {
  return EXCECOES_DECLARADAS.map((e) => e.arquivo)
}
