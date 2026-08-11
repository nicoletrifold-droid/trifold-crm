/**
 * Story 87-0 (Tarefa 4 · AC6/AC7) — teste de CONTRADIÇÃO, não de divergência.
 *
 * Divergência é "os dois textos são diferentes" — isso o `--check` já mede.
 * Contradição é "as duas instruções não podem ser verdadeiras ao mesmo tempo":
 * a seção NÃO-SOBRESCRIVÍVEL do system prompt (`prompts/index.ts:83`) afirma que
 * todos os decorados ficam na SEDE e que o endereço da obra NÃO é onde o lead
 * visita — enquanto seções sobrescrevíveis mandam falar de "stand de vendas".
 * O modelo recebe as duas no mesmo prompt. Foi essa contradição que produziu o
 * incidente da Sandra (frase-molde "O endereço do stand é [endereço do
 * empreendimento]" → virou `visit_availability` → visita inexistente).
 *
 * COBRE OS DOIS LADOS, de propósito:
 *  - `_production/*.txt` — o que roda hoje (o banco é a fonte, D-87-0-a);
 *  - as CONSTANTES de `prompts/*.ts` — o fallback de bootstrap, que embarca no
 *    deploy e entra em cena sempre que faltar override (AC9). Um teste que só
 *    olhasse o snapshot deixaria a frase banida viajar dentro do fallback.
 *
 * ⚠️ ESTE TESTE É UM VERMELHO ESPERADO HOJE.
 * A limpeza das frases é a Tarefa 2 (reconciliação humana), que depende de decisão
 * de produto e NÃO faz parte desta entrega. Os casos de dívida estão marcados com
 * `it.fails` — a suíte fica verde, mas no dia em que a reconciliação limpar as
 * frases o marcador `it.fails` PASSA A FALHAR, obrigando quem fechar a Tarefa 2 a
 * remover o marcador. É o oposto de um `skip`, que apodreceria em silêncio.
 *
 * 📌 O DIA CHEGOU — metade dele, em 2026-08-11 (Story 87-1, @dev).
 * O marcador funcionou exatamente como projetado: ao regravar o snapshot com o que está
 * em PRODUÇÃO (`--write`, primeira tarefa da 87-1 por causa do Risco 5), o `it.fails` do
 * lado do snapshot passou a falhar por SUCESSO. Medido:
 *
 *   • `_production/*.txt` → **0 contradições**. A Tarefa 2 da 87-0 (feita à mão em prod em
 *     06/08) mais as edições `stand de vendas` → `sede da Trifold` (10/08) limparam as 4
 *     ocorrências que este arquivo fotografara: guardrails ×2, property-presentation ×1,
 *     system-personality ×1. O caso virou `it` — de fotografia de dívida a **guarda de
 *     regressão**: se "stand" voltar ao banco, isto fica vermelho.
 *   • CONSTANTES do código → **continua devendo 2** (`GUARDRAILS_PROMPT` linhas 20 e 85).
 *     Segue como `debtCase`. Corrigi-las está FORA do escopo da 87-1 (é edição de prompt,
 *     não de processo) e não é urgente pelo mesmo motivo de sempre: enquanto houver linha
 *     ativa com conteúdo em `agent_prompts`, a constante NUNCA é lida
 *     (`prompts/index.ts:84-88`). Ela só entra em cena num bootstrap.
 *   • neutralizadas por negação no snapshot: 2 → **3**. A terceira é
 *     `property-presentation:36` ("NUNCA passe o endereco da obra para visita. Sempre
 *     direcione para a sede."), que a reconciliação de 06/08 ACRESCENTOU. É guardrail
 *     corretivo, não contradição — mas o número está pinado de propósito: se ele subir
 *     sem alguém saber por quê, a regra de negação virou tapete.
 *
 * Para ver o vermelho de verdade (a dívida real, sem marcadores):
 *   AIOS_87_0_SEM_MARCADORES=1 npx vitest run packages/ai/src/prompts/contradiction.test.ts
 */
import { describe, it, expect } from "vitest"
import {
  buildSystemPrompt,
  SEDE_ADDRESS,
  PERSONALITY_PROMPT,
  GUARDRAILS_PROMPT,
  QUALIFICATION_PROMPT,
  PROPERTY_PRESENTATION_PROMPT,
  VISIT_SCHEDULING_PROMPT,
  HANDOFF_SUMMARY_PROMPT,
  OFF_HOURS_PROMPT,
} from "./index"
import { loadProductionSnapshot } from "./snapshot"

/**
 * Sem marcadores, os casos de dívida ficam vermelhos — que é o estado honesto
 * enquanto a Tarefa 2 não roda.
 */
const debtCase = process.env.AIOS_87_0_SEM_MARCADORES === "1" ? it : it.fails

/**
 * Padrões de "a obra é o local da visita". Mínimo exigido pela AC6.
 *
 * `\bstands?\b` reproduz o `grep -riwEc "stands?"` da AC7 — o limite de palavra é
 * obrigatório, senão "standard" contamina a contagem.
 *
 * Decisão registrada (AC7): a palavra "stand" fica BANIDA dos prompts. A Trifold não
 * tem stand; os decorados ficam na sede. Critério de zero limpo, sem allowlist e sem
 * julgamento de contexto — allowlist é onde este tipo de teste morre.
 */
const OBRA_COMO_LOCAL_DE_VISITA: Array<{
  id: string
  re: RegExp
  /**
   * Se `true`, uma linha que NEGA o padrão não conta como contradição.
   * MEDIDO, não teorizado: hoje 100% dos hits de "endereço do empreendimento/obra"
   * — nos 2 lados e inclusive na seção não-sobrescrevível (`index.ts:83` e `:96`) —
   * são o GUARDRAIL que corrige o problema ("NUNCA diga que o decorado fica no
   * endereco do empreendimento"). Sem esta regra, o teste mandaria apagar a própria
   * régua, e a resposta seria uma allowlist de frases — que apodrece na primeira
   * reescrita. A regra é de CLASSE (contexto de negação), não lista de exceções.
   */
  negacaoNeutraliza: boolean
  porque: string
}> = [
  {
    id: "stand",
    re: /\bstands?\b/i,
    // Absoluto de propósito (AC7): a palavra fica BANIDA, mesmo negada. A Trifold não
    // tem stand — citá-la, ainda que para negar, reintroduz o conceito no vocabulário
    // do modelo. Zero limpo, sem julgamento de contexto.
    negacaoNeutraliza: false,
    porque:
      "A Trifold não tem stand — todos os decorados ficam na SEDE (prompts/index.ts:83). Palavra banida dos prompts (AC7).",
  },
  {
    id: "endereco-do-empreendimento",
    re: /endere[çc]o d[oa]s? (empreendimento|obra)/i,
    negacaoNeutraliza: true,
    porque:
      "O endereço da obra não é onde o lead visita — é a frase-molde que originou o incidente da Sandra.",
  },
  {
    id: "no-local-da-obra",
    re: /no local da obra/i,
    negacaoNeutraliza: true,
    porque: "Mesma classe: propõe a obra como local de encontro.",
  },
]

/** Marcadores de negação. Declarados aqui, uma vez, e não por frase. */
const NEGADORES = /\b(nunca|jamais|n[ãa]o|proibid[oa]|evite)\b/i

type Fonte = { nome: string; texto: string }

type Achado = { fonte: string; linha: number; padrao: string; trecho: string; porque: string }

function acharContradicoes(fontes: Fonte[]): Achado[] {
  const achados: Achado[] = []
  for (const fonte of fontes) {
    const linhas = fonte.texto.split("\n")
    for (let i = 0; i < linhas.length; i++) {
      for (const padrao of OBRA_COMO_LOCAL_DE_VISITA) {
        if (!padrao.re.test(linhas[i])) continue
        if (padrao.negacaoNeutraliza && NEGADORES.test(linhas[i])) continue
        achados.push({
          fonte: fonte.nome,
          linha: i + 1,
          padrao: padrao.id,
          trecho: linhas[i].trim().slice(0, 140),
          porque: padrao.porque,
        })
      }
    }
  }
  return achados
}

/** Linhas que casaram um padrão mas foram neutralizadas pela negação — visíveis, não silenciosas. */
function neutralizadasPorNegacao(fontes: Fonte[]): number {
  let total = 0
  for (const fonte of fontes) {
    for (const linha of fonte.texto.split("\n")) {
      for (const padrao of OBRA_COMO_LOCAL_DE_VISITA) {
        if (padrao.negacaoNeutraliza && padrao.re.test(linha) && NEGADORES.test(linha)) total += 1
      }
    }
  }
  return total
}

function relatorio(achados: Achado[]): string {
  if (achados.length === 0) return "nenhum"
  const porFonte = new Map<string, number>()
  for (const a of achados) porFonte.set(a.fonte, (porFonte.get(a.fonte) ?? 0) + 1)
  return [
    `${achados.length} ocorrência(s) de "obra como local de visita":`,
    ...[...porFonte.entries()].map(([f, n]) => `  · ${f}: ${n}`),
    "",
    ...achados.map((a) => `  ${a.fonte}:${a.linha} [${a.padrao}] ${a.trecho}\n      → ${a.porque}`),
  ].join("\n")
}

/** As constantes do código — o fallback de bootstrap. Comentário JSDoc não entra: só o texto do prompt. */
const CONSTANTES_DO_CODIGO: Fonte[] = [
  { nome: "código: PERSONALITY_PROMPT", texto: PERSONALITY_PROMPT },
  { nome: "código: GUARDRAILS_PROMPT", texto: GUARDRAILS_PROMPT },
  { nome: "código: QUALIFICATION_PROMPT", texto: QUALIFICATION_PROMPT },
  { nome: "código: PROPERTY_PRESENTATION_PROMPT", texto: PROPERTY_PRESENTATION_PROMPT },
  { nome: "código: VISIT_SCHEDULING_PROMPT", texto: VISIT_SCHEDULING_PROMPT },
  { nome: "código: HANDOFF_SUMMARY_PROMPT", texto: HANDOFF_SUMMARY_PROMPT },
  { nome: "código: OFF_HOURS_PROMPT", texto: OFF_HOURS_PROMPT },
]

function snapshotComoFontes(): Fonte[] {
  return Object.entries(loadProductionSnapshot()).map(([slug, texto]) => ({
    nome: `_production/${slug}.txt`,
    texto,
  }))
}

describe("contradição sede × stand (Story 87-0, Tarefa 4)", () => {
  it("a régua existe: a seção não-sobrescrevível manda usar a SEDE", () => {
    // Se esta asserção cair, não há contradição a medir — há um buraco de segurança.
    const texto = buildSystemPrompt()[0].text
    expect(texto).toContain("ENDERECO DA SEDE TRIFOLD")
    expect(texto).toContain(SEDE_ADDRESS)
    expect(texto).toContain("Todos os decorados ficam na SEDE")
    expect(texto).toContain("O endereco dos empreendimentos (obras) NAO e onde o lead visita")
  })

  it("o snapshot de produção existe e cobre os 7 slugs (senão este teste não mede nada)", () => {
    const fontes = snapshotComoFontes()
    expect(fontes.length).toBeGreaterThanOrEqual(7)
  })

  // [DÍVIDA QUITADA em 2026-08-11 — Story 87-1] Era `debtCase`. Passou a `it` porque o
  // snapshot regravado de produção não tem mais nenhuma ocorrência. Daqui em diante isto
  // é guarda de REGRESSÃO: se alguém reintroduzir "stand" pelo painel, fica vermelho.
  it("nenhum override de produção propõe a obra/stand como local de visita", () => {
    const achados = acharContradicoes(snapshotComoFontes())
    expect(achados, relatorio(achados)).toEqual([])
  })

  debtCase(
    "[DÍVIDA — Tarefa 2] nenhuma constante de fallback propõe a obra/stand como local de visita",
    () => {
      const achados = acharContradicoes(CONSTANTES_DO_CODIGO)
      expect(achados, relatorio(achados)).toEqual([])
    }
  )

  it("inventário da dívida: onde a contradição está HOJE (medido, não suposto)", () => {
    // Este teste é VERDE de propósito. Ele fotografa o estado atual para que a
    // reconciliação (Tarefa 2) tenha alvo explícito e para que nenhuma ocorrência
    // NOVA entre sem alguém editar esta lista à mão.
    const porFonte = (fontes: Fonte[]) => {
      const mapa: Record<string, number> = {}
      for (const f of fontes) mapa[f.nome] = 0
      for (const a of acharContradicoes(fontes)) mapa[a.fonte] += 1
      return Object.fromEntries(Object.entries(mapa).filter(([, n]) => n > 0))
    }

    // 2026-08-11 (Story 87-1): era `{ guardrails: 2, property-presentation: 1,
    // system-personality: 1 }`. Zerou quando o snapshot passou a descrever a produção
    // reconciliada. Lado do banco: LIMPO.
    expect(porFonte(snapshotComoFontes())).toEqual({})

    // O `visit-scheduling` foi reconciliado em 05/08 e é o MODELO — 0 ocorrências.
    // Se ele aparecer aqui, houve regressão (Risco 2 da story).
    expect(porFonte(snapshotComoFontes())["_production/visit-scheduling.txt"]).toBeUndefined()

    // Lado do código: INALTERADO. É o fallback de bootstrap, e só é lido quando não há
    // linha ativa com conteúdo em agent_prompts (`prompts/index.ts:84-88`).
    expect(porFonte(CONSTANTES_DO_CODIGO)).toEqual({
      // guardrails.ts:23 ("o memorial fica disponivel la no stand de vendas") e :88.
      "código: GUARDRAILS_PROMPT": 2,
    })
  })

  it("a regra de negação está neutralizando exatamente os guardrails corretivos (e nada mais)", () => {
    // Se este número subir sem alguém saber por quê, a regra de negação virou tapete.
    // Hoje: snapshot = guardrails.txt linhas 46 e 48 + property-presentation.txt:36
    //                  ("NUNCA passe o endereco da obra para visita...", acrescentada pela
    //                  reconciliação de 06/08 — por isso 3, e não os 2 de 05/08);
    //       código   = guardrails.ts (2 linhas) + property-presentation.ts (a mesma frase).
    expect(neutralizadasPorNegacao(snapshotComoFontes())).toBe(3)
    expect(neutralizadasPorNegacao(CONSTANTES_DO_CODIGO)).toBe(3)
  })
})
