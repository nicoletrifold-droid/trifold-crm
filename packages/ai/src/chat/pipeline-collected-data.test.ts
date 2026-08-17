/**
 * Story 87-11 (item `W1-6`) — o `collected_data` sai do prompt como JSON cru.
 *
 * Este arquivo mede o que o `collected-data.test.ts` NÃO alcança: o bloco
 * `CONVERSATION CONTEXT` como ele chega de verdade ao `system` da API, através
 * de `processMessage`. É a diferença entre "a função pura devolve as linhas
 * certas" e "o prompt do turno tem essas linhas e só essas".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ AC7 — NÃO-REGRESSÃO É A METADE QUE FALTA
 *
 * Uma story de subtração pode ficar verde por ter removido demais. Os dois
 * cenários da AC7 (estado SEM `collected_data`; estado com `visit_proposed` +
 * `visit_explicitly_confirmed`) são comparados a strings literais capturadas do
 * `HEAD` — worktree próprio, mesmo seed, mesmo relógio, mesmo harness. Elas têm
 * de sair BYTE A BYTE iguais, porque a única linha que esta story remove é a do
 * JSON cru. O procedimento de recaptura está no Dev Agent Record.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Harness: `createFakeSupabase` da 75-279 — usar, não recriar (Armadilha 3 da
 * story). `id` das mensagens em formato de produção e relógio FIXO: o
 * `agenda_state` tem TTL de 48 h e a fixture do Ronaldo venceria sozinha em
 * 12/08 se o relógio fosse o da máquina que roda a suíte.
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import type Anthropic from "@anthropic-ai/sdk"
import { STAGE_IDS } from "@trifold/shared"
import { processMessageWithMetadata } from "./pipeline"
import { createFakeSupabase, type Row } from "./__fixtures__/fake-supabase"

const ORG = "org-1"
const CONVERSATION = "c3eb7ee1-a1ac-4b33-8b5f-2ff34c051b9e"
const LEAD = "lead-1"

/** O instante do último turno real do Ronaldo. Dentro do TTL do `agenda_state`. */
const NOW = "2026-08-10T00:30:17.946Z"

/** `collected_data` do Ronaldo, íntegro, colado do banco (356 chars). */
const ESTADO_DO_RONALDO = (): Row => ({
  name: "Ronaldo",
  floor: "alto",
  bedrooms: 2,
  profissao: "corretor de imóveis",
  agenda_state: {
    hora: 17,
    fonte: "pendencia",
    minuto: 30,
    origem: "lead",
    citacao: "3ª feira às 17:30",
    periodo: null,
    expira_em: "2026-08-12T00:15:45.465Z",
    ancorado_em: "2026-08-10T00:15:45.465Z",
    data_absoluta: null,
  },
  property_interest: "vind",
})

interface Turno {
  system: string
  /** Só o bloco `CONVERSATION CONTEXT`, do marcador de abertura ao de fecho. */
  contexto: string
  qualificationScore: number
}

function anthropicCapturando(box: { system: string; capturou: boolean }): Anthropic {
  return {
    messages: {
      create: async (args: {
        messages: Array<{ role: string; content: unknown }>
        system?: Array<{ type: string; text?: string }> | string
      }) => {
        // SÓ a primeira chamada é a da resposta; a segunda é o `updateLeadMemory`.
        if (!box.capturou) {
          box.capturou = true
          box.system = Array.isArray(args.system)
            ? args.system.map((b) => b.text ?? "").join("")
            : String(args.system ?? "")
        }
        return {
          content: [{ type: "text", text: "Certo!" }],
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

const ABRE = "=== CONVERSATION CONTEXT ==="
const FECHA = "=== END CONVERSATION CONTEXT ==="

/** Recorta o bloco do `system`. Devolve "" quando o bloco não existe. */
function recortarContexto(system: string): string {
  const i = system.indexOf(ABRE)
  if (i < 0) return ""
  const j = system.indexOf(FECHA, i)
  if (j < 0) return ""
  return system.slice(i, j + FECHA.length)
}

async function turno(input: {
  collectedData: Row
  qualificationStep?: string | null
  visitProposed?: boolean
  mensagemDoLead?: string
}): Promise<Turno> {
  const box = { system: "", capturou: false }
  const fake = createFakeSupabase({
    conversations: [{ id: CONVERSATION, lead_id: LEAD, org_id: ORG }],
    conversation_state: [
      {
        conversation_id: CONVERSATION,
        collected_data: input.collectedData,
        // @po (E7): a linha imprime `state.qualification_step` PERSISTIDO — não o
        // que `getNextQualificationStep` devolveria. A fixture SETA o valor, não
        // o deriva. Para o Ronaldo os dois coincidem em `view` (medido nos dois
        // caminhos), e é justamente por coincidirem que derivar passaria
        // despercebido aqui e mentiria em qualquer outra fixture.
        // `=== undefined`, não `??`: o cenário (c) da AC7 semeia `null` DE
        // PROPÓSITO, e `null ?? "view"` devolveria "view" — a régua mediria o
        // default do helper em vez do código.
        qualification_step: input.qualificationStep === undefined ? "view" : input.qualificationStep,
        current_property_id: null,
        visit_proposed: input.visitProposed ?? false,
      },
    ],
    leads: [
      {
        id: LEAD,
        name: "Ronaldo",
        phone: "5544999999999",
        stage_id: STAGE_IDS.novo,
        assigned_broker_id: "broker-1",
        lost_reason: null,
        ai_summary: null,
        source: "whatsapp_organic",
        qualification_status: "in_progress",
        property_interest_id: null,
        interest_level_manual: null,
      },
    ],
    messages: [
      {
        id: "6f0a6c6c-0001-4000-8000-000000000001",
        conversation_id: CONVERSATION,
        role: "user",
        content: "oi",
        metadata: {},
        created_at: "2026-08-10T00:10:00.000Z",
      },
    ],
    users: [],
    appointments: [],
    activities: [],
    lead_facts: [],
    properties: [],
  })

  const resultado = await processMessageWithMetadata({
    supabase: fake as unknown as SupabaseClient,
    anthropic: anthropicCapturando(box),
    conversationId: CONVERSATION,
    message: input.mensagemDoLead ?? "tudo bem?",
    orgId: ORG,
  })

  return {
    system: box.system,
    contexto: recortarContexto(box.system),
    qualificationScore: resultado.qualificationScore,
  }
}

function fixarRelogio(iso: string) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(iso))
}
afterEach(() => {
  vi.useRealTimers()
})

// ═══════════════════════════════════════════════════════════════════════════
// AC2 — o turno-ouro no `system` de verdade
// ═══════════════════════════════════════════════════════════════════════════

describe("AC2 — o bloco CONVERSATION CONTEXT do Ronaldo, como chega à API", () => {
  /**
   * Snapshot INLINE do bloco INTEIRO, por `toBe`. Três coisas que só aparecem
   * aqui e não no teste do módulo puro:
   *
   *   • `Current qualification step: view` vem do valor PERSISTIDO (@po, E7);
   *   • a linha *"VOCE JA PERGUNTOU…"* existe porque o `conversation_state` do
   *     Ronaldo tem `visit_proposed = true` (medido pelo @po). Isso é o estado
   *     VERDADEIRO, não regressão — e é o que a AC7 preserva byte a byte;
   *   • a ORDEM das linhas dentro do bloco.
   */
  it("🔴 o bloco inteiro, byte a byte", async () => {
    fixarRelogio(NOW)
    const t = await turno({ collectedData: ESTADO_DO_RONALDO(), visitProposed: true })

    expect(t.contexto).toBe(
      [
        "=== CONVERSATION CONTEXT ===",
        "Current qualification step: view",
        "Dados já coletados nesta conversa (podem ter vindo da fala do lead OU de inferência da própria conversa — NÃO são fatos verificados no sistema):",
        "- Nome: Ronaldo",
        "- Empreendimento de interesse: vind",
        "- Quartos: 2",
        "- Andar: alto",
        "- profissao: corretor de imóveis",
        '- O lead mencionou disponibilidade, nas palavras dele: "3ª feira às 17:30". Isso NÃO é visita marcada — só o bloco [SISTEMA] confirma dia e horário.',
        "VOCE JA PERGUNTOU AO CLIENTE SOBRE A VISITA. Aguarde a resposta. NAO pergunte novamente sobre interesse em visitar — voce ja perguntou. Se o cliente der um dia especifico com confirmacao positiva, anote e confirme o agendamento.",
        "=== END CONVERSATION CONTEXT ===",
      ].join("\n")
    )
  })

  it("🔴 (i) o `system` INTEIRO não contém nenhuma das seis strings de maquinário", async () => {
    fixarRelogio(NOW)
    const t = await turno({ collectedData: ESTADO_DO_RONALDO(), visitProposed: true })
    // O `system` INTEIRO, não só o bloco: é o que responde "isso não vazou por
    // outro caminho no mesmo prompt". E uma asserção só, sobre a LISTA — seis
    // `not.toContain` em sequência parariam na primeira e o vermelho da
    // AC2-(iii) mostraria UMA string em vez das seis.
    const MAQUINARIO = [
      "expira_em",
      "ancorado_em",
      '"fonte"',
      '"origem"',
      "data_absoluta",
      "agenda_state",
      "Data collected so far",
    ]
    expect(MAQUINARIO.filter((s) => t.system.includes(s))).toEqual([])
  })

  it("(ii) CONTROLE POSITIVO — a citação e os dados de qualificação continuam no `system`", async () => {
    fixarRelogio(NOW)
    const t = await turno({ collectedData: ESTADO_DO_RONALDO(), visitProposed: true })
    expect(t.system).toContain("3ª feira às 17:30")
    expect(t.system).toContain("Quartos: 2")
    expect(t.system).toContain("Current qualification step: view")
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// AC5-(iv) — o score não muda
// ═══════════════════════════════════════════════════════════════════════════

describe("AC5-(iv) — `processMessage` devolve o MESMO qualificationScore do HEAD", () => {
  /**
   * 65 é o número medido no `HEAD` para a fixture-ouro (`name` 10 +
   * `property_interest` 15 + `bedrooms` 10 + `floor` 10 + `visit_availability`
   * 20, este último via `hasAgendaFact` sobre o `agenda_state`). Ele está colado
   * dos DOIS lados no Dev Agent Record.
   *
   * Sem esta asserção, a AC5-(iii) (pureza) passaria mesmo num renderizador
   * impuro cujo efeito colateral não fosse visível na comparação do objeto.
   */
  it("🔴 fixture-ouro: score 65, igual ao HEAD", async () => {
    fixarRelogio(NOW)
    const t = await turno({ collectedData: ESTADO_DO_RONALDO(), visitProposed: true })
    expect(t.qualificationScore).toBe(65)
  })

  it("CONTROLE POSITIVO — sem o fato de agenda o score cai 20, exatamente o peso dele", async () => {
    fixarRelogio(NOW)
    const semAgenda = ESTADO_DO_RONALDO()
    delete semAgenda.agenda_state
    const t = await turno({ collectedData: semAgenda, visitProposed: true })
    // Uma asserção de score que não distingue nada seria uma régua saturada.
    expect(t.qualificationScore).toBe(45)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// AC7 — não-regressão do resto do bloco, byte a byte contra o HEAD
// ═══════════════════════════════════════════════════════════════════════════

describe("AC7 — a subtração é cirúrgica: o resto do bloco não se move", () => {
  /**
   * As duas strings abaixo foram CAPTURADAS do `HEAD` (`199a7a84`), com o mesmo
   * seed, o mesmo relógio e o mesmo harness — worktree próprio, `pipeline.ts`
   * revertido por `git checkout` e restaurado com `md5` conferido. Procedimento
   * no Dev Agent Record.
   *
   * A régua é `HEAD menos a linha do JSON cru`, e não a string do `HEAD` inteira,
   * porque *"byte a byte igual ao HEAD"* aplicado a uma fixture que TEM
   * `collected_data` seria autocontraditório: a linha do JSON cru é justamente a
   * que esta story remove. Escrita assim, a asserção diz exatamente o que a
   * story promete — **o delta contra o `HEAD` é UMA linha, e é aquela.**
   */
  const HEAD_SEM_COLLECTED = [
    "=== CONVERSATION CONTEXT ===",
    "Current qualification step: view",
    "=== END CONVERSATION CONTEXT ===",
  ].join("\n")

  const HEAD_VISITA_CONFIRMADA = [
    "=== CONVERSATION CONTEXT ===",
    "Current qualification step: view",
    'Data collected so far: {"visit_explicitly_confirmed":"sábado, 15 de agosto às 10h"}',
    "VISITA CONFIRMADA PELO CLIENTE! O lead confirmou dia e horario. NAO pergunte novamente quando ele quer ir. A visita esta marcada. Se ele perguntar algo, responda normalmente.",
    "Data confirmada pelo cliente: sábado, 15 de agosto às 10h",
    "=== END CONVERSATION CONTEXT ===",
  ].join("\n")

  /** O `HEAD` menos, e só menos, a linha que esta story remove. */
  const semJsonCru = (bloco: string) =>
    bloco
      .split("\n")
      .filter((l) => !l.startsWith("Data collected so far:"))
      .join("\n")

  it("🔴 (a) estado SEM `collected_data` — byte a byte igual ao HEAD, sem subtração nenhuma", async () => {
    fixarRelogio(NOW)
    const t = await turno({ collectedData: {} })
    // Aqui o `HEAD` já não imprimia a linha, então a igualdade é TOTAL — e este
    // teste passa VERDE contra o `HEAD` de propósito. É o cenário que prova que
    // a story não mexeu no bloco, só na linha.
    expect(t.contexto).toBe(HEAD_SEM_COLLECTED)
    expect(semJsonCru(HEAD_SEM_COLLECTED)).toBe(HEAD_SEM_COLLECTED)
  })

  it("🔴 (b) `visit_proposed` + `visit_explicitly_confirmed` — HEAD menos exatamente a linha do JSON cru", async () => {
    fixarRelogio(NOW)
    const t = await turno({
      // `visit_explicitly_confirmed` NÃO é renderizada pelo módulo (ela já tem
      // duas linhas dedicadas no pipeline logo abaixo), então o bloco sai sem
      // nenhuma linha de "Dados já coletados" — e as duas linhas dedicadas
      // continuam byte a byte como estavam.
      collectedData: { visit_explicitly_confirmed: "sábado, 15 de agosto às 10h" },
      visitProposed: true,
    })
    expect(t.contexto).toBe(semJsonCru(HEAD_VISITA_CONFIRMADA))
    // E a régua não nasce satisfeita: o `HEAD` TINHA a linha.
    expect(HEAD_VISITA_CONFIRMADA).toContain("Data collected so far:")
    expect(semJsonCru(HEAD_VISITA_CONFIRMADA).split("\n")).toHaveLength(5)
  })

  it("(c) CONTROLE POSITIVO — `qualification_step` nulo continua suprimindo a própria linha", async () => {
    fixarRelogio(NOW)
    const t = await turno({ collectedData: {}, qualificationStep: null })
    // Sem `qualification_step` e sem dados, o bloco fica só com os marcadores —
    // que é o comportamento do HEAD, e é o que prova que a régua (a) mede a
    // linha do passo e não a existência do bloco.
    expect(t.contexto).toBe(
      ["=== CONVERSATION CONTEXT ===", "=== END CONVERSATION CONTEXT ==="].join("\n")
    )
  })
})
