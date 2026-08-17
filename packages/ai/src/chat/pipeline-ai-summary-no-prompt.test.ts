/**
 * Story 87-16 (AC1) — o `ai_summary` continua entrando no prompt da Nicole.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE ARQUIVO EXISTE, E POR QUE ELE É A STORY INTEIRA
 *
 * A 87-16 enterra o MemPalace — duas tabelas e uma RPC que NUNCA existiram em
 * produção (os nomes ficam no histórico do git, sha a60a1bc6). O que
 * quase foi enterrado junto: o carregador progressivo removido
 * (`packages/ai/src/memory/`, sha a60a1bc6) era o ÚNICO caminho pelo qual o
 * `ai_summary` chegava ao prompt. O mecanismo é contraintuitivo e por isso
 * perigoso — era o `return ""` da tabela morta que ARMAVA o fallback:
 *
 *     if (!l1Snapshot && aiSummaryFallback) → "MEMORIA DO LEAD (resumo):\n…"
 *
 * Medido em produção nos 30 dias anteriores: **624 de 1.052 turnos (59,3 %)** —
 * turno = mensagem `role='user'` de lead com `ai_summary` não-vazio. Por lead
 * ATIVO (lead com ao menos uma mensagem `role='user'` na janela de 30 d):
 * **124 de 195 (63,6 %)**. ⚠️ A definição vai junto do número de propósito:
 * trocando "ativo" por *qualquer* mensagem (inclui `role='broker'`) o mesmo
 * eixo dá **135 de 357 (37,8 %)**.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O QUE A SUÍTE MEDIA ANTES DESTE ARQUIVO: NADA
 *
 *     testes que contêm a string "MEMORIA DO LEAD"     : 0
 *     testes que assertam sobre `memoryContext`        : 0
 *     fixtures de pipeline com `ai_summary` preenchido : 0 de 6 (todas `null`)
 *
 * Ou seja: só havia CONTROLE NEGATIVO. O bloco inteiro podia ser deletado com a
 * suíte verde — e foi (@po: subtração completa ⇒ `187 passed / 2396`, zero
 * vermelhos). Uma AC que já nasce satisfeita não mede nada; a mutação desta AC
 * tinha de sair de 0. O número medido está no Dev Agent Record da story.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A REGRA QUE ESTE ARQUIVO EXISTE PARA CONGELAR: A STRING É BYTE A BYTE
 *
 * Há TRÊS cabeçalhos no código de origem e só UM rodou em produção:
 *
 *   ramo VIVO    `MEMORIA DO LEAD (resumo):`                        624 turnos/30 d
 *   ramo `catch` `MEMORIA DO LEAD (informacoes de conversas anteriores):`  NUNCA
 *   L1 cheio     `MEMORIA DO LEAD (fatos ativos):`                        NUNCA
 *
 * Os dois últimos nunca dispararam porque `supabase-js` NÃO lança em erro de
 * PostgREST (resolve com `{ data: null, error }`) e porque a tabela de fatos
 * não existe. Colapsar no cabeçalho do `catch` embarcaria **+29 caracteres de
 * prompt em 59,3 % dos turnos** numa story que se apresenta como subtração.
 * Por isso a asserção aqui é de IGUALDADE de string, não de "contém memória".
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import type Anthropic from "@anthropic-ai/sdk"
import { STAGE_IDS } from "@trifold/shared"
import { processMessageWithMetadata } from "./pipeline"
import { createFakeSupabase, type Row } from "./__fixtures__/fake-supabase"

const ORG = "org-1"
const CONVERSATION = "conv-1"
const LEAD = "lead-1"

/** Quarta-feira, 10:00 BRT — relógio fixo, mesma razão da 87-8/87-5. */
const NOW = "2026-08-12T13:00:00Z"

/** Mensagem neutra: sem `?` e sem palavra de tópico, para o turno ser determinístico. */
const MENSAGEM = "vou pensar e te falo"

/**
 * O resumo. Duas frases distinguíveis de propósito: a asserção de conteúdo
 * (i-b) mede o TEXTO DO RESUMO, não o cabeçalho — as duas coisas em um
 * `toContain` só já esconderam defeito nesta casa.
 */
const RESUMO =
  "Sandra, 34 anos, busca 2 quartos no Vind. Ja visitou o decorado em julho e pediu simulacao."

/** O cabeçalho VIVO, isolado — o `(resumo)` é o byte que esta AC protege. */
const CABECALHO = "MEMORIA DO LEAD (resumo):"

/**
 * O bloco INTEIRO, byte a byte, como o carregador removido produzia:
 * `\n` + snapshot + `\n\n` + instrução + `\n`. Com um único `part`,
 * o `parts.join("\n\n")` é a identidade — é por isso que a igualdade fecha.
 */
const BLOCO_ESPERADO = `\nMEMORIA DO LEAD (resumo):\n${RESUMO}\n\nUse essas informacoes para personalizar o atendimento. Chame pelo nome, referencie o que ja conversaram.\n`

interface Turno {
  /** O `system` inteiro (blocos estáticos + `dynamicSuffix`), concatenado. */
  system: string
  /** SÓ o `dynamicSuffix` — o bloco sem `cache_control`, onde a memória mora. */
  dynamicSuffix: string
  blocos: Array<{ text: string; cacheavel: boolean }>
}

function anthropicCapturando(box: { blocos: Turno["blocos"]; capturou: boolean }): Anthropic {
  return {
    messages: {
      create: async (args: {
        messages: Array<{ role: string; content: unknown }>
        system?: Array<{ type: string; text?: string; cache_control?: unknown }> | string
      }) => {
        // Só a PRIMEIRA chamada é a da resposta; as seguintes são de memória/resumo.
        if (!box.capturou) {
          box.capturou = true
          box.blocos = Array.isArray(args.system)
            ? args.system.map((b) => ({ text: b.text ?? "", cacheavel: b.cache_control != null }))
            : [{ text: String(args.system ?? ""), cacheavel: false }]
        }
        return {
          content: [{ type: "text", text: "Combinado!" }],
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

function seed(input: { aiSummary: string | null; leadId?: string | null }): Record<string, Row[]> {
  const leadId = input.leadId === undefined ? LEAD : input.leadId
  return {
    conversations: [{ id: CONVERSATION, lead_id: leadId, org_id: ORG }],
    conversation_state: [
      {
        conversation_id: CONVERSATION,
        collected_data: { name: "Sandra" },
        qualification_step: "floor",
        current_property_id: null,
        visit_proposed: false,
      },
    ],
    leads: leadId
      ? [
          {
            id: leadId,
            name: "Sandra",
            phone: "5544999999999",
            stage_id: STAGE_IDS.novo,
            assigned_broker_id: "broker-1",
            lost_reason: null,
            ai_summary: input.aiSummary,
            source: "whatsapp_organic",
            qualification_status: "in_progress",
            property_interest_id: null,
            interest_level_manual: null,
          },
        ]
      : [],
    messages: [
      {
        id: "msg-01",
        conversation_id: CONVERSATION,
        role: "user",
        content: "oi, vi o anuncio",
        metadata: {},
        created_at: "2026-08-01T10:01:00.000Z",
      },
      {
        id: "msg-02",
        conversation_id: CONVERSATION,
        role: "assistant",
        content: "Oi! Sou a Nicole, da Trifold.",
        metadata: {},
        created_at: "2026-08-01T10:02:00.000Z",
      },
    ],
    users: [],
    appointments: [],
    activities: [],
    properties: [],
  }
}

async function turno(input: { aiSummary: string | null; leadId?: string | null }): Promise<Turno> {
  const box = { blocos: [] as Turno["blocos"], capturou: false }
  const fake = createFakeSupabase(seed(input))
  await processMessageWithMetadata({
    supabase: fake as unknown as SupabaseClient,
    anthropic: anthropicCapturando(box),
    conversationId: CONVERSATION,
    message: MENSAGEM,
    orgId: ORG,
  })
  const dinamicos = box.blocos.filter((b) => !b.cacheavel)
  return {
    system: box.blocos.map((b) => b.text).join(""),
    // O `dynamicSuffix` é SEMPRE o ÚLTIMO bloco do `system`, e é o único sem
    // `cache_control` (ver a montagem de `systemBlocks` em `pipeline.ts`).
    dynamicSuffix: dinamicos[dinamicos.length - 1]?.text ?? "",
    blocos: box.blocos,
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
// AC1 (i) — CONTROLE POSITIVO: com resumo, a memória entra no prompt
// ────────────────────────────────────────────────────────────────────────────

describe("AC1 (i) — controle positivo: lead COM ai_summary", () => {
  it("(i-a) o cabeçalho vivo entra no prompt — e é `(resumo)`, não o do ramo `catch`", async () => {
    fixarRelogio(NOW)
    const t = await turno({ aiSummary: RESUMO })

    expect(t.system).toContain(CABECALHO)
  })

  it("(i-b) o TEXTO do resumo entra no prompt — asserção separada, de propósito", async () => {
    fixarRelogio(NOW)
    const t = await turno({ aiSummary: RESUMO })

    // 🔴 Duas asserções num `toContain` só já esconderam defeito nesta casa:
    // cabeçalho presente com corpo vazio passaria. Esta mede o CORPO.
    expect(t.system).toContain(RESUMO)
  })

  it("(i-c) 🔴 o cabeçalho do ramo `catch` NÃO aparece — ele nunca rodou em produção", async () => {
    fixarRelogio(NOW)
    const t = await turno({ aiSummary: RESUMO })

    // +29 caracteres de prompt em 59,3 % dos turnos entrariam de carona aqui.
    expect(t.system).not.toContain("MEMORIA DO LEAD (informacoes de conversas anteriores):")
    // E o cabeçalho do L1 cheio (tabela de fatos), que também nunca rodou.
    expect(t.system).not.toContain("MEMORIA DO LEAD (fatos ativos):")
  })

  it("(i-d) a memória mora no bloco NÃO-CACHEÁVEL — os 8 blocos estáticos não são tocados", async () => {
    fixarRelogio(NOW)
    const t = await turno({ aiSummary: RESUMO })

    const cacheaveis = t.blocos.filter((b) => b.cacheavel)
    expect(cacheaveis.length).toBeGreaterThan(0)
    expect(cacheaveis.some((b) => b.text.includes("MEMORIA DO LEAD"))).toBe(false)
    expect(t.dynamicSuffix).toContain(CABECALHO)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// AC1 (iii) — EQUIVALÊNCIA DE STRING, byte a byte
// ────────────────────────────────────────────────────────────────────────────

describe("AC1 (iii) — a string é preservada byte a byte", () => {
  it("o bloco inteiro sai IDÊNTICO ao que o carregador removido produzia", async () => {
    fixarRelogio(NOW)
    const t = await turno({ aiSummary: RESUMO })

    // Igualdade do literal completo: `\n` inicial, `(resumo)`, `\n\n` antes da
    // instrução e `\n` final. Qualquer byte a mais ou a menos derruba.
    expect(t.dynamicSuffix).toContain(BLOCO_ESPERADO)
  })

  it("🔴 equivalência caso a caso: o prompt COM resumo é o SEM resumo + o bloco, e nada mais", async () => {
    fixarRelogio(NOW)
    const comResumo = await turno({ aiSummary: RESUMO })
    vi.useRealTimers()
    fixarRelogio(NOW)
    const semResumo = await turno({ aiSummary: null })

    // Esta é a asserção que prova SUBTRAÇÃO PURA: removido o bloco de memória,
    // o resto do `dynamicSuffix` tem de ser byte a byte o mesmo. Se a story
    // mexer em qualquer outro contexto (data/hora, lead, no-show, fluxo), cai.
    expect(comResumo.dynamicSuffix.replace(BLOCO_ESPERADO, "")).toBe(semResumo.dynamicSuffix)
    // E o bloco realmente estava lá (senão o `replace` seria no-op e a
    // asserção acima passaria com a memória apagada).
    expect(comResumo.dynamicSuffix).not.toBe(semResumo.dynamicSuffix)
  })

  it("a marca aparece UMA vez, não duas — nem cabeçalho duplicado, nem bloco repetido", async () => {
    fixarRelogio(NOW)
    const t = await turno({ aiSummary: RESUMO })

    expect(t.system.split("MEMORIA DO LEAD").length - 1).toBe(1)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// AC1 (ii) — CONTROLE NEGATIVO: sem resumo, nada aparece
// ────────────────────────────────────────────────────────────────────────────

describe("AC1 (ii) — controle negativo", () => {
  it("`ai_summary: null` ⇒ nenhum cabeçalho, e nenhum cabeçalho com corpo vazio", async () => {
    fixarRelogio(NOW)
    const t = await turno({ aiSummary: null })

    expect(t.system).not.toContain("MEMORIA DO LEAD")
  })

  it("`ai_summary: \"\"` (string vazia) ⇒ também nada — vazio não é memória", async () => {
    fixarRelogio(NOW)
    const t = await turno({ aiSummary: "" })

    expect(t.system).not.toContain("MEMORIA DO LEAD")
  })

  it("conversa SEM `lead_id` ⇒ nada, e o turno não quebra", async () => {
    fixarRelogio(NOW)
    const t = await turno({ aiSummary: RESUMO, leadId: null })

    expect(t.system).not.toContain("MEMORIA DO LEAD")
    expect(t.system.length).toBeGreaterThan(0)
  })
})
