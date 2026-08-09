/**
 * Story 87-0 — "nada de configuração sem consumidor".
 *
 * O PROBLEMA QUE ESTE TESTE EXISTE PARA IMPEDIR
 * ---------------------------------------------
 * O painel admin tem campos que o admin edita, salva, vê "salvo com sucesso" — e que
 * o runtime nunca lê. Não é hipótese: a auditoria de 05/08 encontrou CINCO superfícies
 * assim, uma delas visível ao lead (`off-hours`: o painel tem um texto com os horários
 * e o que sai é a constante curta do código; quem escreveu acha, desde 18/06, que está
 * no ar). Nenhuma delas dá erro. Nenhuma aparece em log. A única forma de descobrir é
 * alguém ler o pipeline inteiro com a tela aberta do lado.
 *
 * Este teste é a rede: TODA superfície de configuração editável precisa provar que
 * existe caminho até o runtime. Quem adicionar a próxima, sem consumidor, quebra o build.
 *
 * POR QUE ESTE DESENHO (registro explícito + sentinela) E NÃO ANÁLISE ESTÁTICA
 * ----------------------------------------------------------------------------
 * Análise estática por ocorrência (grep/AST "o campo aparece no pipeline?") daria
 * VERDE nos cinco casos — `personality_prompt` aparece 4 vezes em `pipeline.ts` (no
 * `select`, na interface, no fallback e no return) e mesmo assim é descartado. É
 * exatamente a diferença entre CARREGADO e USADO, e contagem de ocorrência não vê
 * essa diferença. Pior: renomear um identificador quebraria o teste sem nada ter
 * mudado de verdade.
 *
 * A prova aqui é COMPORTAMENTAL: injeta-se um sentinela no valor de configuração,
 * chamam-se as funções de produção com a MESMA fiação que o pipeline usa, e afirma-se
 * que o sentinela aparece em algum texto que chega ao lead ou ao corretor. É imune a
 * rename e a refactor — enquanto o valor continuar chegando ao runtime, fica verde.
 *
 * Para os campos que não produzem texto (`model_primary`, `temperature`, `max_tokens`,
 * `business_hours`), consumidos lá dentro de `runChatPipeline` — que exigiria mockar
 * Anthropic + Supabase para exercitar —, a prova é ESTRUTURAL e deliberadamente
 * estreita: o campo precisa ser LIDO do objeto de config já resolvido (`agentConfig.x`),
 * fora do corpo do loader e fora da declaração de tipo. É justamente o que separa os
 * 4 campos vivos dos 3 mortos.
 *
 * ⚠️ VERMELHO ESPERADO HOJE — 5 superfícies órfãs.
 * Fazê-las valer é a Tarefa 5 da story 87-0 (AC8), que é comportamento novo e depende
 * de decisão de produto. Os casos estão marcados com `it.fails`: a suíte fica verde,
 * mas quando alguém ligar a superfície o `it.fails` PASSA A FALHAR, obrigando a
 * remoção do marcador. Dívida que se apaga sozinha do inventário, não `skip` que apodrece.
 *
 * Para ver o vermelho real (as 5 órfãs):
 *   AIOS_87_0_SEM_MARCADORES=1 npx vitest run packages/ai/src/config-surfaces.test.ts
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import { buildSystemPrompt, type DbPromptOverrides } from "./prompts"
import { findRepoRoot, readSnapshotManifest } from "./prompts/snapshot"
import { resolveOffHoursResponse } from "./chat/pipeline"
import { generateHandoffSummary } from "./flows/handoff"

const debtCase = process.env.AIOS_87_0_SEM_MARCADORES === "1" ? it : it.fails

const SENTINELA = "SENTINELA_87_0_ZZQX"

const REPO = findRepoRoot()
const PIPELINE_TS = path.join(REPO, "packages/ai/src/chat/pipeline.ts")
const PAINEL_TSX = path.join(
  REPO,
  "packages/web/src/app/dashboard/configuracoes/personalidade/page.tsx"
)
const AGENT_CONFIG_ROUTE = path.join(REPO, "packages/web/src/app/api/agent-config/route.ts")

// ────────────────────────────────────────────────────────────────────────────
// A fiação de produção, reproduzida uma vez só.
// ────────────────────────────────────────────────────────────────────────────

/** Uma configuração completa, do jeito que `loadAgentConfig` a devolve. */
type ConfigFixture = {
  /** `agent_prompts`, slug → content. O pipeline joga TODOS os slugs ativos aqui (pipeline.ts, loadAgentConfig). */
  prompts: Record<string, string>
  agentConfig: {
    personality_prompt: string | null
    greeting_message: string | null
    out_of_hours_message: string | null
    guardrails: string[]
  }
}

function configVazia(): ConfigFixture {
  return {
    prompts: {},
    agentConfig: {
      personality_prompt: null,
      greeting_message: null,
      out_of_hours_message: null,
      guardrails: [],
    },
  }
}

/**
 * TODO texto que o runtime produz a partir da configuração, pelas mesmas chamadas
 * que o pipeline faz. Se um valor editável não aparece em nenhum destes, ele não
 * chega a ninguém — nem ao lead, nem ao corretor.
 *
 * Se um dia surgir uma quarta superfície de texto, ela entra AQUI. O modo de falha
 * de esquecer é falso-vermelho (o teste acusa órfão que não é), que é o lado seguro.
 */
function textosProduzidosPeloRuntime(config: ConfigFixture): Array<{ onde: string; texto: string }> {
  return [
    {
      onde: "system prompt da Nicole — buildSystemPrompt(overrides)",
      texto: buildSystemPrompt(undefined, undefined, config.prompts as DbPromptOverrides)
        .map((b) => b.text)
        .join("\n\n"),
    },
    {
      onde: "resposta de fora do horário — resolveOffHoursResponse(agentConfig)",
      texto: resolveOffHoursResponse({
        out_of_hours_message: config.agentConfig.out_of_hours_message,
      }),
    },
    {
      // NÃO recebe configuração nenhuma — a assinatura não tem por onde. É por isso
      // que o slug `handoff-summary` é um botão morto: não há parâmetro para ele.
      onde: "resumo do corretor — generateHandoffSummary(collectedData, messages)",
      texto: generateHandoffSummary({ name: "Fulano" }, [{ role: "user", content: "oi" }]),
    },
  ]
}

// ────────────────────────────────────────────────────────────────────────────
// O registro: toda superfície editável, com sua prova de consumo.
// ────────────────────────────────────────────────────────────────────────────

type Prova =
  | {
      /** Injeta o sentinela e devolve a config resultante; o teste procura o sentinela nos textos do runtime. */
      tipo: "sentinela"
      injetar: (config: ConfigFixture, sentinela: string) => void
    }
  | {
      /** O campo precisa ser lido do objeto de config resolvido (`agentConfig.x`) em runtime. */
      tipo: "leitura-estrutural"
      campo: string
    }

type Superficie = {
  /** `agent_prompts.<slug>` ou `agent_config.<coluna>` */
  id: string
  /** Onde o admin edita (ou por onde o valor entra). */
  editadoEm: string
  /** Onde o runtime consome — `null` quando NÃO existe consumidor (dívida conhecida). */
  consumidoEm: string | null
  prova: Prova
}

/** Helper: superfície de `agent_prompts` provada por sentinela no system prompt. */
function slugDePrompt(slug: string, consumidoEm: string | null): Superficie {
  return {
    id: `agent_prompts.${slug}`,
    editadoEm: "painel /dashboard/configuracoes/personalidade (server action savePromptAction) + PUT /api/admin/agent-prompts/[slug]",
    consumidoEm,
    prova: {
      tipo: "sentinela",
      injetar: (config, sentinela) => {
        config.prompts[slug] = sentinela
      },
    },
  }
}

const SUPERFICIES: Superficie[] = [
  // ── agent_prompts: os 5 slugs que compõem o bloco estático ────────────────
  slugDePrompt("system-personality", "prompts/index.ts — buildStaticSystemContent"),
  slugDePrompt("guardrails", "prompts/index.ts — buildStaticSystemContent"),
  slugDePrompt("qualification-flow", "prompts/index.ts — buildStaticSystemContent"),
  slugDePrompt("property-presentation", "prompts/index.ts — buildStaticSystemContent"),
  slugDePrompt("visit-scheduling", "prompts/index.ts — buildStaticSystemContent"),

  // ── agent_prompts: os 2 slugs órfãos ──────────────────────────────────────
  // O painel lista os 7 (filtra is_active=true, e os 7 estão ativos). Estes dois
  // chegam a `prompt_overrides` e param ali: `buildStaticSystemContent` só consome 5.
  slugDePrompt("off-hours", null),
  slugDePrompt("handoff-summary", null),

  // ── agent_config ──────────────────────────────────────────────────────────
  {
    id: "agent_config.out_of_hours_message",
    editadoEm: "painel (card 'Mensagem fora do horario') + PATCH /api/agent-config",
    consumidoEm: "chat/pipeline.ts — resolveOffHoursResponse",
    prova: {
      tipo: "sentinela",
      injetar: (config, sentinela) => {
        config.agentConfig.out_of_hours_message = sentinela
      },
    },
  },
  {
    id: "agent_config.personality_prompt",
    editadoEm: "PATCH /api/agent-config (allowlist)",
    consumidoEm: null,
    prova: {
      tipo: "sentinela",
      injetar: (config, sentinela) => {
        config.agentConfig.personality_prompt = sentinela
      },
    },
  },
  {
    id: "agent_config.greeting_message",
    editadoEm: "painel (card de saudação) + PATCH /api/agent-config",
    consumidoEm: null,
    prova: {
      tipo: "sentinela",
      injetar: (config, sentinela) => {
        config.agentConfig.greeting_message = sentinela
      },
    },
  },
  {
    id: "agent_config.guardrails",
    editadoEm: "coluna de agent_config (sem tela hoje; gravável direto no banco)",
    consumidoEm: null,
    prova: {
      tipo: "sentinela",
      injetar: (config, sentinela) => {
        config.agentConfig.guardrails = [sentinela]
      },
    },
  },
  {
    id: "agent_config.model_primary",
    editadoEm: "PATCH /api/agent-config (allowlist)",
    consumidoEm: "chat/pipeline.ts — chamadas anthropic.messages.create",
    prova: { tipo: "leitura-estrutural", campo: "model_primary" },
  },
  {
    id: "agent_config.temperature",
    editadoEm: "PATCH /api/agent-config (allowlist)",
    consumidoEm: "chat/pipeline.ts — chamada anthropic.messages.create",
    prova: { tipo: "leitura-estrutural", campo: "temperature" },
  },
  {
    id: "agent_config.max_tokens",
    editadoEm: "PATCH /api/agent-config (allowlist)",
    consumidoEm: "chat/pipeline.ts — chamada anthropic.messages.create",
    prova: { tipo: "leitura-estrutural", campo: "max_tokens" },
  },
  {
    id: "agent_config.business_hours",
    editadoEm: "painel /dashboard/configuracoes/horario",
    consumidoEm: "chat/pipeline.ts — bloco de fora do horário",
    prova: { tipo: "leitura-estrutural", campo: "business_hours" },
  },
]

/**
 * Inventário da dívida, com nome e sobrenome. Precisa bater com `consumidoEm: null`
 * do registro — mexer em um sem mexer no outro derruba o teste de coerência abaixo.
 */
const ORFAS_CONHECIDAS = [
  "agent_prompts.off-hours",
  "agent_prompts.handoff-summary",
  "agent_config.personality_prompt",
  "agent_config.greeting_message",
  "agent_config.guardrails",
]

// ────────────────────────────────────────────────────────────────────────────
// Execução das provas
// ────────────────────────────────────────────────────────────────────────────

function provaSentinela(superficie: Superficie): { ok: boolean; detalhe: string } {
  if (superficie.prova.tipo !== "sentinela") throw new Error("prova errada")
  const config = configVazia()
  superficie.prova.injetar(config, SENTINELA)
  const textos = textosProduzidosPeloRuntime(config)
  const encontrados = textos.filter((t) => t.texto.includes(SENTINELA))
  return {
    ok: encontrados.length > 0,
    detalhe:
      encontrados.length > 0
        ? `sentinela apareceu em: ${encontrados.map((e) => e.onde).join(", ")}`
        : `o valor de "${superficie.id}" NÃO apareceu em nenhum texto do runtime:\n` +
          textos.map((t) => `        - ${t.onde}`).join("\n"),
  }
}

/**
 * Corta o corpo de `loadAgentConfig` e a declaração `interface AgentConfig` do fonte.
 * O que sobra é o runtime de verdade: aparecer `.campo` aqui é USO; aparecer só no
 * `select`, no tipo ou no return do loader é apenas CARREGAMENTO.
 */
function fonteDoRuntimeSemLoader(): string {
  const src = readFileSync(PIPELINE_TS, "utf8")
  const semInterface = src.replace(/interface AgentConfig \{[\s\S]*?\n\}/, "")
  const inicio = semInterface.indexOf("async function loadAgentConfig")
  if (inicio === -1) {
    throw new Error(
      "Não achei `loadAgentConfig` em pipeline.ts. Se foi renomeado, atualize este teste — " +
        "ele precisa saber separar 'carregado' de 'usado'."
    )
  }
  // O loader termina na próxima declaração de topo (linha que começa sem indentação com `}` seguido de linha em branco).
  const resto = semInterface.slice(inicio)
  const fim = resto.indexOf("\n}\n")
  return semInterface.slice(0, inicio) + (fim === -1 ? "" : resto.slice(fim + 3))
}

function provaEstrutural(superficie: Superficie): { ok: boolean; detalhe: string } {
  if (superficie.prova.tipo !== "leitura-estrutural") throw new Error("prova errada")
  const campo = superficie.prova.campo
  const fonte = fonteDoRuntimeSemLoader()
  const leituras = fonte.match(new RegExp(`\\.${campo}\\b`, "g"))?.length ?? 0
  return {
    ok: leituras > 0,
    detalhe:
      leituras > 0
        ? `${leituras} leitura(s) de \`.${campo}\` fora do loader`
        : `nenhuma leitura de \`.${campo}\` fora de loadAgentConfig — o campo é carregado e descartado`,
  }
}

function executarProva(superficie: Superficie): { ok: boolean; detalhe: string } {
  return superficie.prova.tipo === "sentinela"
    ? provaSentinela(superficie)
    : provaEstrutural(superficie)
}

// ────────────────────────────────────────────────────────────────────────────

describe("nada de configuração sem consumidor (Story 87-0)", () => {
  describe("toda superfície editável chega ao runtime", () => {
    for (const superficie of SUPERFICIES) {
      const orfa = superficie.consumidoEm === null
      const executar = () => {
        const { ok, detalhe } = executarProva(superficie)
        expect(
          ok,
          `${superficie.id} não tem consumidor no runtime.\n` +
            `      editado em: ${superficie.editadoEm}\n` +
            `      ${detalhe}`
        ).toBe(true)
      }

      if (orfa) {
        debtCase(`[DÍVIDA — Tarefa 5/AC8] ${superficie.id} — editável e sem consumidor`, executar)
      } else {
        it(`${superficie.id} → ${superficie.consumidoEm}`, executar)
      }
    }
  })

  it("controle: a prova estrutural sabe dizer NÃO (senão é verde automático)", () => {
    // O maior risco da prova estrutural é o falso verde: se a excisão de
    // `loadAgentConfig` parar de funcionar (rename, refactor), o `select` e o
    // `return` do loader voltam para o texto analisado e TODO campo passa a
    // "ter leitura". Este controle negativo é o que impede isso de passar batido.
    const dead = provaEstrutural({
      id: "controle.personality_prompt",
      editadoEm: "-",
      consumidoEm: null,
      prova: { tipo: "leitura-estrutural", campo: "personality_prompt" },
    })
    expect(dead.ok, `controle negativo falhou: ${dead.detalhe}`).toBe(false)

    const alive = provaEstrutural({
      id: "controle.model_primary",
      editadoEm: "-",
      consumidoEm: "-",
      prova: { tipo: "leitura-estrutural", campo: "model_primary" },
    })
    expect(alive.ok, `controle positivo falhou: ${alive.detalhe}`).toBe(true)
  })

  it("o inventário de órfãs bate com o registro (uma não muda sem a outra)", () => {
    const doRegistro = SUPERFICIES.filter((s) => s.consumidoEm === null).map((s) => s.id)
    expect(doRegistro.sort()).toEqual([...ORFAS_CONHECIDAS].sort())
    expect(doRegistro).toHaveLength(5)
  })

  it("nenhuma superfície editável ficou de fora do registro", () => {
    // Enumera das TRÊS fontes de verdade, não da memória de quem escreveu o teste:
    //  (a) os slugs que existem em agent_prompts (via manifest do snapshot);
    //  (b) as colunas de agent_config que o runtime dá o trabalho de SELECIONAR
    //      — selecionar é uma afirmação de que o campo serve para alguma coisa;
    //  (c) o que o painel e a API deixam gravar.
    const registradas = new Set(SUPERFICIES.map((s) => s.id))

    const slugs = readSnapshotManifest().prompts.map((p) => `agent_prompts.${p.slug}`)

    const pipelineSrc = readFileSync(PIPELINE_TS, "utf8")
    const selectMatch = /\.from\("agent_config"\)[\s\S]{0,300}?\.select\(\s*"([^"]+)"/.exec(
      pipelineSrc
    )
    expect(selectMatch, "não achei o select de agent_config em pipeline.ts").not.toBeNull()
    const colunas = selectMatch![1]
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => `agent_config.${c}`)

    const painelSrc = readFileSync(PAINEL_TSX, "utf8")
    const painelMatch = /const AGENT_CONFIG_FIELDS = \[([^\]]*)\]/.exec(painelSrc)
    expect(painelMatch, "não achei AGENT_CONFIG_FIELDS no painel").not.toBeNull()
    const camposPainel = [...painelMatch![1].matchAll(/"([a-z_]+)"/g)].map(
      (m) => `agent_config.${m[1]}`
    )

    const routeSrc = readFileSync(AGENT_CONFIG_ROUTE, "utf8")
    const routeMatch = /buildUpdatePayload\(\s*body\s*,\s*\[([\s\S]*?)\]\s*\)/.exec(routeSrc)
    expect(routeMatch, "não achei a allowlist do PATCH /api/agent-config").not.toBeNull()
    const camposRota = [...routeMatch![1].matchAll(/"([a-z_]+)"/g)].map((m) => `agent_config.${m[1]}`)

    const naoRegistradas = [
      ...new Set([...slugs, ...colunas, ...camposPainel, ...camposRota]),
    ].filter((id) => !registradas.has(id))

    expect(
      naoRegistradas,
      "Superfície de configuração editável fora do registro deste teste.\n" +
        "      Registre em SUPERFICIES e prove que existe consumidor — ou ela vira a próxima\n" +
        "      config órfã, que o admin edita e o runtime ignora em silêncio."
    ).toEqual([])
  })
})
