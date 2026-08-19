/**
 * Story 87-4 / AC8-b — a SEGUNDA esteira desligada, provada no cron.
 *
 * O `processMessage` não passa por aqui: este cron chama o Haiku direto e faz
 * merge no `collected_data` por fora do pipeline. Dos 56 estados residuais
 * medidos em produção em 07/08, **39 (70 %) têm este cron como ÚLTIMO
 * ESCRITOR** (`conversation_state.updated_at` a menos de 1 s de
 * `conversations.last_enriched_at`). Sem desligá-lo, a AC8 seria inexequível:
 * o contador de legado descartado oscilaria em vez de decair.
 *
 * O desligamento tem duas vias e as duas são testadas aqui:
 *   (a) a chave saiu do `ENRICHMENT_PROMPT` (`haiku-enrichment.ts`);
 *   (b) o merge FILTRA a chave — defesa em profundidade contra um modelo que a
 *       devolva por hábito de contexto mesmo sem ela no prompt.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const logEventMock = vi.fn()
vi.mock("@web/lib/logger", () => ({
  logEvent: (...a: unknown[]) => logEventMock(...a),
}))

/** Payload de cada `.update()` executado, por tabela. */
let updates: Array<{ table: string; payload: Record<string, unknown> }> = []

const CONV = "conv-1"
const LEAD = "lead-1"

/** `collected_data` que já está gravado — com o resíduo do formato antigo. */
let collectedDataAtual: Record<string, unknown> = {}
/** O que o Haiku devolve — inclui `visit_availability` de propósito. */
let extractedData: Record<string, unknown> = {}
/** Story 87-7 — o `summary` que o Haiku devolve, e os `appointments` do lead. */
let summaryDoHaiku = "resumo"
let appointmentsDoLead: Array<Record<string, unknown>> = []
/** Story 87-7 — o prompt montado, para a asserção de AC5. */
let promptDoHaiku = ""

/**
 * Story 87-8 (deploy B) — mensagens semeadas para exercitar a JANELA do cron.
 *
 * `null` = comportamento histórico deste arquivo (as duas mensagens fixas de
 * baixo), para não mexer em nenhum teste que já existia. Quando semeado, o
 * builder passa a aplicar `.order()` e `.limit()` DE VERDADE — um mock que os
 * ignora não consegue distinguir cabeça de cauda e daria verde nos dois mundos,
 * que é exatamente o defeito que este deploy existe para matar.
 */
let mensagensSemeadas: Array<Record<string, unknown>> | null = null

function makeBuilder(table: string) {
  const orders: Array<{ col: string; asc: boolean }> = []
  let limitN: number | null = null
  /**
   * Story 87-5 — o `.in()` era `() => builder`: NÃO FILTRAVA NADA.
   *
   * Medido: com a mutação "o carregador volta a `["user","assistant"]`", os
   * testes do deploy B continuavam **todos verdes** — a mensagem `role='broker'`
   * semeada atravessava o mock porque o filtro de papel simplesmente não era
   * aplicado. O teste provava a existência da fixture, não a do filtro.
   *
   * Com o `.in()` de verdade, essa mesma mutação passa a derrubar os testes que
   * ela deve derrubar. Mesma lição do `fake-supabase` da 75-279: um fake que
   * aceita o filtro e devolve tudo dá confiança falsa.
   */
  const inFilters: Array<{ col: string; vals: unknown[] }> = []
  /**
   * Story 87-5 / achado A1 do gate — o `.eq()` era `() => builder`, exatamente
   * como o `.in()` uma linha acima, e pela mesma razão: **NÃO FILTRAVA NADA**.
   *
   * Medido antes de escrever isto: remover `.eq("conversation_id", …)` do
   * `loadConversationHistory` derrubava ZERO testes na suíte inteira. Aqui o
   * predicado nem chegava a ser avaliado; no `packages/ai` ele era avaliado mas
   * nenhuma fixture tinha uma segunda conversa. Dois consumidores, dois motivos,
   * o mesmo buraco — e o isolamento entre conversas é a exigência nº 1 desta
   * família de stories.
   */
  const eqFilters: Array<{ col: string; val: unknown }> = []
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      eqFilters.push({ col, val })
      return builder
    },
    in: (col: string, vals: unknown[]) => {
      inFilters.push({ col, vals })
      return builder
    },
    gte: () => builder,
    lte: () => builder,
    or: () => builder,
    order: (col: string, opts?: { ascending?: boolean }) => {
      orders.push({ col, asc: opts?.ascending ?? true })
      return builder
    },
    limit: (n: number) => {
      limitN = n
      return builder
    },
    update: (payload: Record<string, unknown>) => {
      updates.push({ table, payload })
      return builder
    },
    single: () => {
      if (table === "conversation_state") return Promise.resolve({ data: { collected_data: collectedDataAtual }, error: null })
      if (table === "leads") return Promise.resolve({ data: { name: "Ana", interest_level_manual: false }, error: null })
      return Promise.resolve({ data: null, error: null })
    },
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (v: { data: unknown; error: unknown }) => void) => {
      if (table === "conversations") {
        return resolve({
          data: [{ id: CONV, lead_id: LEAD, org_id: "org-1", last_message_at: "2026-08-08T10:00:00Z", last_enriched_at: null }],
          error: null,
        })
      }
      if (table === "appointments") {
        return resolve({ data: appointmentsDoLead, error: null })
      }
      if (table === "messages") {
        if (mensagensSemeadas) {
          let out = mensagensSemeadas.filter(
            (r) =>
              inFilters.every(({ col, vals }) => vals.includes(r[col])) &&
              eqFilters.every(({ col, val }) => r[col] === val)
          )
          if (orders.length > 0) {
            out.sort((a, b) => {
              for (const { col, asc } of orders) {
                const av = String(a[col] ?? "")
                const bv = String(b[col] ?? "")
                const c = asc ? av.localeCompare(bv) : bv.localeCompare(av)
                if (c !== 0) return c
              }
              return 0
            })
          }
          if (limitN !== null) out = out.slice(0, limitN)
          return resolve({ data: out, error: null })
        }
        return resolve({
          data: [
            { role: "user", content: "Quero visitar sábado às 10h" },
            { role: "assistant", content: "Qual o melhor dia pra você, durante a semana ou sábado de manhã?" },
          ],
          error: null,
        })
      }
      return resolve({ data: [], error: null })
    },
  }
  return builder
}

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (t: string) => makeBuilder(t) }),
}))

// Só as chamadas de rede são dubladas — `omitAgendaKeys`, `omitLegacyAgendaKeys`
// e o resto do pacote continuam sendo os DE VERDADE. Se o filtro fosse mockado,
// o teste não provaria nada.
/**
 * Story 87-8 (deploy B) — o PROMPT literal montado por
 * `enrichLeadFromConversation`, com a conversa dentro. É o "texto entregue ao
 * Haiku" da AC8, sem duplicar a renderização no teste: o dublê chama a função
 * DE VERDADE e só substitui a chamada de rede.
 */
let promptEntregueAoHaiku = ""

vi.mock("@trifold/ai", async (importOriginal) => {
  const real = (await importOriginal()) as Record<string, unknown>
  type Enrich = (
    a: unknown,
    i: {
      messages: Array<{ role: string; content: string }>
      currentCollectedData: unknown
      /** Story 87-7 — o bloco `FATO DE AGENDA` vindo de `appointments`. */
      fatoDeAgenda?: string | null
    }
  ) => Promise<unknown>
  const realEnrich = real.enrichLeadFromConversation as Enrich
  return {
    ...real,
    createAnthropicClient: () => ({}),
    // ── Resolução de conflito 87-7 × 87-8 (SEMÂNTICA, não textual) ───────────
    // As duas stories mexeram neste mesmo dublê e o conflito só nascia depois do
    // primeiro merge (cada branch estava limpa contra `main`).
    //
    // Base = a versão da **87-8**, que é estritamente mais rica: ela chama o
    // `enrichLeadFromConversation` DE VERDADE e dubla só a rede. Um dublê que
    // devolvesse o resultado pronto não provaria que a janela certa chegou ao
    // modelo — que é a única coisa que o deploy B muda.
    //
    // Por cima dela, as duas coisas que a **87-7** precisava:
    //   (a) capturar `input.fatoDeAgenda` em `promptDoHaiku` — as asserções dela
    //       são sobre esse valor, e capturá-lo cru as mantém intactas;
    //   (b) o `summary` devolvido sai de `summaryDoHaiku` (era `"resumo"` fixo no
    //       lado da 87-8) — sem isso os testes do guarda da 87-7 não conseguiriam
    //       injetar o resumo que afirma visita, e a AC1 dela ficaria sem fixture.
    enrichLeadFromConversation: async (_anthropic: unknown, input: Parameters<Enrich>[1]) => {
      promptDoHaiku = input.fatoDeAgenda ?? "" // (a) — 87-7
      const anthropicFake = {
        messages: {
          create: async (args: { messages: Array<{ content: string }> }) => {
            promptEntregueAoHaiku = args.messages[0]!.content // 87-8
            return {
              content: [
                {
                  type: "text",
                  // (b) — 87-7
                  text: JSON.stringify({ summary: summaryDoHaiku, extracted_data: extractedData }),
                },
              ],
            }
          },
        },
      }
      return realEnrich(anthropicFake, input)
    },
  }
})

async function rodar() {
  vi.stubEnv("CRON_SECRET", "segredo")
  vi.resetModules()
  const { GET } = await import("./route")
  const req = { headers: { get: () => "Bearer segredo" } } as unknown as import("next/server").NextRequest
  return GET(req)
}

function leadPatch(): Record<string, unknown> {
  const u = updates.find((x) => x.table === "leads")
  expect(u, "o cron precisa ter atualizado o lead").toBeTruthy()
  return u!.payload
}

function estadoPersistido(): Record<string, unknown> {
  const u = updates.find((x) => x.table === "conversation_state")
  expect(u, "o cron precisa ter persistido o collected_data").toBeTruthy()
  return u!.payload.collected_data as Record<string, unknown>
}

beforeEach(() => {
  logEventMock.mockClear()
  updates = []
  collectedDataAtual = {}
  extractedData = {}
  // Resolução 87-7 × 87-8 — os resets são UNIÃO. Cada story emendou este mesmo
  // bloco; deixar só um lado faria o estado vazar entre testes da outra.
  mensagensSemeadas = null // 87-8
  promptEntregueAoHaiku = "" // 87-8
  summaryDoHaiku = "resumo" // 87-7
  appointmentsDoLead = [] // 87-7
  promptDoHaiku = "" // 87-7
})

// ────────────────────────────────────────────────────────────────────────────
// Story 87-8 — AC8: deploy B. A SEGUNDA esteira lê a cauda.
// ────────────────────────────────────────────────────────────────────────────

describe("Story 87-8 / AC8 — o cron enrich-leads lê a CAUDA, não a cabeça", () => {
  /** 25 mensagens `m1`…`m25`, `created_at` ISO crescente, `id` zero-padded. */
  function vinteECinco(): Array<Record<string, unknown>> {
    return Array.from({ length: 25 }, (_, i) => ({
      id: `msg-${String(i + 1).padStart(2, "0")}`,
      // Story 87-5 — agora que o mock aplica `.eq()` de verdade, a fixture
      // precisa dizer a que conversa pertence. Sem isto ela seria filtrada para
      // fora e o teste morreria por motivo errado.
      conversation_id: CONV,
      role: i % 2 === 0 ? "user" : "assistant",
      content: `m${i + 1}`,
      created_at: `2026-08-01T10:${String(i + 1).padStart(2, "0")}:00.000Z`,
    }))
  }

  it("🔴 (i)(ii) com 25 mensagens, o texto entregue ao Haiku contém m6…m25", async () => {
    mensagensSemeadas = vinteECinco()
    await rodar()

    // A conversa dentro do prompt, na ordem em que o modelo a lê.
    const conversa = promptEntregueAoHaiku.split("Conversa:\n")[1]!
    const linhas = conversa.trim().split("\n")
    expect(linhas).toHaveLength(20)
    // As PONTAS são o que discrimina — um teste que só conta 20 linhas passa
    // verde nos dois mundos (a cabeça também tem 20).
    // m6 é índice 5 (ímpar) → `assistant` → rotulado "Nicole" pelo renderizador.
    expect(linhas[0]).toBe("Nicole: m6")
    expect(linhas[linhas.length - 1]).toBe("Lead: m25")
    expect(conversa).not.toContain(": m1\n")
    expect(conversa).not.toContain(": m5\n")
  })

  it("conversa curta (15) segue inteira e em ordem — nada muda para ela", async () => {
    mensagensSemeadas = vinteECinco().slice(0, 15)
    await rodar()
    const linhas = promptEntregueAoHaiku.split("Conversa:\n")[1]!.trim().split("\n")
    expect(linhas).toHaveLength(15)
    expect(linhas[0]).toBe("Lead: m1")
    expect(linhas[14]).toBe("Lead: m15")
  })

  it("🔴 a janela sai de created_at, NÃO de id — com id descorrelacionado (como o UUID de produção)", async () => {
    // Ver a justificativa longa em `pipeline-historico-cauda.test.ts`: com `id`
    // zero-padded, ordenar por `id` acerta por acidente e a asserção da janela
    // fica verde sem nunca exercitar o `created_at`. Em produção `id` é UUID.
    mensagensSemeadas = vinteECinco().map((m, i) => ({
      ...m,
      id: `msg-${String(25 - i).padStart(2, "0")}`,
    }))
    await rodar()
    const linhas = promptEntregueAoHaiku.split("Conversa:\n")[1]!.trim().split("\n")
    expect(linhas).toHaveLength(20)
    expect(linhas[0]).toBe("Nicole: m6")
    expect(linhas[linhas.length - 1]).toBe("Lead: m25")
  })

  it("empate de created_at: o desempate por id preserva a ORDEM do grupo empatado", async () => {
    const msgs = vinteECinco().slice(0, 22)
    msgs[9]!.created_at = "2026-08-01T10:10:00.000Z"
    msgs[10]!.created_at = "2026-08-01T10:10:00.000Z"
    msgs[11]!.created_at = "2026-08-01T10:10:00.000Z"
    mensagensSemeadas = msgs

    await rodar()
    const primeira = promptEntregueAoHaiku
    await rodar()
    expect(promptEntregueAoHaiku).toBe(primeira)

    // 🔴 A asserção que DISCRIMINA (achado do gate). Repetir a rodada e comparar
    // não prova nada — a leitura é determinística nos dois mundos. Sem o
    // `.order("id")`, a consulta descendente + `.reverse()` devolve o grupo
    // empatado INVERTIDO (…m9, m12, m11, m10, m13…).
    // Os papéis vêm da definição da fixture (paridade do índice), não da ordem
    // sob teste — senão a expectativa seria circular.
    const esperado = Array.from({ length: 20 }, (_, i) => {
      const k = i + 3
      return `${(k - 1) % 2 === 0 ? "Lead" : "Nicole"}: m${k}`
    })
    expect(primeira.split("Conversa:\n")[1]!.trim().split("\n")).toEqual(esperado)
  })
})

describe("AC8-b — o cron enrich-leads para de escrever fato de agenda", () => {
  it("🔴 (i) o Haiku devolve `visit_availability` e ela NÃO chega ao collected_data", async () => {
    // Simula o modelo devolvendo a chave por hábito de contexto, mesmo com ela
    // fora do prompt. Removendo o `omitAgendaKeys` do merge, este teste fica
    // vermelho — é o que prova que a defesa em profundidade existe e não é
    // comentário.
    extractedData = { visit_availability: "sábado às 10h", bedrooms: 2 }
    await rodar()
    expect(estadoPersistido()).not.toHaveProperty("visit_availability")
  })

  it("(ii) os demais campos NÃO regridem — o escopo é a chave de agenda e só ela", async () => {
    extractedData = {
      visit_availability: "sábado às 10h",
      bedrooms: 3,
      profissao: "professora",
      renda_familiar: "4700_8000",
      filhos: "2",
    }
    await rodar()
    const cd = estadoPersistido()
    expect(cd.bedrooms).toBe(3)
    expect(cd.profissao).toBe("professora")
    expect(cd.renda_familiar).toBe("4700_8000")
    expect(cd.filhos).toBe("2")
    expect(cd).not.toHaveProperty("visit_availability")
  })

  it("🔴 (iii) o resíduo JÁ GRAVADO também não é reescrito de volta", async () => {
    // É o que torna a consulta da AC8-b-(iii) verificável: sem isto, o cron
    // persiste `{...currentData, ...extraido}` e devolve a chave à linha a cada
    // passada — e "a chave sumiu porque o cron parou de escrever" nunca poderia
    // ser distinguido de "a chave sumiu porque a conversa morreu".
    collectedDataAtual = {
      name: "Edicleia",
      visit_availability: "sexta-feira às 15h",
      visit_pending_date: "2026-08-14",
      visit_pending_hour: 15,
      visit_pending_minute: 0,
    }
    extractedData = { bedrooms: 2 }
    await rodar()
    const cd = estadoPersistido()
    expect(cd).not.toHaveProperty("visit_availability")
    expect(cd).not.toHaveProperty("visit_pending_date")
    expect(cd).not.toHaveProperty("visit_pending_hour")
    expect(cd).not.toHaveProperty("visit_pending_minute")
    expect(cd.name).toBe("Edicleia") // o resto do estado é preservado
  })

  it("o `agenda_state` VIVO do turno é preservado — o cron não pode destruí-lo a cada 30 min", async () => {
    const vivo = {
      citacao: "pode ser sábado",
      origem: "lead",
      data_absoluta: "2026-08-15",
      hora: null,
      minuto: null,
      periodo: null,
      ancorado_em: "2026-08-08T10:00:00.000Z",
      expira_em: "2026-08-10T10:00:00.000Z",
    }
    collectedDataAtual = { name: "Ana", agenda_state: vivo }
    extractedData = { bedrooms: 2 }
    await rodar()
    expect(estadoPersistido().agenda_state).toEqual(vivo)
  })

  it("e o Haiku não consegue FABRICAR um agenda_state — ele não tem citação para oferecer", async () => {
    extractedData = { agenda_state: { citacao: "inventado", origem: "lead" }, bedrooms: 2 }
    await rodar()
    expect(estadoPersistido()).not.toHaveProperty("agenda_state")
  })
})

describe("B2 — um dono só para os 20 pontos de agenda", () => {
  // Achado do gate do @qa. O score gravado em `leads` e o `collected_data`
  // persistido eram calculados a partir de objetos DIFERENTES: bastava o Haiku
  // devolver `visit_availability` para o cron conceder 20 pontos por um fato que
  // não ia para lugar nenhum — e o `processMessage` recalcular sem eles no turno
  // seguinte. Dois escritores discordando, com o cron sobrescrevendo a cada 30 min.
  //
  // A regra agora é uma só, dos dois lados: `hasAgendaFact(collected_data que
  // será persistido)`. Os testes abaixo fixam as três combinações.
  // Story 75-347 — a régua mudou dos DOIS lados (é a MESMA função): `finalidade`
  // entrou valendo 10 e `visit_availability` caiu de 20 para 10. O perfil completo
  // passa a incluir a finalidade, senão "completo" não é completo.
  const PERFIL_COMPLETO = {
    name: "Ana", finalidade: "moradia", property_interest: "vind", bedrooms: 2, floor: "alto",
    view: "frente", garages: 1, has_down_payment: true, source: "meta_ads",
  } // 10+10+15+10+10+10+5+15+5 = 90, sem os 10 de agenda

  it("🔴 o Haiku alucinar `visit_availability` NÃO vale os pontos de agenda", async () => {
    // O fato não vai para o estado persistido — logo não pode valer score.
    collectedDataAtual = { ...PERFIL_COMPLETO }
    extractedData = { visit_availability: "sábado às 10h" }
    await rodar()
    expect(estadoPersistido()).not.toHaveProperty("visit_availability")
    expect(leadPatch().qualification_score).toBe(90)
  })

  it("um `agenda_state` LEGÍTIMO vale os 10 — e o cron concorda com o pipeline", async () => {
    collectedDataAtual = {
      ...PERFIL_COMPLETO,
      agenda_state: {
        citacao: "pode ser sábado", origem: "lead", fonte: "pendencia",
        data_absoluta: "2026-08-15", hora: null, minuto: null, periodo: null,
        ancorado_em: "2026-08-08T10:00:00.000Z", expira_em: "2026-08-10T10:00:00.000Z",
      },
    }
    extractedData = {}
    await rodar()
    expect(leadPatch().qualification_score).toBe(100)
    expect(leadPatch().qualification_status).toBe("qualified")
  })

  it("🔴 o score sai do estado PERSISTIDO: resíduo legado apagado não pontua mais", async () => {
    // É a consequência assumida da story — os 20 pontos vinham de um fato que,
    // em 10 de 13 registros inspecionados, era a fala da própria Nicole. O ponto
    // do B2 não é preservá-los: é que os dois escritores respondam a MESMA coisa.
    collectedDataAtual = { ...PERFIL_COMPLETO, visit_availability: "sábado às 10h" }
    extractedData = {}
    await rodar()
    expect(estadoPersistido()).not.toHaveProperty("visit_availability")
    expect(leadPatch().qualification_score).toBe(90)
  })

  it("o score do cron == o score calculado sobre o estado que ele persistiu", async () => {
    // A invariante, escrita como teste: não importa o que o Haiku devolva, o
    // score gravado é sempre `calculateQualificationScore(collected_data gravado)`.
    const { calculateQualificationScore } = await import("@trifold/ai")
    for (const extra of [
      {},
      { visit_availability: "sábado às 10h" },
      { bedrooms: 3 },
      { agenda_state: { citacao: "x", origem: "lead" } },
    ]) {
      updates = []
      collectedDataAtual = { ...PERFIL_COMPLETO }
      extractedData = extra
      await rodar()
      expect(leadPatch().qualification_score).toBe(
        calculateQualificationScore(estadoPersistido())
      )
    }
  })
})

describe("AC8 — o recibo do descarte também sai por AQUI (achado do re-gate)", () => {
  // O `processMessage` retorna FORA DO EXPEDIENTE antes de descartar o legado,
  // mas avança o `last_message_at`. O cron pega a conversa, apaga o legado,
  // regrava score/status/Calor — e o evento nunca sairia. A queda de 20 pontos
  // ficaria sem auditoria justamente no caminho em que ela é invisível.
  const RESIDUO = {
    name: "Edicleia",
    visit_availability: "sexta-feira às 15h",
    visit_pending_date: "2026-08-14",
  }

  function recibo() {
    const c = logEventMock.mock.calls.find(
      (c) => (c[0] as { event_type: string }).event_type === "NICOLE_AGENDA_STATE_LEGADO_DESCARTADO"
    )
    return c?.[0] as { metadata: Record<string, unknown>; category: string } | undefined
  }

  it("🔴 apagar o legado pelo cron EMITE o evento, com as chaves nomeadas", async () => {
    collectedDataAtual = { ...RESIDUO }
    extractedData = {}
    await rodar()
    const ev = recibo()
    expect(ev, "o cron apagou o legado e não emitiu recibo").toBeTruthy()
    expect(ev!.metadata.chaves).toEqual(["visit_availability", "visit_pending_date"])
    expect(ev!.metadata.origem_do_descarte).toBe("cron_enrich_leads")
    expect(ev!.metadata.conversation_id).toBe(CONV)
    expect(ev!.metadata.lead_id).toBe(LEAD)
  })

  it("🔴 e carrega a QUEDA DE SCORE, que é o que o comercial precisa explicar", async () => {
    collectedDataAtual = { ...RESIDUO } // name(10) + agenda(10) = 20 → 10 (75-347)
    extractedData = {}
    await rodar()
    const ev = recibo()!
    expect(ev.metadata.score_antes).toBe(20)
    expect(ev.metadata.score_depois).toBe(10)
    // E o score que foi gravado no lead é o de DEPOIS — o recibo não mente.
    expect(leadPatch().qualification_score).toBe(10)
  })

  it("é o MESMO `event_type` do pipeline — a contagem da AC8 é uma só", async () => {
    collectedDataAtual = { ...RESIDUO }
    extractedData = {}
    await rodar()
    expect(recibo()).toBeTruthy() // event_type conferido dentro do helper
  })

  it("conversa sem resíduo não emite recibo nenhum", async () => {
    collectedDataAtual = { name: "Ana" }
    extractedData = { bedrooms: 2 }
    await rodar()
    expect(recibo()).toBeUndefined()
  })

  it("o `agenda_state` vivo não gera recibo — ele não foi descartado", async () => {
    collectedDataAtual = {
      name: "Ana",
      agenda_state: {
        citacao: "pode ser sábado", origem: "lead", fonte: "pendencia",
        data_absoluta: "2026-08-15", hora: null, minuto: null, periodo: null,
        ancorado_em: "2026-08-08T10:00:00.000Z", expira_em: "2026-08-10T10:00:00.000Z",
      },
    }
    extractedData = {}
    await rodar()
    expect(recibo()).toBeUndefined()
    expect(estadoPersistido()).toHaveProperty("agenda_state")
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Story 87-5 — AC7 / deploy B: a SEGUNDA esteira adota o MESMO carregador
// ────────────────────────────────────────────────────────────────────────────

describe("Story 87-5 / deploy B — o cron enxerga o corretor, rotulado", () => {
  /** Lead → Nicole → corretor. As três faixas, com o corretor no fim. */
  function conversaComCorretor(): Array<Record<string, unknown>> {
    return [
      { id: "msg-01", conversation_id: CONV, role: "user", content: "oi, tenho interesse", metadata: {}, created_at: "2026-08-01T10:01:00.000Z" },
      { id: "msg-02", conversation_id: CONV, role: "assistant", content: "Oi! Posso te ajudar.", metadata: {}, created_at: "2026-08-01T10:02:00.000Z" },
      { id: "msg-03", conversation_id: CONV, role: "broker", content: "Consegui a entrada de 35 mil parcelada em 10x", metadata: { signed_as: "Odair" }, created_at: "2026-08-01T10:03:00.000Z" },
    ]
  }

  it("🔴 a fala do corretor entra no texto do Haiku, e como CORRETOR — não como Nicole", async () => {
    mensagensSemeadas = conversaComCorretor()
    await rodar()
    const linhas = promptEntregueAoHaiku.split("Conversa:\n")[1]!.trim().split("\n")

    // 🔴 Contra o `HEAD`: são 2 linhas e a do corretor não existe.
    expect(linhas).toHaveLength(3)
    expect(linhas[2]).toBe("[CORRETOR HUMANO — Odair]: Consegui a entrada de 35 mil parcelada em 10x")
    // Controle negativo: se o renderizador cair no `else` (o "Nicole:" de antes),
    // o extrator atribui ao robô um valor que só o humano podia dizer.
    expect(promptEntregueAoHaiku).not.toContain("Nicole: Consegui a entrada")
  })

  it("controle positivo — lead e Nicole continuam com os rótulos de sempre", async () => {
    mensagensSemeadas = conversaComCorretor()
    await rodar()
    const linhas = promptEntregueAoHaiku.split("Conversa:\n")[1]!.trim().split("\n")
    expect(linhas[0]).toBe("Lead: oi, tenho interesse")
    expect(linhas[1]).toBe("Nicole: Oi! Posso te ajudar.")
  })

  it("a transição humana é normalizada aqui TAMBÉM — um carregador, uma regra", async () => {
    mensagensSemeadas = [
      { id: "msg-01", conversation_id: CONV, role: "user", content: "oi", metadata: {}, created_at: "2026-08-01T10:01:00.000Z" },
      { id: "msg-02", conversation_id: CONV, role: "assistant", content: "Já vou te encaminhar…", metadata: { is_transition: true, broker_id: "u-1" }, created_at: "2026-08-01T10:02:00.000Z" },
    ]
    await rodar()
    const linhas = promptEntregueAoHaiku.split("Conversa:\n")[1]!.trim().split("\n")
    // `users` não é semeado neste mock → fail-open: rótulo sem nome, e a
    // conversa NÃO quebra. É o comportamento declarado do carregador.
    expect(linhas[1]).toBe("[CORRETOR HUMANO]: Já vou te encaminhar…")
  })

  /**
   * 🔴 Achado A1 do gate — o isolamento entre conversas, no SEGUNDO consumidor.
   *
   * O gêmeo deste teste está em `packages/ai/src/chat/
   * pipeline-corretor-no-historico.test.ts` ("isolamento — o carregador nunca
   * traz fala de OUTRA conversa"). São dois porque o carregador é UM só e os
   * consumidores são DOIS, em pacotes diferentes: lá o vazamento chegaria ao
   * prompt da Nicole; **aqui ele vira CRENÇA** — o extrator escreve
   * `collected_data`, `ai_summary` e os campos de perfil em `leads`.
   *
   * A outra conversa é de OUTRO lead e suas mensagens são mais RECENTES
   * (10:40+ contra 10:01+): a consulta é `created_at` descendente com `limit`,
   * então sem o predicado elas dominam a cauda em vez de só se somarem a ela.
   */
  it("🔴 a fala de OUTRA conversa não entra no texto entregue ao Haiku", async () => {
    mensagensSemeadas = [
      ...conversaComCorretor(),
      { id: "out-40", conversation_id: "conv-2", role: "user", content: "aqui é a Fernanda, outro lead", metadata: {}, created_at: "2026-08-01T10:40:00.000Z" },
      { id: "out-41", conversation_id: "conv-2", role: "broker", content: "Fechei a entrada de 90 mil com você", metadata: { signed_as: "Valeria" }, created_at: "2026-08-01T10:41:00.000Z" },
      { id: "out-42", conversation_id: "conv-2", role: "assistant", content: "Perfeito, Fernanda!", metadata: {}, created_at: "2026-08-01T10:42:00.000Z" },
    ]
    await rodar()
    const linhas = promptEntregueAoHaiku.split("Conversa:\n")[1]!.trim().split("\n")

    // A lista INTEIRA é a régua — "não contém a alheia" ficaria verde com o
    // prompt vazio.
    expect(linhas).toEqual([
      "Lead: oi, tenho interesse",
      "Nicole: Oi! Posso te ajudar.",
      "[CORRETOR HUMANO — Odair]: Consegui a entrada de 35 mil parcelada em 10x",
    ])
    // Os três vazamentos nomeados. O primeiro é o que vira `has_down_payment`
    // de um lead que nunca falou em entrada nenhuma.
    expect(promptEntregueAoHaiku).not.toContain("90 mil")
    expect(promptEntregueAoHaiku).not.toContain("Valeria")
    expect(promptEntregueAoHaiku).not.toContain("Fernanda")
  })

  it("o ENRICHMENT_PROMPT proíbe extrair campo a partir da fala do corretor", async () => {
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../../../../../../ai/src/flows/haiku-enrichment.ts", import.meta.url), "utf8")
    )
    const prompt = src.slice(src.indexOf("const ENRICHMENT_PROMPT"), src.indexOf("/**\n * Calls Haiku"))
    // Risco 7: o "entrada de 35 mil" do Odair virando `has_down_payment: true`
    // sem o lead ter dito nada. Aqui não é leitura, é CRENÇA — e ela escreve.
    expect(prompt).toContain("NUNCA extraia campo de extracted_data a partir de uma linha [CORRETOR HUMANO]")
    expect(prompt).toContain("has_down_payment NAO e true")
  })
})

describe("AC8-b — a chave saiu do ENRICHMENT_PROMPT", () => {
  it("o prompt do Haiku não pede mais `visit_availability`", async () => {
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../../../../../../ai/src/flows/haiku-enrichment.ts", import.meta.url), "utf8")
    )
    const prompt = src.slice(src.indexOf("const ENRICHMENT_PROMPT"), src.indexOf("/**\n * Calls Haiku"))
    expect(prompt).not.toContain("- visit_availability")
    // E o resto da lista continua lá — a subtração é cirúrgica.
    expect(prompt).toContain("- profissao")
    expect(prompt).toContain("- renda_familiar")
  })
})

/**
 * Story 87-7 / AC2-(ii) — O ESCRITOR B, e ele é a MAIORIA DA POPULAÇÃO.
 *
 * Este cron escreve `ai_summary` INCONDICIONALMENTE a cada 30 min ("AC8: Always
 * update ai_summary"), sobre a conversa inteira — fala da Nicole incluída. 209
 * dos 226 leads com resumo (92,5 %) têm conversa que ele já enriqueceu.
 * Consertar só o `pipeline.ts` deixaria o defeito vivo em quase toda a
 * população: é literalmente o erro que a 87-4 cometeu na v1.
 *
 * A frase da fixture é literal de produção — Lucimara, 04/08, `appointments = 0`.
 */
describe("AC2-(ii) — o resumo sem lastro NÃO entra no leadPatch do cron", () => {
  const CONTAMINADO =
    "Marcou visita ao decorado para o dia 8 (sábado), mas precisa confirmar o horário de trabalho antes de finalizar o agendamento."

  function bloqueio() {
    const c = logEventMock.mock.calls.find(
      (c) => (c[0] as { event_type: string }).event_type === "NICOLE_RESUMO_SEM_LASTRO_BLOQUEADO"
    )
    return c?.[0] as { level: string; metadata: Record<string, unknown> } | undefined
  }

  it("🔴 resumo afirma visita, lead tem ZERO appointments → `ai_summary` AUSENTE do patch", async () => {
    summaryDoHaiku = CONTAMINADO
    appointmentsDoLead = []
    extractedData = { bedrooms: 2 }
    await rodar()
    expect(leadPatch()).not.toHaveProperty("ai_summary")
  })

  it("🔴 e o bloqueio é CIRÚRGICO: perfil e score seguem no patch", async () => {
    // O congelado nunca é pior que hoje; um lead que para de pontuar seria.
    summaryDoHaiku = CONTAMINADO
    appointmentsDoLead = []
    extractedData = { bedrooms: 3, profissao: "professora", name: "Lucimara" }
    await rodar()
    const p = leadPatch()
    expect(p).not.toHaveProperty("ai_summary")
    expect(p.preferred_bedrooms).toBe(3)
    expect(p.profissao).toBe("professora")
    expect(p.name).toBe("Lucimara")
    expect(p.qualification_score).toBeTypeOf("number")
    expect(p.interest_level).toBeTruthy()
  })

  it("o evento sai com `origem: cron_enrich_leads` — é como as duas esteiras se desempatam (AC8)", async () => {
    summaryDoHaiku = CONTAMINADO
    appointmentsDoLead = []
    await rodar()
    const ev = bloqueio()
    expect(ev, "o bloqueio precisa ser contável").toBeTruthy()
    expect(ev!.level).toBe("warn")
    expect(ev!.metadata.origem).toBe("cron_enrich_leads")
    expect(ev!.metadata.veredicto).toBe("sem_lastro")
    expect(ev!.metadata.lead_id).toBe(LEAD)
    expect(ev!.metadata.conversation_id).toBe(CONV)
    expect(String(ev!.metadata.citacao_curta)).toContain("Marcou visita ao decorado")
  })

  it("AC3 — o MESMO resumo, com appointment no dia afirmado, É gravado", async () => {
    // O guarda ancora em `new Date()` (o instante da escrita), então o relógio
    // é fixado: sem isso o teste vira loteria de fuso perto da meia-noite UTC.
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-08T13:00:00Z")) // sábado, 10:00 BRT
    try {
      summaryDoHaiku = CONTAMINADO
      appointmentsDoLead = [
        { id: "appt-1", lead_id: LEAD, scheduled_at: "2026-08-08T13:00:00+00", status: "scheduled" },
      ]
      await rodar()
      expect(leadPatch().ai_summary).toBe(CONTAMINADO)
      expect(bloqueio()).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it("resumo sem uma palavra sobre agenda continua sendo gravado", async () => {
    summaryDoHaiku = "Ana busca 2 suítes no Vind, andar alto. Sem objeções."
    appointmentsDoLead = []
    await rodar()
    expect(leadPatch().ai_summary).toBe(summaryDoHaiku)
    expect(bloqueio()).toBeUndefined()
  })

  it("AC5 — o cron injeta o bloco FATO DE AGENDA vindo de `appointments`", async () => {
    appointmentsDoLead = [
      { id: "appt-1", lead_id: LEAD, scheduled_at: "2020-01-05T13:30:00+00", status: "completed" },
    ]
    await rodar()
    // AC11 — appointment no passado nunca vira fato em tempo presente.
    expect(promptDoHaiku).toContain("FATO DE AGENDA")
    expect(promptDoHaiku).toContain("NÃO HÁ VISITA FUTURA AGENDADA")
  })
})
