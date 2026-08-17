/**
 * Story 87-5 (item `W1-7`) — a Nicole passa a enxergar o corretor.
 *
 * O defeito, medido em produção (15/08, 30 dias): `role='broker'` é o MAIOR
 * volume dos três — 1.288 mensagens em 305 conversas, contra 1.042/194 do lead
 * e 588/144 da Nicole — e dois leitores a descartavam com o mesmo
 * `.in("role", ["user","assistant"])`. Em 10 conversas o corretor falou e a
 * Nicole voltou a responder depois: 30 respostas cegas para a negociação em
 * curso.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COMO ESTE ARQUIVO SE PROTEGE DE FICAR VERDE POR ACIDENTE
 *
 * O risco desta story tem nome: um teste que só verifique "a fala do corretor
 * aparece" fica verde **porque o histórico inteiro aparece**. Por isso, além do
 * caso positivo, cada bloco carrega:
 *
 *   • **controle positivo** — a fala do lead e a da Nicole continuam chegando,
 *     com o papel certo e SEM rótulo;
 *   • **controle negativo** — o rótulo não pode ser aplicado ao papel errado;
 *     um `broker` confundido com `assistant` tem de deixar o teste VERMELHO;
 *   • **régua que não nasce satisfeita** — as fixtures que medem "o corretor
 *     entrou" NÃO contêm os três papéis de enfeite: a asserção é sobre a
 *     POSIÇÃO e o CONTEÚDO exatos, não sobre "existem três papéis".
 *
 * A mutação medida (o número de testes que caem ao remover o rótulo, ao mapear
 * `broker → assistant` no tipo interno e ao remover a normalização da
 * transição) está no Dev Agent Record da story.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Harness: `createFakeSupabase` da 75-279 — usar, não recriar. Relógio FIXO,
 * pela mesma razão da 87-8: sem ele a fixture "sábado" só resolve quando a
 * suíte roda num dia certo.
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import type Anthropic from "@anthropic-ai/sdk"
import { STAGE_IDS } from "@trifold/shared"
import { processMessageWithMetadata, CONTEXTO_FALA_DE_CORRETOR, stripSystemBlocks } from "./pipeline"
import {
  loadConversationHistory,
  rotuloDeCorretor,
  prefixarFalaDeCorretor,
  toAnthropicHistory,
  primeiroNome,
  ROTULO_CORRETOR_PREFIXO,
} from "./conversation-history"
import { createFakeSupabase, type FakeSupabase, type Row } from "./__fixtures__/fake-supabase"

const ORG = "org-1"
const CONVERSATION = "conv-1"
const LEAD = "lead-1"

/** Quarta-feira, 10:00 BRT. O "sábado" das fixtures resolve para 15/08/2026. */
const NOW = "2026-08-12T13:00:00Z"

/** Fala que LIGA o modo agendamento (`NICOLE_TALKED_VISIT_RE`). */
const FALA_DE_VISITA = "Que tal agendar uma visita ao decorado? Qual o melhor dia pra você?"
/** Fala que NÃO liga o modo agendamento — nenhum termo de agenda. */
const FALA_NEUTRA = "O condomínio tem área de lazer completa, com piscina e espaço gourmet."
/** Pergunta de nome — o que arma o `nameExpected` da 75-161. */
const PERGUNTA_DE_NOME = "Antes de continuar, como posso te chamar?"

/** O caso real que originou a AC5: o Odair falou isso na conversa da Sandra. */
const FALA_DO_ODAIR = "Consegui a entrada de 35 mil parcelada em 10x, fechamos assim?"

interface Spec {
  role: "user" | "assistant" | "broker"
  content: string
  metadata?: Record<string, unknown>
}

interface Turno {
  fake: FakeSupabase
  /** Conteúdos do `history` que foram para a Anthropic, em ordem. */
  historico: string[]
  /** Papéis do `history` que foram para a Anthropic — o que a fronteira produziu. */
  papeis: string[]
  /** O array `messages` INTEIRO (histórico + mensagem atual), só os papéis. */
  papeisComAtual: string[]
  /** Quantidade de entradas no array `messages` entregue à API. */
  totalEntradas: number
  bloco: string
  system: string
  /**
   * Os blocos do `system` COMO ARRAY, com a marca de cache. `system` (a string
   * concatenada) não distingue bloco cacheável de `dynamicSuffix` — e a AC5-(ii)
   * é exatamente sobre essa distinção. Medido: com a instrução movida para um
   * bloco estático, a asserção sobre a string continuava verde.
   */
  blocos: Array<{ text: string; cacheavel: boolean }>
  eventos: Array<{ event_type: string; metadata?: Record<string, unknown> }>
  estado: Record<string, unknown>
  lead: Row | undefined
  handoffSummary: string | undefined
  /** A fala que ficou GRAVADA em `messages` (é o que o lead recebeu). */
  respostaGravada: string
}

/**
 * `created_at` ISO estritamente crescente e `id` ZERO-PADDED — o fake ordena com
 * `String(...).localeCompare`, e com id não-padded (`m1 < m10 < m2`) o desempate
 * ordenaria errado e o teste passaria verde por acidente (Armadilha 3 da 87-8).
 *
 * `opts` existe para o bloco de ISOLAMENTO ENTRE CONVERSAS: semear uma SEGUNDA
 * conversa exige id/relógio próprios. Os defaults reproduzem byte a byte a forma
 * anterior — nenhuma fixture existente muda.
 */
function mensagens(
  specs: Spec[],
  opts: { conversationId?: string; prefixo?: string; primeiroMinuto?: number } = {}
): Row[] {
  const { conversationId = CONVERSATION, prefixo = "msg", primeiroMinuto = 1 } = opts
  return specs.map((s, i) => {
    const n = String(primeiroMinuto + i).padStart(2, "0")
    return {
      id: `${prefixo}-${n}`,
      conversation_id: conversationId,
      role: s.role,
      content: s.content,
      metadata: s.metadata ?? {},
      created_at: `2026-08-01T10:${n}:00.000Z`,
    }
  })
}

function anthropicCapturando(
  box: {
    historico: string[]
    papeis: string[]
    papeisComAtual: string[]
    totalEntradas: number
    bloco: string
    system: string
    blocos: Array<{ text: string; cacheavel: boolean }>
    capturou: boolean
  },
  resposta: string
): Anthropic {
  return {
    messages: {
      create: async (args: {
        messages: Array<{ role: string; content: unknown }>
        system?: Array<{ type: string; text?: string; cache_control?: unknown }> | string
      }) => {
        // SÓ a primeira chamada é a da resposta; a segunda é o `updateLeadMemory`.
        if (!box.capturou) {
          box.capturou = true
          box.totalEntradas = args.messages.length
          box.papeisComAtual = args.messages.map((m) => m.role)
          box.historico = args.messages
            .slice(0, -1)
            .map((m) => (typeof m.content === "string" ? m.content : ""))
          box.papeis = args.messages.slice(0, -1).map((m) => m.role)
          const last = args.messages[args.messages.length - 1]!
          const blocks = last.content as Array<{ type: string; text?: string }>
          box.bloco = Array.isArray(blocks)
            ? blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("")
            : String(last.content)
          box.system = Array.isArray(args.system)
            ? args.system.map((b) => b.text ?? "").join("")
            : String(args.system ?? "")
          box.blocos = Array.isArray(args.system)
            ? args.system.map((b) => ({ text: b.text ?? "", cacheavel: b.cache_control != null }))
            : [{ text: String(args.system ?? ""), cacheavel: false }]
        }
        return {
          content: [{ type: "text", text: resposta }],
          usage: {
            input_tokens: 1,
            output_tokens: 1,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        }
      },
    },
  } as unknown as Anthropic
}

function seed(input: {
  msgs: Row[]
  collectedData?: Row
  properties?: Row[]
  propertyInterestId?: string | null
  leadName?: string | null
  users?: Row[]
}) {
  return {
    conversations: [{ id: CONVERSATION, lead_id: LEAD, org_id: ORG }],
    conversation_state: [
      {
        conversation_id: CONVERSATION,
        collected_data: input.collectedData ?? {},
        qualification_step: "floor",
        current_property_id: null,
        visit_proposed: false,
      },
    ],
    leads: [
      {
        id: LEAD,
        name: input.leadName ?? null,
        phone: "5544999999999",
        stage_id: STAGE_IDS.novo,
        assigned_broker_id: "broker-1",
        lost_reason: null,
        ai_summary: null,
        source: "whatsapp_organic",
        qualification_status: "in_progress",
        property_interest_id: input.propertyInterestId ?? null,
        interest_level_manual: null,
      },
    ],
    messages: input.msgs,
    users: input.users ?? [],
    appointments: [],
    activities: [],
    properties: input.properties ?? [],
  }
}

async function turno(input: {
  msgs: Row[]
  mensagemDoLead: string
  respostaDaNicole?: string
  collectedData?: Row
  properties?: Row[]
  propertyInterestId?: string | null
  leadName?: string | null
  users?: Row[]
}): Promise<Turno> {
  const box = {
    historico: [] as string[],
    papeis: [] as string[],
    papeisComAtual: [] as string[],
    totalEntradas: 0,
    bloco: "",
    system: "",
    blocos: [] as Array<{ text: string; cacheavel: boolean }>,
    capturou: false,
  }
  const eventos: Turno["eventos"] = []
  const fake = createFakeSupabase(seed(input))
  const resultado = await processMessageWithMetadata({
    supabase: fake as unknown as SupabaseClient,
    anthropic: anthropicCapturando(box, input.respostaDaNicole ?? "Certo!"),
    conversationId: CONVERSATION,
    message: input.mensagemDoLead,
    orgId: ORG,
    onEvent: (e) =>
      eventos.push({ event_type: e.event_type, metadata: e.metadata as Record<string, unknown> }),
  })
  const gravadas = fake.table("messages").filter((m) => m.role === "assistant")
  return {
    fake,
    historico: box.historico,
    papeis: box.papeis,
    papeisComAtual: box.papeisComAtual,
    totalEntradas: box.totalEntradas,
    bloco: box.bloco,
    system: box.system,
    blocos: box.blocos,
    eventos,
    estado: (fake.table("conversation_state")[0]?.collected_data as Record<string, unknown>) ?? {},
    lead: fake.table("leads")[0],
    handoffSummary: resultado.handoff?.summary,
    respostaGravada: String(gravadas[gravadas.length - 1]?.content ?? ""),
  }
}

function fixarRelogio(iso: string) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(iso))
}

afterEach(() => {
  vi.useRealTimers()
})

// ────────────────────────────────────────────────────────────────────────────
// AC1 — a fala do corretor chega à Nicole, rotulada
// ────────────────────────────────────────────────────────────────────────────

describe("AC1 — a fala do corretor chega à Nicole, rotulada", () => {
  /**
   * A conversa da AC, literal: `user → assistant → broker` no banco, mais a
   * mensagem atual do lead. O array entregue à API tem **4** entradas.
   *
   * 🔴 Vermelho contra o `HEAD`: 3 entradas, e a do corretor não existe —
   * `.in("role", ["user","assistant"])` a apagava antes de qualquer consumidor.
   */
  const CONVERSA: Spec[] = [
    { role: "user", content: "oi, vi o anúncio" },
    { role: "assistant", content: FALA_NEUTRA },
    { role: "broker", content: FALA_DO_ODAIR, metadata: { signed_as: "Odair" } },
  ]

  it("o array da API tem 4 entradas e a TERCEIRA é a do corretor, rotulada", async () => {
    fixarRelogio(NOW)
    const t = await turno({
      msgs: mensagens(CONVERSA),
      mensagemDoLead: "vou pensar",
      collectedData: { name: "Sandra" },
    })

    expect(t.totalEntradas).toBe(4)
    expect(t.historico[2]).toBe(`[CORRETOR HUMANO — Odair]: ${FALA_DO_ODAIR}`)
  })

  it("controle positivo — lead e Nicole continuam chegando, no papel certo e SEM rótulo", async () => {
    fixarRelogio(NOW)
    const t = await turno({
      msgs: mensagens(CONVERSA),
      mensagemDoLead: "vou pensar",
      collectedData: { name: "Sandra" },
    })

    // Conteúdo EXATO e POSIÇÃO exata — não "contém três papéis".
    expect(t.historico[0]).toBe("oi, vi o anúncio")
    expect(t.historico[1]).toBe(FALA_NEUTRA)
    expect(t.papeisComAtual).toEqual(["user", "assistant", "assistant", "user"])
  })

  it("🔴 controle negativo — o rótulo NÃO é aplicado ao papel errado", async () => {
    fixarRelogio(NOW)
    const t = await turno({
      msgs: mensagens(CONVERSA),
      mensagemDoLead: "vou pensar",
      collectedData: { name: "Sandra" },
    })

    // Se alguém rotular por "não é user" (em vez de "é broker"), a fala da
    // Nicole ganha o rótulo e ESTA asserção cai. É o vermelho que distingue
    // "rotulou o corretor" de "rotulou tudo que não é lead".
    expect(t.historico[0]).not.toContain(ROTULO_CORRETOR_PREFIXO)
    expect(t.historico[1]).not.toContain(ROTULO_CORRETOR_PREFIXO)
    // E exatamente UMA entrada rotulada — nem zero, nem duas.
    expect(t.historico.filter((c) => c.includes(ROTULO_CORRETOR_PREFIXO))).toHaveLength(1)
  })

  it("a fronteira mantém o corretor do NOSSO lado (assistant), nunca como o lead", () => {
    // Mapear `broker → user` faria a Nicole acreditar que O LEAD disse "entrada
    // de 35 mil" — estritamente pior que ela achar que foi ela.
    const saida = toAnthropicHistory([
      { role: "user", content: "quanto custa?" },
      { role: "broker", content: FALA_DO_ODAIR, brokerName: "Odair" },
    ])
    expect(saida[1]!.role).toBe("assistant")
    expect(saida[1]!.content).toBe(`[CORRETOR HUMANO — Odair]: ${FALA_DO_ODAIR}`)
    expect(saida[0]).toEqual({ role: "user", content: "quanto custa?" })
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 🔴 ISOLAMENTO ENTRE CONVERSAS — a exigência nº 1, e ela não tinha rede
// ────────────────────────────────────────────────────────────────────────────

/**
 * Achado A1 do gate da 87-5, e a exigência que o Gabriel colocou em primeiro
 * lugar, textualmente: *"o que não pode acontecer jamais é ela pegar informações
 * de outra conversa, de outro lead, e utilizar em conversas de terceiros."*
 *
 * MEDIDO antes de escrever este bloco: remover
 * `.eq("conversation_id", conversationId)` do carregador derrubava **ZERO**
 * testes na suíte inteira (187 arquivos · 2.401 passed), e o mesmo valia para as
 * outras duas ocorrências do predicado (o `count` e o sinal de fala fora da
 * janela). Não por defeito de código — o predicado sempre esteve lá — mas porque
 * **nenhuma fixture tinha uma segunda conversa**: o `fake-supabase` aplica o
 * `.eq()` de verdade, e um predicado que nunca discrimina é um predicado que
 * nunca é medido. É o mutante colinear da 87-13/87-14, na vizinhança errada.
 *
 * A story acabou de transformar `loadConversationHistory` no carregador ÚNICO de
 * dois consumidores em pacotes diferentes. A partir do merge, este predicado é a
 * única coisa entre um erro ali e o histórico de OUTRA conversa chegando ao
 * prompt da Nicole e ao extrator que escreve em `leads`.
 *
 * **Um vermelho dedicado por ocorrência**, e não um teste que cobre as três de
 * enfeite — as três consultas respondem perguntas diferentes:
 *   (i)   a JANELA          → `conversation-history.ts:282`
 *   (iii) o COUNT           → `:308`  (`total_na_conversa`)
 *   (iv)  o SINAL fora dela → `:317`  (`nossoLadoFalouForaDaJanela`)
 *
 * **O QUE FAZ ESTES TESTES MORDEREM É A ASSERÇÃO, NÃO A FIXTURE.** A régua é a
 * **igualdade da lista inteira** (`toEqual` com os três conteúdos, em ordem) e o
 * **valor exato** das contagens (`totalEntradas === 4`, `totalNaConversa === 22`,
 * `nossoLadoFalouForaDaJanela === false`). Em (i) e (ii) são 6 mensagens no banco
 * contra `limit(20)` — **nada é expulso em arranjo nenhum**, e 6 ≠ 3 sempre. Em
 * (iii) e (iv) a conversa TRUNCA (25 mensagens), mas as asserções também são de
 * valor exato, e mordem igual com a alheia recente ou antiga.
 *
 * Medido (aplicar · rodar · ler · reverter · `md5`), removendo UM predicado por
 * vez com as alheias em **10:40+** e depois em **09:01+**:
 *   · janela (`:282`): **3 vermelhos** com as alheias recentes, **2** com as
 *     antigas — o delta é só o "controle positivo", vermelho COLATERAL;
 *   · count  (`:308`): **1 vermelho** nos dois arranjos;
 *   · sinal  (`:317`): **1 vermelho** nos dois arranjos.
 * Ou seja: a recência acrescenta UM vermelho; não é o mecanismo. (A v1.1 do
 * Change Log afirmava que a fixture antiga "passaria verde nos dois mundos" —
 * era falso, e o gate mediu.)
 *
 * A fixture recente FICA — um vermelho a mais é cinto e suspensório. O que **não
 * se pode enfraquecer é a asserção**: trocar o `toEqual` por um
 * `not.toContain("90 mil")` cria verde falso exatamente nas conversas que
 * TRUNCAM, onde as 20 vagas se enchem com falas da própria conversa e a alheia
 * some da janela por acidente de volume — verde sem predicado nenhum.
 */
describe("🔴 isolamento — o carregador nunca traz fala de OUTRA conversa", () => {
  const OUTRA = "conv-2"

  /** A conversa pedida: lead → Nicole → Odair. */
  const DESTA: Spec[] = [
    { role: "user", content: "oi, vi o anúncio" },
    { role: "assistant", content: FALA_NEUTRA },
    { role: "broker", content: FALA_DO_ODAIR, metadata: { signed_as: "Odair" } },
  ]

  /**
   * A conversa ALHEIA, de outro lead. Fala de corretor com OUTRO nome e OUTRO
   * valor — se qualquer coisa daqui vazar, a asserção diz exatamente o quê.
   */
  const ALHEIA: Spec[] = [
    { role: "user", content: "aqui é a Fernanda, outro lead" },
    { role: "broker", content: "Fechei a entrada de 90 mil com você", metadata: { signed_as: "Valeria" } },
    { role: "assistant", content: "Perfeito, Fernanda!" },
  ]

  const alheias = (n = 3, minuto = 40) =>
    mensagens(ALHEIA.slice(0, n), { conversationId: OUTRA, prefixo: "out", primeiroMinuto: minuto })

  it("(i) a JANELA devolve só as mensagens da conversa pedida", async () => {
    const fake = createFakeSupabase({
      messages: [...mensagens(DESTA), ...alheias()],
      users: [],
    })
    const h = await loadConversationHistory(fake as unknown as SupabaseClient, CONVERSATION)

    // Conteúdo EXATO e em ordem — não "não contém a alheia", que ficaria verde
    // com a janela vazia. A lista inteira é a régua.
    expect(h.messages.map((m) => m.content)).toEqual([
      "oi, vi o anúncio",
      FALA_NEUTRA,
      FALA_DO_ODAIR,
    ])
    // E o nome do corretor resolvido é o DESTA conversa, não o da outra.
    expect(h.messages[2]!.brokerName).toBe("Odair")
  })

  it("(ii) de ponta a ponta: nada da outra conversa chega ao prompt da Nicole", async () => {
    fixarRelogio(NOW)
    const t = await turno({
      msgs: [...mensagens(DESTA), ...alheias()],
      mensagemDoLead: "qual era mesmo o valor da entrada?",
      collectedData: { name: "Sandra" },
    })

    // 3 do histórico + a mensagem atual. Sem o predicado seriam 6 + 1.
    expect(t.totalEntradas).toBe(4)
    expect(t.historico[2]).toBe(`[CORRETOR HUMANO — Odair]: ${FALA_DO_ODAIR}`)
    // Os três vazamentos nomeados: o valor alheio, o corretor alheio e o lead alheio.
    const tudo = t.historico.join("\n")
    expect(tudo).not.toContain("90 mil")
    expect(tudo).not.toContain("Valeria")
    expect(tudo).not.toContain("Fernanda")
  })

  it("(iii) o `total_na_conversa` conta ESTA conversa, não o banco inteiro", async () => {
    // 22 desta (trunca em 20 → o `count` roda) + 3 da outra.
    const desta = mensagens(
      Array.from({ length: 22 }, (_, i) => ({ role: "user" as const, content: `m${i + 1}` }))
    )
    const fake = createFakeSupabase({ messages: [...desta, ...alheias()], users: [] })
    const h = await loadConversationHistory(fake as unknown as SupabaseClient, CONVERSATION)

    expect(h.truncou).toBe(true)
    // 🔴 Sem o predicado no `count`, publica 25 — e o `NICOLE_HISTORY_TRUNCATED`
    // da rotina da 87-3 passa a medir a soma de conversas alheias.
    expect(h.totalNaConversa).toBe(22)
  })

  it("(iv) o sinal 'o nosso lado já falou' NÃO liga por fala de outra conversa", async () => {
    // Cauda desta conversa toda do LEAD → a consulta do sinal dispara. A outra
    // conversa tem Nicole E corretor.
    const desta = mensagens(
      Array.from({ length: 22 }, (_, i) => ({ role: "user" as const, content: `m${i + 1}` }))
    )
    const fake = createFakeSupabase({ messages: [...desta, ...alheias()], users: [] })
    const h = await loadConversationHistory(fake as unknown as SupabaseClient, CONVERSATION)

    // 🔴 Sem o predicado, `nossoLadoFalouForaDaJanela` vira `true` e a Nicole
    // deixa de se apresentar a um lead com quem NINGUÉM daqui falou — a instrução
    // da AC4 aplicada com base na conversa de um terceiro.
    expect(h.nossoLadoFalouForaDaJanela).toBe(false)
  })

  it("controle positivo — o sinal continua ligando pela PRÓPRIA conversa", async () => {
    // Sem este controle, (iv) ficaria verde mesmo se o sinal tivesse parado de
    // funcionar para todo mundo.
    const desta = [
      ...mensagens([{ role: "assistant", content: FALA_NEUTRA }]),
      ...mensagens(
        Array.from({ length: 22 }, (_, i) => ({ role: "user" as const, content: `m${i + 1}` })),
        { prefixo: "msg", primeiroMinuto: 2 }
      ),
    ]
    const fake = createFakeSupabase({ messages: [...desta, ...alheias()], users: [] })
    const h = await loadConversationHistory(fake as unknown as SupabaseClient, CONVERSATION)

    expect(h.nossoLadoFalouForaDaJanela).toBe(true)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// AC1-b — o NOME do corretor: a ordem medida em produção, e UMA consulta em lote
// ────────────────────────────────────────────────────────────────────────────

describe("AC1-b — o nome do corretor sai da fonte que EXISTE em produção", () => {
  const carregar = (msgs: Row[], users: Row[] = []) =>
    loadConversationHistory(
      createFakeSupabase({ messages: msgs, users }) as unknown as SupabaseClient,
      CONVERSATION
    )

  it("`signed_as` (61 % das 1.288) resolve o nome com ZERO consultas a users", async () => {
    const fake = createFakeSupabase({
      messages: mensagens([{ role: "broker", content: "oi", metadata: { signed_as: "Odair", sent_by: "u-1" } }]),
      users: [{ id: "u-1", name: "Odair Nunes" }],
    })
    const h = await loadConversationHistory(fake as unknown as SupabaseClient, CONVERSATION)
    expect(h.messages[0]!.brokerName).toBe("Odair")
    // `signed_as` já É o primeiro nome: consultar `users` aqui seria custo puro
    // no caminho quente do turno.
    expect(fake.calls.filter((c) => c === "select:users")).toHaveLength(0)
  })

  it("🔴 `sent_by` resolve por users.name — e em UMA consulta em lote, nunca N+1", async () => {
    const fake = createFakeSupabase({
      messages: mensagens([
        { role: "broker", content: "a", metadata: { sent_by: "u-1" } },
        { role: "broker", content: "b", metadata: { sent_by: "u-2" } },
        { role: "broker", content: "c", metadata: { sent_by: "u-1" } },
      ]),
      users: [
        { id: "u-1", name: "Odair Nunes" },
        { id: "u-2", name: "Thielly" },
      ],
    })
    const h = await loadConversationHistory(fake as unknown as SupabaseClient, CONVERSATION)
    expect(h.messages.map((m) => m.brokerName)).toEqual(["Odair", "Thielly", "Odair"])
    // Três mensagens, dois corretores, UMA consulta. Um N+1 aqui é regressão de
    // latência no turno — e passaria despercebido sem esta asserção.
    expect(fake.calls.filter((c) => c === "select:users")).toHaveLength(1)
  })

  it("sem `signed_as` e sem `sent_by` → rótulo sem nome, e a conversa NÃO quebra", async () => {
    const h = await carregar(mensagens([{ role: "broker", content: "oi", metadata: {} }]))
    expect(h.messages[0]!.brokerName).toBeNull()
    expect(prefixarFalaDeCorretor(h.messages[0]!)).toBe("[CORRETOR HUMANO]: oi")
  })

  it("`sent_by` apontando para usuário inexistente → fail-open, rótulo sem nome", async () => {
    const h = await carregar(mensagens([{ role: "broker", content: "oi", metadata: { sent_by: "u-sumiu" } }]))
    expect(h.messages[0]!.brokerName).toBeNull()
    expect(prefixarFalaDeCorretor(h.messages[0]!)).toBe("[CORRETOR HUMANO]: oi")
  })

  it("`broker_id` (0 das 1.288 reais) NÃO é a fonte primária — mas serve às transições", async () => {
    // A v0.1 da story mandava ler `broker_id`: o nome sairia vazio nas 1.288 e o
    // rótulo cairia em `[CORRETOR HUMANO]` em 100 % dos casos, em silêncio.
    const h = await carregar(
      mensagens([
        { role: "assistant", content: "Já vou te encaminhar…", metadata: { is_transition: true, broker_id: "u-1" } },
      ]),
      [{ id: "u-1", name: "Marcos Silva" }]
    )
    expect(h.messages[0]!.brokerName).toBe("Marcos")
  })

  it("helpers puros: primeiro nome e formato FECHADO do rótulo", () => {
    expect(primeiroNome("Valeria Souza")).toBe("Valeria")
    expect(primeiroNome("  Odair   Nunes ")).toBe("Odair")
    expect(primeiroNome(null)).toBe("")
    expect(rotuloDeCorretor("Odair Nunes")).toBe("[CORRETOR HUMANO — Odair]")
    expect(rotuloDeCorretor(null)).toBe("[CORRETOR HUMANO]")
  })
})

// ────────────────────────────────────────────────────────────────────────────
// AC2 — a transição humana deixa de ser lida como fala da Nicole
// ────────────────────────────────────────────────────────────────────────────

describe("AC2 — a transição humana é normalizada para broker NA LEITURA", () => {
  /**
   * 🔴 Vermelho contra o `HEAD`: ela voltava como `"assistant"` — e, pior, o
   * `metadata` nem era selecionado (`select("role, content")`), então não havia
   * como distinguir. São 127 mensagens em 60 dias que a Nicole lia como DELA.
   */
  it("role='assistant' + metadata.is_transition → role 'broker' na saída do carregador", async () => {
    const fake = createFakeSupabase({
      messages: mensagens([
        { role: "user", content: "oi" },
        { role: "assistant", content: FALA_NEUTRA },
        { role: "assistant", content: "Já vou te encaminhar…", metadata: { is_transition: true, broker_id: "u-1" } },
      ]),
      users: [{ id: "u-1", name: "Marcos Silva" }],
    })
    const h = await loadConversationHistory(fake as unknown as SupabaseClient, CONVERSATION)
    expect(h.messages.map((m) => m.role)).toEqual(["user", "assistant", "broker"])
  })

  it("controle negativo — assistant SEM is_transition continua assistant", async () => {
    const fake = createFakeSupabase({
      messages: mensagens([
        { role: "assistant", content: FALA_NEUTRA },
        { role: "assistant", content: "outra", metadata: { is_transition: false } },
        { role: "assistant", content: "mais uma", metadata: { sent_via: "whatsapp" } },
      ]),
    })
    const h = await loadConversationHistory(fake as unknown as SupabaseClient, CONVERSATION)
    // Se a normalização for por "tem metadata" em vez de "is_transition === true",
    // esta asserção cai.
    expect(h.messages.map((m) => m.role)).toEqual(["assistant", "assistant", "assistant"])
  })

  it("de ponta a ponta: a transição chega à API ROTULADA, não como fala dela", async () => {
    fixarRelogio(NOW)
    const t = await turno({
      msgs: mensagens([
        { role: "user", content: "oi" },
        { role: "assistant", content: "Já vou te encaminhar…", metadata: { is_transition: true, broker_id: "u-1" } },
      ]),
      mensagemDoLead: "ok",
      users: [{ id: "u-1", name: "Marcos Silva" }],
      collectedData: { name: "Sandra" },
    })
    expect(t.historico[1]).toBe("[CORRETOR HUMANO — Marcos]: Já vou te encaminhar…")
  })
})

// ────────────────────────────────────────────────────────────────────────────
// AC3 — 🔴 o gate de agendamento NÃO liga por fala humana
// ────────────────────────────────────────────────────────────────────────────

describe("AC3 — lastAssistantMsg fica RESTRITO à Nicole", () => {
  const ligou = (bloco: string) => bloco.startsWith("[SISTEMA:")

  /**
   * (i) A última fala do NOSSO lado é do corretor e trata de visita; a última da
   *     Nicole é neutra. O modo agendamento tem de continuar DESLIGADO.
   *
   *     🔴 O vermelho: mapeando `broker → "assistant"` no tipo interno (ou
   *     removendo a normalização da transição), `lastAssistantMsg` passa a ser a
   *     fala do corretor e o bloco [SISTEMA] aparece. Esta é a AC que faz a
   *     story caber na Onda 1: a direção é RESTRITIVA.
   */
  it("(i) pergunta de visita feita pelo CORRETOR não arma o modo agendamento", async () => {
    fixarRelogio(NOW)
    const t = await turno({
      msgs: mensagens([
        { role: "user", content: "oi" },
        { role: "assistant", content: FALA_NEUTRA },
        { role: "broker", content: "Que tal sábado às 10h pra gente visitar?", metadata: { signed_as: "Odair" } },
      ]),
      mensagemDoLead: "Pode ser sábado?",
      collectedData: { name: "Sandra" },
    })
    expect(ligou(t.bloco)).toBe(false)
  })

  it("(i-b) controle positivo — a MESMA pergunta feita pela Nicole continua armando", async () => {
    fixarRelogio(NOW)
    const t = await turno({
      msgs: mensagens([
        { role: "user", content: "oi" },
        { role: "assistant", content: FALA_NEUTRA },
        { role: "assistant", content: FALA_DE_VISITA },
      ]),
      mensagemDoLead: "Pode ser sábado?",
      collectedData: { name: "Sandra" },
    })
    // Sem este controle, o teste (i) ficaria verde mesmo se o modo agendamento
    // tivesse parado de ligar para TODO MUNDO.
    expect(ligou(t.bloco)).toBe(true)
    expect(t.bloco).toContain("sábado, 15 de agosto")
  })

  it("(i-c) a transição normalizada TAMBÉM não arma — corrige defeito que já existia", async () => {
    fixarRelogio(NOW)
    const t = await turno({
      msgs: mensagens([
        { role: "user", content: "oi" },
        { role: "assistant", content: FALA_NEUTRA },
        {
          role: "assistant",
          content: FALA_DE_VISITA,
          metadata: { is_transition: true, broker_id: "u-1" },
        },
      ]),
      mensagemDoLead: "Pode ser sábado?",
      users: [{ id: "u-1", name: "Marcos Silva" }],
      collectedData: { name: "Sandra" },
    })
    // No `HEAD` esta fixture LIGA o gate: a mensagem é `role='assistant'` no
    // banco, escrita por humano, e nada distinguia.
    expect(ligou(t.bloco)).toBe(false)
  })

  /**
   * (ii) O mesmo eixo, no `nameExpected` (75-161): pergunta de nome feita pelo
   *      CORRETOR não pode fazer a extração aceitar "maicon" como nome.
   */
  it("(ii) pergunta de nome feita pelo CORRETOR não faz 'maicon' virar nome", async () => {
    fixarRelogio(NOW)
    const t = await turno({
      msgs: mensagens([
        { role: "user", content: "oi" },
        { role: "assistant", content: FALA_NEUTRA },
        { role: "broker", content: PERGUNTA_DE_NOME, metadata: { signed_as: "Odair" } },
      ]),
      mensagemDoLead: "maicon",
    })
    expect(t.estado.name).toBeUndefined()
  })

  it("(ii-b) controle positivo — a mesma pergunta feita pela Nicole continua aceitando", async () => {
    fixarRelogio(NOW)
    const t = await turno({
      msgs: mensagens([
        { role: "user", content: "oi" },
        { role: "assistant", content: PERGUNTA_DE_NOME },
      ]),
      mensagemDoLead: "maicon",
    })
    expect(t.estado.name).toBe("Maicon")
  })
})

// ────────────────────────────────────────────────────────────────────────────
// AC4 — `buildNoReintroContext` conta "o NOSSO lado já falou"
// ────────────────────────────────────────────────────────────────────────────

const MARCA_NAO_REINTRO = "Voce JA se apresentou a este lead anteriormente"

describe("AC4 — a Nicole não se reapresenta a quem já falou com o corretor", () => {
  it("(i) histórico SÓ de corretor + lead → a instrução aparece", async () => {
    fixarRelogio(NOW)
    const t = await turno({
      msgs: mensagens([
        { role: "user", content: "oi, tenho interesse" },
        { role: "broker", content: "Claro! Te mando a planta.", metadata: { signed_as: "Odair" } },
        { role: "user", content: "obrigado" },
      ]),
      mensagemDoLead: "e o valor?",
    })
    // 🔴 No `HEAD` a fala do corretor nem entra no histórico: sem fala de
    // `assistant`, a Nicole se REAPRESENTA a um lead que já trocou mensagens
    // com o corretor.
    expect(t.system).toContain(MARCA_NAO_REINTRO)
  })

  it("(ii) não-regressão: com fala da Nicole, a string sai byte a byte igual", async () => {
    fixarRelogio(NOW)
    const t = await turno({
      msgs: mensagens([
        { role: "user", content: "oi" },
        { role: "assistant", content: FALA_NEUTRA },
      ]),
      mensagemDoLead: "e o valor?",
    })
    expect(t.system).toContain(
      "\nIMPORTANTE: Voce JA se apresentou a este lead anteriormente. NAO diga 'Sou a Nicole' ou qualquer variacao de apresentacao. Continue a conversa naturalmente, sem introducao.\n"
    )
  })

  it("(iii) controle negativo — conversa só do LEAD continua sem a instrução", async () => {
    fixarRelogio(NOW)
    const t = await turno({
      msgs: mensagens([{ role: "user", content: "oi" }]),
      mensagemDoLead: "tem apartamento?",
    })
    // Se o `some()` passar a aceitar qualquer papel, esta asserção cai.
    expect(t.system).not.toContain(MARCA_NAO_REINTRO)
  })

  it("(iv) corretor FORA da janela (cauda-20 toda do lead) → instrução aparece", async () => {
    fixarRelogio(NOW)
    const msgs = mensagens([
      { role: "user", content: "m1 oi" },
      { role: "broker", content: "m2 boa tarde, sou o Odair", metadata: { signed_as: "Odair" } },
      ...Array.from({ length: 28 }, (_, i) => ({
        role: "user" as const,
        content: `m${i + 3} tudo bem`,
      })),
    ])
    const t = await turno({ msgs, mensagemDoLead: "oi de novo" })
    expect(t.historico).toHaveLength(20)
    // A 87-8 só consultava `role='assistant'` fora da janela. Com o corretor no
    // jogo, o sinal passa a ser "o NOSSO lado" — direção restritiva, nunca
    // permissiva: ele só pode SUPRIMIR uma reapresentação.
    expect(t.system).toContain(MARCA_NAO_REINTRO)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Instrumentação — a janela e o total passam a falar da MESMA população
// ────────────────────────────────────────────────────────────────────────────

describe("NICOLE_HISTORY_TRUNCATED conta os três papéis", () => {
  it("a conversa trunca por causa do corretor, e o total reporta os três", async () => {
    fixarRelogio(NOW)
    // 12 do lead + 12 do corretor = 24. Só com os dois papéis a janela nem
    // truncaria (12 < 20): é o efeito real da story sobre o orçamento de 20.
    const msgs = mensagens(
      Array.from({ length: 24 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "broker") as "user" | "broker",
        content: `m${i + 1}`,
        metadata: i % 2 === 0 ? {} : { signed_as: "Odair" },
      }))
    )
    const t = await turno({ msgs, mensagemDoLead: "oi" })
    const ev = t.eventos.find((e) => e.event_type === "NICOLE_HISTORY_TRUNCATED")
    expect(ev).toBeDefined()
    // Se o `count` continuasse contando dois papéis, ele publicaria 12 — menor
    // que o próprio `limite` de 20, o que é incoerente por construção.
    expect(ev!.metadata).toMatchObject({ limite: 20, total_na_conversa: 24 })
    expect(t.historico).toHaveLength(20)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// AC5 — 🔴 a Nicole nunca repete valor dito pelo corretor [RN4]
// ────────────────────────────────────────────────────────────────────────────

describe("AC5 — a instrução da RN4 para a fala do corretor", () => {
  const comCorretor = () =>
    mensagens([
      { role: "user", content: "qual era mesmo o valor da entrada?" },
      { role: "broker", content: FALA_DO_ODAIR, metadata: { signed_as: "Odair" } },
    ])

  it("(i) a fixture do Odair: a instrução entra no prompt, com a proibição literal", async () => {
    fixarRelogio(NOW)
    const t = await turno({
      msgs: comCorretor(),
      mensagemDoLead: "qual era mesmo o valor da entrada?",
      collectedData: { name: "Sandra" },
    })
    expect(t.system).toContain(CONTEXTO_FALA_DE_CORRETOR)
    expect(t.system).toContain("NUNCA repita, confirme nem reformule valor, preco, desconto, entrada ou condicao de pagamento")
    // E o valor está mesmo na janela — senão a instrução seria decorativa e o
    // teste passaria por não haver nada a proteger.
    expect(t.historico.join("\n")).toContain("35 mil")
  })

  it("(ii) a instrução é POR-CONVERSA: some quando não há corretor na janela", async () => {
    fixarRelogio(NOW)
    const t = await turno({
      msgs: mensagens([
        { role: "user", content: "qual era mesmo o valor da entrada?" },
        { role: "assistant", content: FALA_NEUTRA },
      ]),
      mensagemDoLead: "qual era mesmo o valor da entrada?",
      collectedData: { name: "Sandra" },
    })
    // Se a instrução virasse bloco estático cacheável, ela apareceria aqui — e
    // as 144 conversas com Nicole pagariam por uma guarda que não lhes diz
    // respeito.
    expect(t.system).not.toContain(CONTEXTO_FALA_DE_CORRETOR)
  })

  it("(ii-b) 🔴 e ela mora no bloco NÃO-CACHEÁVEL, não entre os estáticos", async () => {
    fixarRelogio(NOW)
    const t = await turno({
      msgs: comCorretor(),
      mensagemDoLead: "qual era mesmo o valor da entrada?",
      collectedData: { name: "Sandra" },
    })
    // 🔴 Medido: sem esta asserção, mover a instrução para um bloco estático
    // NÃO derrubava teste nenhum — a string concatenada é a mesma nos dois
    // mundos. A AC5-(ii) é sobre a ESTRUTURA, e só o array a enxerga.
    const cacheaveis = t.blocos.filter((b) => b.cacheavel)
    expect(cacheaveis.length).toBeGreaterThan(0) // o prompt estático existe mesmo
    expect(cacheaveis.some((b) => b.text.includes("[CORRETOR HUMANO]"))).toBe(false)
    const dinamicos = t.blocos.filter((b) => !b.cacheavel)
    expect(dinamicos.some((b) => b.text.includes(CONTEXTO_FALA_DE_CORRETOR))).toBe(true)
  })

  it("(iii) o rótulo NUNCA sai na resposta ao lead — higienização, não confiança", async () => {
    fixarRelogio(NOW)
    // O modelo REPRODUZINDO a marcação é o gatilho de rollback da story. A
    // instrução do prompt é a primeira defesa; esta é a que não depende de o
    // modelo obedecer.
    const t = await turno({
      msgs: comCorretor(),
      mensagemDoLead: "qual era mesmo o valor da entrada?",
      respostaDaNicole: "[CORRETOR HUMANO — Odair]: a entrada é 35 mil. Posso ajudar em mais algo?",
      collectedData: { name: "Sandra" },
    })
    expect(t.respostaGravada).not.toContain(ROTULO_CORRETOR_PREFIXO)
    expect(t.respostaGravada).toContain("Posso ajudar em mais algo?")
    expect(t.eventos.map((e) => e.event_type)).toContain("NICOLE_SYSTEM_BLOCK_LEAK")
  })

  it("(iii-b) a higienização não morde texto legítimo", () => {
    const limpo = "A entrada é combinada com o corretor responsável, tá bom?"
    expect(stripSystemBlocks(limpo)).toEqual({ text: limpo, stripped: false })
  })
})

// ────────────────────────────────────────────────────────────────────────────
// AC8 — o resumo de handoff é NÃO-REGRESSÃO
// ────────────────────────────────────────────────────────────────────────────

/** Casa `OUT_OF_SCOPE_PATTERNS` — dispara o handoff de forma determinística. */
const PEDE_CORRETOR = "quero falar com um corretor"

describe("AC8 — generateHandoffSummary: só o TOTAL muda", () => {
  it("(i) a fala do corretor NÃO entra em MENSAGENS DO LEAD", async () => {
    fixarRelogio(NOW)
    const t = await turno({
      msgs: mensagens([
        { role: "user", content: "boa tarde" },
        { role: "broker", content: FALA_DO_ODAIR, metadata: { signed_as: "Odair" } },
      ]),
      mensagemDoLead: PEDE_CORRETOR,
      collectedData: { name: "Sandra" },
    })
    const secao = t.handoffSummary!.split("MENSAGENS DO LEAD:")[1]!.split("TOTAL DE MENSAGENS")[0]!
    expect(secao).toContain('"boa tarde"')
    expect(secao).toContain(`"${PEDE_CORRETOR}"`)
    expect(secao).not.toContain("35 mil")
    expect(secao).not.toContain(ROTULO_CORRETOR_PREFIXO)
  })

  it("(ii) TOTAL DE MENSAGENS passa a contar a fala do corretor — a única diferença aceita", async () => {
    fixarRelogio(NOW)
    const semCorretor = await turno({
      msgs: mensagens([{ role: "user", content: "boa tarde" }]),
      mensagemDoLead: PEDE_CORRETOR,
      collectedData: { name: "Sandra" },
    })
    const comCorretor = await turno({
      msgs: mensagens([
        { role: "user", content: "boa tarde" },
        { role: "broker", content: FALA_DO_ODAIR, metadata: { signed_as: "Odair" } },
      ]),
      mensagemDoLead: PEDE_CORRETOR,
      collectedData: { name: "Sandra" },
    })
    // 1 do histórico + msg do lead + resposta da Nicole = 3 (é o do `HEAD`).
    expect(semCorretor.handoffSummary).toContain("TOTAL DE MENSAGENS: 3")
    // Com o corretor: 4. A diferença é exatamente 1, e está declarada.
    expect(comCorretor.handoffSummary).toContain("TOTAL DE MENSAGENS: 4")
  })
})

// ────────────────────────────────────────────────────────────────────────────
// AC9 — nenhum caminho de decisão novo
// ────────────────────────────────────────────────────────────────────────────

const PROPRIEDADES: Row[] = [
  {
    id: "prop-vind",
    org_id: ORG,
    is_active: true,
    nicole_enabled: true,
    name: "Vind Residence",
    slug: "vind-residence",
    status: "lancamento",
    typologies: [],
    units: [],
  },
  {
    id: "prop-origem",
    org_id: ORG,
    is_active: true,
    nicole_enabled: true,
    name: "Origem Home Club",
    slug: "origem-home-club",
    status: "lancamento",
    typologies: [],
    units: [],
  },
]

describe("AC9 — a fala do corretor NÃO preenche property_interest_id", () => {
  it("(i) só o CORRETOR cita o empreendimento → property_interest_id continua null", async () => {
    fixarRelogio(NOW)
    const t = await turno({
      msgs: mensagens([
        { role: "user", content: "oi, tenho interesse" },
        {
          role: "broker",
          content: "Te mando a planta do Origem Home Club",
          metadata: { signed_as: "Odair" },
        },
      ]),
      mensagemDoLead: "pode me mandar mais informações?",
      properties: PROPRIEDADES,
      propertyInterestId: null,
    })
    // Deixar a fala dele preencher faria o sistema PASSAR A ACREDITAR em algo
    // que hoje não acredita — caminho de decisão novo, proibido na Onda 1.
    expect(t.lead?.property_interest_id ?? null).toBeNull()
  })

  it("(ii) controle positivo — a mesma citação vinda do LEAD continua preenchendo", async () => {
    fixarRelogio(NOW)
    const t = await turno({
      msgs: mensagens([
        { role: "user", content: "oi, quero saber do Origem Home Club" },
        { role: "broker", content: "Claro!", metadata: { signed_as: "Odair" } },
      ]),
      mensagemDoLead: "pode me mandar mais informações?",
      properties: PROPRIEDADES,
      propertyInterestId: null,
    })
    // Sem este controle, (i) ficaria verde mesmo se a identificação por contexto
    // tivesse parado de funcionar para todo mundo.
    expect(t.lead?.property_interest_id).toBe("prop-origem")
  })
})

// ────────────────────────────────────────────────────────────────────────────
// AC10 — turno-ouro: nada muda quando não há corretor na conversa
// ────────────────────────────────────────────────────────────────────────────

describe("AC10 — conversa SEM corretor não sente a story", () => {
  /**
   * A maioria dos turnos da Nicole não tem corretor nenhum (144 conversas com
   * Nicole × 305 com corretor, 94 com os dois). Essa maioria não pode sentir a
   * story.
   *
   * O `system` inteiro (blocos estáticos + `dynamicSuffix`) é comparado por
   * SHA-256 contra a saída capturada no `HEAD` (`24800872`) com o mesmo seed,
   * o mesmo `now` e o mesmo harness — worktree próprio, não relato. O
   * procedimento de recaptura está no Dev Agent Record da story.
   *
   * Guardar o hash, e não a string, é deliberado: a string tem ~10 KB de prompt
   * estático e um literal desse tamanho aqui esconderia a asserção em vez de
   * mostrá-la. O `length` vai junto porque um hash sozinho não diz NADA quando
   * falha — com os dois, a primeira pergunta ("cresceu ou mudou?") já é
   * respondida pelo próprio erro.
   */
  /**
   * ⚠️ Dois cenários, e o segundo existe porque o primeiro sozinho seria uma
   * régua que não distingue nada: medi os TRÊS turnos-ouro da 87-8 no `HEAD` e
   * os três dão o MESMO hash (o `dynamicSuffix` deles é idêntico — mesmo lead,
   * mesmo relógio, mesmo bloco de não-reintro). Um hash igual em três fixturas
   * diferentes não prova que ele acompanha o `dynamicSuffix`.
   *
   * O cenário (b) — conversa SÓ do lead, sem bloco de não-reintro — move o hash
   * (30.082 vs 30.256 bytes). Com os dois, a asserção mede a diferença, não a
   * constante.
   */
  const OURO: Array<{
    nome: string
    msgs: Spec[]
    mensagem: string
    bloco: string
    papeis: string[]
    sha256: string
    length: number
  }> = [
    {
      nome: "(a) 4 mensagens, com fala da Nicole → bloco de não-reintro presente",
      msgs: [
        { role: "user", content: "oi, vi o anúncio" },
        { role: "assistant", content: "Oi! Sou a Nicole, da Trifold. Como posso ajudar?" },
        { role: "user", content: "queria saber do apartamento" },
        { role: "assistant", content: FALA_NEUTRA },
      ],
      mensagem: "qual o preço?",
      bloco: "qual o preço?",
      papeis: ["user", "assistant", "user", "assistant", "user"],
      sha256: "3ec9480d84f943732ccc4f2ce4e760a2db110c16de7114e207dd5e7405eb0aa3",
      length: 30256,
    },
    {
      nome: "(b) primeira mensagem, só o lead → SEM bloco de não-reintro",
      msgs: [{ role: "user", content: "oi, vi o anúncio" }],
      mensagem: "tem apartamento de 3 quartos?",
      bloco: "tem apartamento de 3 quartos?",
      papeis: ["user", "user"],
      sha256: "d634f39ecc852edb9c55c1ad8069c5a946cc82138853d159110b813153183371",
      length: 30082,
    },
  ]

  for (const ouro of OURO) {
    it(`turno-ouro ${ouro.nome}`, async () => {
      fixarRelogio(NOW)
      const t = await turno({
        msgs: mensagens(ouro.msgs),
        mensagemDoLead: ouro.mensagem,
        collectedData: { name: "Ana" },
      })

      const { createHash } = await import("node:crypto")
      const sha = createHash("sha256").update(t.system).digest("hex")

      // O `length` vai junto do hash de propósito: um hash sozinho não diz nada
      // quando falha. Com os dois, "cresceu ou mudou?" já sai do próprio erro.
      expect({ sha256: sha, length: t.system.length }).toEqual({
        sha256: ouro.sha256,
        length: ouro.length,
      })
      expect(t.papeisComAtual).toEqual(ouro.papeis)
      expect(t.bloco).toBe(ouro.bloco)
      expect(t.system).not.toContain(ROTULO_CORRETOR_PREFIXO)
    })
  }
})
