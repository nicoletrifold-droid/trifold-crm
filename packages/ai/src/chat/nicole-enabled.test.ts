/**
 * Story 87-13 — um switch por empreendimento decide se a Nicole pode falar dele.
 *
 * O DEFEITO QUE ESTE TESTE FIXA
 * -----------------------------
 * Até aqui, o único critério que decidia se um empreendimento entrava na boca da
 * Nicole era `is_active` — que é o SOFT DELETE da tabela (`softDelete`,
 * `api-utils.ts:29-49`, chamado pelo `DELETE /api/properties/[id]`). Ou seja:
 * *"ele não foi excluído"*. **Cadastrar bastava para entrar na conversa.**
 *
 * A guarda que existia contra falar de um cadastro vazio era INSTRUÇÃO EM PROMPT
 * (o bloco `planning` da Story 75-281). Na mesma semana, o caso Ronaldo (`CR-7`,
 * 10/08) provou em produção que instrução em prompt não é enforcement: a regra
 * estava no bloco `[SISTEMA]`, explícita e correta, e o modelo a contrariou.
 *
 * Esta story troca **categoria por empreendimento** e **prompt por filtro**.
 *
 * AS DUAS PROVAS DESTE ARQUIVO
 * ----------------------------
 *  - **AC3** — não-regressão byte a byte contra um golden gravado em disco, gerado
 *    pelo `loadProperties` de produção ANTES de a linha do filtro existir.
 *  - **AC4** — o filtro atua nos TRÊS consumidores do turno, provado rodando
 *    `processMessage` inteiro, com controle POSITIVO obrigatório: sem ele, um
 *    `loadProperties` que devolvesse `[]` passaria em metade das asserções.
 *
 * Regravar o golden (só quando a mudança no contexto for INTENCIONAL e revisada):
 *   AIOS_87_13_REGRAVAR_GOLDEN=1 npx vitest run packages/ai/src/chat/nicole-enabled.test.ts
 */
import { describe, it, expect } from "vitest"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import type { SupabaseClient } from "@supabase/supabase-js"
import type Anthropic from "@anthropic-ai/sdk"
import { loadProperties, buildPropertyDataContext, processMessage } from "./pipeline"
import { createFakeSupabase, type FakeSupabase, type Row } from "./__fixtures__/fake-supabase"
import {
  CADASTRO_PRODUCAO,
  ORG_PRODUCAO,
  JAPURA,
  VIND,
} from "./__fixtures__/properties-producao"

const GOLDEN = path.join(__dirname, "__fixtures__", "contexto-nicole-head-87-13.txt")

const CONVERSATION = "conv-87-13"
const LEAD = "lead-87-13"

/** Cópia funda — o fake muda as linhas in place; um teste não pode contaminar o outro. */
function cadastro(mutar?: (linhas: Row[]) => void): Row[] {
  const linhas = CADASTRO_PRODUCAO.map((p) => ({ ...p })) as Row[]
  mutar?.(linhas)
  return linhas
}

/**
 * 🔴 O ESTADO QUE DISCRIMINA — produção depois da migration 221 (passo 4).
 *
 * No estado de HOJE, `is_active` e `nicole_enabled` são COLINEARES na fixture: o
 * paliativo de 10/08 pôs Japura e Solum em `is_active = false`, e o backfill da 220
 * os deixa em `nicole_enabled = false`. Um teste seedado com o estado de hoje passa
 * VERDE mesmo sem a linha `.eq("nicole_enabled", true)` — é o `is_active` segurando,
 * e o teste não saberia dizer a diferença. Foi assim que a primeira versão deste
 * arquivo deu 7/7 verdes contra o `pipeline.ts` sem o filtro.
 *
 * Depois da 221 os dois campos DISCORDAM (`is_active = true`, `nicole_enabled =
 * false`) — e é só aí que o switch é o único responsável por segurá-los. Este é o
 * estado usado nas provas que precisam morder, e é literalmente a AC9-(ii)
 * antecipada para teste.
 */
function cadastroPos221(mutar?: (linhas: Row[]) => void): Row[] {
  return cadastro((linhas) => {
    for (const l of linhas) l.is_active = true
    mutar?.(linhas)
  })
}

// ────────────────────────────────────────────────────────────────────────────
// AC3 — o contexto da Nicole é BYTE A BYTE o mesmo, para o cadastro real
// ────────────────────────────────────────────────────────────────────────────

/**
 * Esta AC só é possível porque o PALIATIVO de 10/08 já pôs Japura e Solum fora
 * (`is_active = false`). Logo, trocar o critério de `is_active` por
 * `nicole_enabled` NÃO pode mudar um byte do que ela vê hoje.
 *
 * O golden foi gerado pelo `loadProperties` DE PRODUÇÃO, com a fixture real,
 * ANTES de a linha `.eq("nicole_enabled", true)` existir — isto é, executando o
 * comportamento do `HEAD`. Não é uma reimplementação da query escrita à mão: uma
 * réplica provaria a réplica.
 *
 * ⚠️ Reexecutar DEPOIS da migration 221 (AC9-ii). É isso que prova que quem segura
 * os dois é o SWITCH, e não o soft delete.
 */
describe("AC3 — o contexto da Nicole não muda um byte (cadastro real de produção)", () => {
  it("bate byte a byte com o golden do HEAD", async () => {
    const fake = createFakeSupabase({ properties: cadastro() })
    const props = await loadProperties(fake as unknown as SupabaseClient, ORG_PRODUCAO)
    const contexto = buildPropertyDataContext(props, null)

    if (process.env.AIOS_87_13_REGRAVAR_GOLDEN === "1") {
      writeFileSync(GOLDEN, contexto)
    }

    const esperado = readFileSync(GOLDEN, "utf8")
    expect(contexto).toBe(esperado)
    // Controle: um golden vazio daria verde contra um `loadProperties` quebrado.
    expect(contexto.length).toBeGreaterThan(1000)
    expect(props.map((p) => p.name)).toEqual(["Vind Residence", "Yarden"])
  })

  /**
   * 🔴 AC9-(ii) antecipada — a prova de que quem segura é o SWITCH, não o soft delete.
   * Este caso é VERMELHO sem a linha `.eq("nicole_enabled", true)`.
   */
  it("continua igual ao golden DEPOIS da 221, com os dois de volta a is_active=true", async () => {
    const fake = createFakeSupabase({ properties: cadastroPos221() })
    const props = await loadProperties(fake as unknown as SupabaseClient, ORG_PRODUCAO)
    const contexto = buildPropertyDataContext(props, null)

    expect(props.map((p) => p.name)).toEqual(["Vind Residence", "Yarden"])
    expect(contexto).toBe(readFileSync(GOLDEN, "utf8"))
    expect(contexto).not.toContain("Japura")
    expect(contexto).not.toContain("Solum")
  })

  /**
   * O vermelho da AC3, fixado como teste em vez de ficar só colado no relatório:
   * ligar o Japura DEVE mudar o contexto. Se este caso ficar verde junto com o de
   * cima, o filtro não está filtrando nada.
   */
  it("controle negativo: ligar o Japura QUEBRA a igualdade (e traz o bloco da 75-281)", async () => {
    const fake = createFakeSupabase({
      properties: cadastroPos221((linhas) => {
        linhas.find((l) => l.id === JAPURA.id)!.nicole_enabled = true
      }),
    })
    const contexto = buildPropertyDataContext(
      await loadProperties(fake as unknown as SupabaseClient, ORG_PRODUCAO),
      null
    )
    expect(contexto).not.toBe(readFileSync(GOLDEN, "utf8"))
    expect(contexto).toContain("Japura (Em planejamento)")
    expect(contexto).toContain("ATENCAO — EM PLANEJAMENTO")
  })
})

// ────────────────────────────────────────────────────────────────────────────
// C3 do gate — a OUTRA linha do par: o soft delete continua segurando
// ────────────────────────────────────────────────────────────────────────────

/**
 * 🔴 A QUINTA LINHA — o estado que o `DELETE /api/properties/[id]` produz HOJE.
 *
 * `softDelete` (`api-utils.ts:29-49`) escreve **só** `is_active = false`; nenhum dos
 * três writers de `properties` toca o `nicole_enabled`. Logo, excluir um
 * empreendimento que estava LIGADO deixa exatamente este par: `is_active = false` +
 * `nicole_enabled = true`. É a única combinação em que o soft delete é o ÚNICO
 * critério capaz de excluir a linha — e é por isso que ela é o instrumento.
 *
 * Sem esta linha na fixture, a suíte inteira fica verde com o `.eq("is_active",
 * true)` REMOVIDO de `loadProperties` (mutação M2 do gate: 2174 passed, zero
 * vermelho). Nas quatro linhas de produção `is_active` e `nicole_enabled` são
 * colineares, então o `nicole_enabled` sozinho segura tudo e o soft delete não tem
 * um único caso que o prove.
 *
 * Por que isso importa NESTA story e não é dívida alheia: é ela que separa os dois
 * conceitos (`is_active` = existe no CRM; `nicole_enabled` = a IA fala dele) e grava
 * a separação no `comment on column` da 220. A partir daqui são duas linhas que
 * parecem redundantes no mesmo `.eq` encadeado — deixar metade do par sem guarda é
 * a assimetria que produz regressão silenciosa no próximo refactor.
 *
 * Deriva do Vind (cadastro completo e real) só para não inventar um shape; o que
 * importa é o par de booleanos e o nome, que é o que as asserções leem.
 */
const EXCLUIDO_COM_SWITCH_LIGADO: Row = {
  ...(VIND as Row),
  id: "00000000-0000-0000-0004-0000000000ff",
  name: "Sentinela 87-13 — excluido com o switch ligado",
  slug: "sentinela-87-13-excluido",
  is_active: false,
  nicole_enabled: true,
}

/** As 4 reais + a sentinela. `cadastro()` (estado de HOJE) de propósito: ver abaixo. */
function cadastroComExcluido(mutar?: (linha: Row) => void): Row[] {
  const sentinela = { ...EXCLUIDO_COM_SWITCH_LIGADO }
  mutar?.(sentinela)
  return [...cadastro(), sentinela]
}

describe("C3 — o soft delete continua segurando (is_active e nicole_enabled são conceitos independentes)", () => {
  /**
   * 🔴 Este caso é VERMELHO sem a linha `.eq("is_active", true)`.
   *
   * Usa `cadastro()` — o estado de HOJE — e não `cadastroPos221()`, e a escolha é
   * o desenho do instrumento: aqui a colinearidade das quatro linhas de produção
   * não atrapalha (Japura e Solum saem por QUALQUER um dos dois critérios), e a
   * ÚNICA linha que discrimina é a sentinela, onde os dois campos DISCORDAM. O
   * resultado é uma régua de um eixo só: cai ao remover o `is_active`, e fica
   * verde ao remover o `nicole_enabled` — que é o que se quer de um caso que
   * existe para provar a outra metade do par.
   */
  it("empreendimento EXCLUIDO com o switch LIGADO não entra no contexto da Nicole", async () => {
    const fake = createFakeSupabase({ properties: cadastroComExcluido() })
    const props = await loadProperties(fake as unknown as SupabaseClient, ORG_PRODUCAO)
    const contexto = buildPropertyDataContext(props, null)

    expect(props.map((p) => p.name)).toEqual(["Vind Residence", "Yarden"])
    expect(contexto).not.toContain("Sentinela 87-13")
    // O golden não muda: a sentinela é invisível ao contexto, e essa é a tese.
    expect(contexto).toBe(readFileSync(GOLDEN, "utf8"))
  })

  /**
   * Controle-espelho obrigatório: sem ele, a asserção de cima passaria verde contra
   * uma sentinela que `loadProperties` simplesmente nunca devolveria (shape errado,
   * `org_id` errado, o que fosse). Restaurar o `is_active` — com o switch já ligado,
   * que é exatamente o cenário de "desfazer exclusão" — a traz de volta.
   */
  it("controle-espelho: restaurar o is_active (com o switch ligado) a traz de volta", async () => {
    const fake = createFakeSupabase({
      properties: cadastroComExcluido((linha) => {
        linha.is_active = true
      }),
    })
    const props = await loadProperties(fake as unknown as SupabaseClient, ORG_PRODUCAO)
    const contexto = buildPropertyDataContext(props, null)

    expect(props.map((p) => p.name)).toEqual([
      "Vind Residence",
      "Yarden",
      "Sentinela 87-13 — excluido com o switch ligado",
    ])
    expect(contexto).toContain("Sentinela 87-13")
  })
})

// ────────────────────────────────────────────────────────────────────────────
// AC4 — o filtro atua nos TRÊS consumidores, e a prova é o turno inteiro
// ────────────────────────────────────────────────────────────────────────────

type TurnoAnthropic = { systemEnviado: string }

/**
 * ⚠️ O turno faz DUAS chamadas a `anthropic.messages.create`: a da resposta (com
 * `system`) e a da extração estruturada (sem `system`). Capturar a última zeraria
 * o `system` e as asserções de (i) passariam verdes contra uma string vazia — o
 * falso verde clássico. Guarda-se a PRIMEIRA que trouxer `system`.
 */
function fakeAnthropic(resposta: string, captura: TurnoAnthropic): Anthropic {
  return {
    messages: {
      create: async (params: { system?: unknown }) => {
        const s = params.system
        if (s !== undefined && captura.systemEnviado === "") {
          captura.systemEnviado = Array.isArray(s)
            ? s.map((b: { text?: string }) => b.text ?? "").join("\n\n")
            : String(s)
        }
        return {
          content: [{ type: "text", text: resposta }],
          usage: {
            input_tokens: 10,
            output_tokens: 10,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        }
      },
    },
  } as unknown as Anthropic
}

function seedDoTurno(linhas: Row[]) {
  return {
    conversations: [{ id: CONVERSATION, lead_id: LEAD, org_id: ORG_PRODUCAO }],
    conversation_state: [
      {
        conversation_id: CONVERSATION,
        collected_data: { name: "Lead de teste" },
        qualification_step: "name",
        current_property_id: null,
      },
    ],
    leads: [
      {
        id: LEAD,
        name: "Lead de teste",
        phone: "554499999999",
        lost_reason: null,
        ai_summary: null,
        qualification_status: "in_progress",
      },
    ],
    messages: [],
    appointments: [],
    activities: [],
    lead_facts: [],
    system_events: [],
    properties: linhas,
  }
}

type Evento = { event_type: string; metadata?: Record<string, unknown> }

async function rodarTurno(
  mensagem: string,
  // 🔴 O estado PÓS-221 é o que discrimina: com `is_active` colinear a
  // `nicole_enabled`, (i) e (ii) passariam verdes sem o filtro existir.
  linhas: Row[] = cadastroPos221()
): Promise<{ fake: FakeSupabase; system: string; eventos: Evento[] }> {
  const captura: TurnoAnthropic = { systemEnviado: "" }
  const eventos: Evento[] = []
  const fake = createFakeSupabase(seedDoTurno(linhas))
  await processMessage({
    supabase: fake as unknown as SupabaseClient,
    anthropic: fakeAnthropic("Claro! Me conta um pouco do que você procura.", captura),
    conversationId: CONVERSATION,
    message: mensagem,
    orgId: ORG_PRODUCAO,
    // `processMessage` NÃO grava `system_events` — ele emite por callback
    // (`emit = params.onEvent ?? (() => {})`). Ler a tabela devolveria `[]`
    // sempre, e o (ii) passaria verde sem provar nada.
    onEvent: (e) => eventos.push(e as Evento),
  })
  return { fake, system: captura.systemEnviado, eventos }
}

function propertyIdentified(eventos: Evento[]): Evento[] {
  return eventos.filter((e) => e.event_type === "PROPERTY_IDENTIFIED")
}

describe("AC4 — o filtro atua nos três consumidores do turno", () => {
  it("(i) o `system` enviado à Anthropic não contém Japura nem Solum", async () => {
    const { system } = await rodarTurno("oi, quero informações")
    expect(system).not.toContain("Japura")
    expect(system).not.toContain("Solum")
    // Controle positivo no mesmo caso: o system foi montado de verdade.
    expect(system).toContain("Vind Residence")
    expect(system.length).toBeGreaterThan(1000)
  })

  it("(ii) 'quero saber do Japurá' NÃO identifica nada — consequência declarada do §3", async () => {
    // Desligado ⇒ ela também não RECONHECE o nome. Isto supera parcialmente a
    // 75-281 e está fixado aqui como INTENÇÃO, não descoberto depois. Medido:
    // os dois têm 0 leads vinculados e 0 `PROPERTY_IDENTIFIED` all-time.
    // O modo de falha resultante é ela NÃO SABER — silêncio, não afirmação falsa.
    const { fake, eventos } = await rodarTurno("quero saber do Japura")
    expect(propertyIdentified(eventos)).toHaveLength(0)
    expect(fake.table("conversation_state")[0]!.current_property_id).toBeNull()
  })

  it("(iii) CONTROLE POSITIVO — 'quero saber do Vind' identifica o Vind", async () => {
    // Sem este caso, (i) e (ii) passariam verdes num `loadProperties` que
    // devolvesse `[]` — que é exatamente o modo de falha MUDO do Risco 1
    // (`if (error || !data) return []`, pipeline.ts).
    const { fake, eventos } = await rodarTurno("quero saber do Vind")
    const identificados = propertyIdentified(eventos)
    expect(identificados).toHaveLength(1)
    expect(identificados[0]!.metadata!.property_id).toBe(VIND.id)
    expect(fake.table("conversation_state")[0]!.current_property_id).toBe(VIND.id)
  })

  it("controle: com o Japura LIGADO, o mesmo turno passa a identificá-lo", async () => {
    // O espelho de (ii): prova que o "não identifica" vem do switch, e não de o
    // `identifyProperty` simplesmente não saber casar o nome "Japura".
    const { system, eventos } = await rodarTurno(
      "quero saber do Japura",
      cadastroPos221((linhas) => {
        linhas.find((l) => l.id === JAPURA.id)!.nicole_enabled = true
      })
    )
    expect(system).toContain("Japura")
    const identificados = propertyIdentified(eventos)
    expect(identificados).toHaveLength(1)
    expect(identificados[0]!.metadata!.property_id).toBe(JAPURA.id)
  })
})
