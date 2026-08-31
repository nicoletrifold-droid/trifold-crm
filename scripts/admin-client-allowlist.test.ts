/**
 * Story 900-21b · AC1 — as duas réguas da allowlist de admin-client.
 *
 * ## Por que DUAS, e por que nenhuma sozinha basta
 *
 * 1. `validarAllowlist` (Vitest puro) vigia a **forma da justificativa** do JSON: caminho em duas
 *    seções, `itera-orgs` sem o `arquivo:linha` do loop, alvo da Onda 2 com prazo vencido ou sem
 *    prazo nenhum, seção esvaziada/grafada errada.
 * 2. O **ESLint de verdade**, por AST, num subprocesso, vigia a **completude**: um
 *    `createAdminClient()` novo fora da allowlist. Isso a régua de forma não vê, por construção.
 *
 * ## Por que o ESLint roda aqui dentro e não como comando na Task (correção R1 do parecer @po)
 *
 * Medido antes desta story, com os 4 warnings do baseline presentes:
 *
 *     $ cd packages/web && npx eslint src   →   exit=0     ← o CI passaria VERDE
 *
 * A severidade da regra é `warn` (deliberado desde a 900-14, senão 240 caminhos travariam o
 * repo), e `eslint` só sai não-zero em `error`. Logo "rode `npx eslint src` e confira" é uma
 * conferência a olho, não uma catraca: os 51 arquivos que a correção B1 salvou poderiam perder a
 * isenção de novo sem nada acender. `--max-warnings 0` também não serve — são 35 warnings em
 * `src` e só 4 são desta regra (24 `no-unused-vars`, 4 `no-img-element`, ...). O que tem dentes é
 * `pnpm test`: aqui, filtrando a saída JSON por `ruleId`.
 *
 * ## A régua do ESLint tem célula de vivacidade dos DOIS lados
 *
 * "Zero ocorrências" é indistinguível de "o ESLint não rodou", de "a regra não está registrada" e
 * de "a allowlist isentou o repo inteiro". Por isso, antes de acreditar no zero, o teste prova por
 * `--stdin-filename` que o mesmo comando **acende** para um caminho fora da allowlist e **cala**
 * para um que está nela — e confere que a varredura de `src` analisou centenas de arquivos, não
 * uma lista vazia.
 */

import { describe, it, expect } from "vitest"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

import { validarAllowlist, MINIMOS } from "./lib/allowlist-lint"
import { PERMITIDOS } from "../packages/web/eslint-rules/no-unscoped-admin-client.mjs"

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..")
const WEB = join(RAIZ, "packages", "web")
const CAMINHO_JSON = join(RAIZ, "docs", "audits", "admin-client-allowlist.json")

const allowlist = JSON.parse(readFileSync(CAMINHO_JSON, "utf-8"))

/**
 * Total re-triado em 2026-08-29 (Story 900-21b), re-medido pela Story 900-23 (**242 → 239**) e
 * pela Story 900-24 (**239 → 240**).
 * −4 (`daily-report` e `nicole-agenda-reconcile`, mais os dois `.test.ts`, deixaram de chamar
 * `createAdminClient()` — usam o `db` escopado que `forEachActiveOrg` injeta) +1
 * (`lib/tenancy/for-each-org.ts`, o próprio mecanismo) +1 (`lib/tenancy/webhook-org.ts`, a
 * 900-24: `logOrgUnresolved` grava `webhook_logs`/`system_events` com `org_id NULL` porque, por
 * definição, não há org conhecida no momento em que ele roda).
 *
 * **Literal de propósito**: se este número saísse do próprio JSON, o teste montaria o esperado a
 * partir da fonte que ele vigia e nunca reprovaria a fonte. Mexer na allowlist e ter que mexer
 * aqui é o custo — e é o ponto: a mudança aparece em diff, com dono.
 *
 * Re-medido pela Story 900-51 (**240 → 242**): +2 em `plataforma`, as duas rotas de escrita/reveal
 * de `/platform/orgs/[id]/integracoes`. As rotas do CLIENTE (`app/api/configuracoes/integracoes/**`)
 * NÃO entram — elas usam o client RLS-scoped e as RPCs `_as_org`, e é esta régua que transforma
 * essa afirmação da AC8 em catraca em vez de promessa.
 */
const TOTAL_ESPERADO = 242

const REGRA = "aios/no-unscoped-admin-client"

interface ArquivoLintado {
  filePath: string
  messages: Array<{ ruleId: string | null; line: number }>
}

/** Roda o ESLint de verdade e devolve o relatório completo (não só os hits). */
function rodarEslint(args: string[], stdin?: string): ArquivoLintado[] {
  let saida: string
  try {
    saida = execFileSync("npx", ["eslint", ...args, "--format=json"], {
      cwd: WEB,
      input: stdin,
      maxBuffer: 64 * 1024 * 1024,
      encoding: "utf-8",
    })
  } catch (e) {
    // `eslint` sai não-zero quando há `error`; o relatório JSON continua no stdout.
    const err = e as { stdout?: string; message?: string }
    if (!err.stdout) throw e
    saida = err.stdout
  }
  return JSON.parse(saida) as ArquivoLintado[]
}

function ocorrenciasDaRegra(relatorio: ArquivoLintado[]): string[] {
  return relatorio.flatMap((f) =>
    f.messages
      .filter((m) => m.ruleId === REGRA)
      .map((m) => `${f.filePath.split("/packages/web/")[1] ?? f.filePath}:${m.line}`),
  )
}

const FONTE_COM_ADMIN_CLIENT =
  'import { createAdminClient } from "@web/lib/supabase/admin"\nexport const x = () => createAdminClient()\n'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Regra de forma — `validarAllowlist`
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** A allowlist é um JSON heterogêneo (4 mapas + 1 array), então o tipo útil aqui é o mais frouxo. */
type Allowlist = Record<string, unknown>

/** Atalho para deformar uma seção sem repetir cast em cada teste. */
function sec(j: Allowlist, nome: string): Record<string, unknown> {
  return j[nome] as Record<string, unknown>
}

/** Fixture mínima e VÁLIDA, com as contagens mínimas satisfeitas. Cada teste a deforma num ponto. */
function fixtureValida(): Allowlist {
  const encher = (prefixo: string, n: number, motivo: (i: number) => string) =>
    Object.fromEntries(Array.from({ length: n }, (_, i) => [`src/${prefixo}/f${i}.ts`, motivo(i)]))

  return {
    plataforma: encher("plataforma", MINIMOS.plataforma, () => "cross-org de plataforma"),
    "itera-orgs": encher("itera", MINIMOS["itera-orgs"], (i) => `itera de fato (arquivo.ts:${i + 10})`),
    "alvos-onda-2": Object.fromEntries(
      Array.from({ length: MINIMOS["alvos-onda-2"] }, (_, i) => [
        `src/alvo/f${i}.ts`,
        { motivo: "travado", alvosExpiramEm: "2099-12-31" },
      ]),
    ),
    legitimos: encher("legit", MINIMOS.legitimos, () => "webhook: resolve a org pelo payload"),
    legado: [] as string[],
  }
}

describe("validarAllowlist — controle de vivacidade da própria fixture", () => {
  it("a fixture base, sem deformação, passa limpa (senão as mutações abaixo não provam nada)", () => {
    expect(validarAllowlist(fixtureValida())).toEqual([])
  })
})

describe("validarAllowlist — Regra 0 (vivacidade das seções)", () => {
  it("seção grafada errada (`iteraOrgs`) acende, em vez de devolver [] em silêncio", () => {
    const j = fixtureValida()
    j.iteraOrgs = j["itera-orgs"]
    delete j["itera-orgs"]

    const v = validarAllowlist(j)
    // Sem a Regra 0 isto seria `[]`: as Regras 1-3 iterariam zero entradas e aprovariam o vazio.
    expect(v.length).toBeGreaterThanOrEqual(1)
    expect(v.some((x) => x.regra === 0 && x.secao === "itera-orgs" && /ausente/.test(x.mensagem))).toBe(true)
  })

  it("seção esvaziada acende", () => {
    const j = fixtureValida()
    j["alvos-onda-2"] = {}
    const v = validarAllowlist(j)
    expect(v.some((x) => x.regra === 0 && x.secao === "alvos-onda-2" && /vazia/.test(x.mensagem))).toBe(true)
  })

  it("seção abaixo do mínimo re-triado acende, nomeando a contagem", () => {
    const j = fixtureValida()
    delete sec(j, "plataforma")["src/plataforma/f0.ts"]
    const v = validarAllowlist(j)
    // Literais, não derivados de `MINIMOS`: uma asserção montada a partir da constante que ela
    // vigia nunca reprovaria a constante. 17 é o piso re-medido pela 900-23 (era 16).
    expect(v.some((x) => x.regra === 0 && x.secao === "plataforma" && /16 entradas.*mínimo.*17/.test(x.mensagem))).toBe(true)
  })
})

describe("validarAllowlist — Regra 1 (caminho em duas seções)", () => {
  it("`analytics-report/route.ts` em `plataforma` E em `itera-orgs` produz 1 violação nomeando as duas", () => {
    const j = fixtureValida()
    const duplicado = "src/app/api/cron/analytics-report/route.ts"
    sec(j, "plataforma")[duplicado] = "cross-org de plataforma"
    sec(j, "itera-orgs")[duplicado] = "itera de fato (analytics-report/route.ts:117)"

    const v = validarAllowlist(j).filter((x) => x.regra === 1)
    expect(v).toHaveLength(1)
    expect(v[0]!.caminho).toBe(duplicado)
    expect(v[0]!.mensagem).toContain("plataforma")
    expect(v[0]!.mensagem).toContain("itera-orgs")
  })
})

describe("validarAllowlist — Regra 2 (`itera-orgs` sem `:linha`)", () => {
  it("motivo sem `:` seguido de dígito produz 1 violação nomeando o caminho", () => {
    const j = fixtureValida()
    sec(j, "itera-orgs")["src/itera/f0.ts"] = "itera todas as orgs por desenho"

    const v = validarAllowlist(j).filter((x) => x.regra === 2)
    expect(v).toHaveLength(1)
    expect(v[0]!.caminho).toBe("src/itera/f0.ts")
  })

  it("`:70-71` (intervalo) é aceito — o que se exige é dígito depois de `:`", () => {
    const j = fixtureValida()
    sec(j, "itera-orgs")["src/itera/f0.ts"] = "itera de fato (bolsao-rebalance/route.ts:70-71)"
    expect(validarAllowlist(j).filter((x) => x.regra === 2)).toEqual([])
  })
})

describe("validarAllowlist — Regra 3 (prazo de `alvos-onda-2`)", () => {
  it("prazo vencido produz 1 violação nomeando o arquivo E o prazo", () => {
    const j = fixtureValida()
    sec(j, "alvos-onda-2")["src/alvo/f0.ts"] = { motivo: "travado", alvosExpiramEm: "2020-01-01" }

    const v = validarAllowlist(j).filter((x) => x.regra === 3)
    expect(v).toHaveLength(1)
    expect(v[0]!.caminho).toBe("src/alvo/f0.ts")
    expect(v[0]!.mensagem).toContain("2020-01-01")
  })

  it("entrada SEM `alvosExpiramEm` acende — a régua itera entradas, não campos", () => {
    // Ressalva do parecer @po (v2): redigida sobre o campo, a regra deixaria uma 13ª entrada
    // entrar sem prazo e nunca vencer — isenção com prazo virando permanente pela porta dos fundos.
    const j = fixtureValida()
    sec(j, "alvos-onda-2")["src/alvo/f0.ts"] = { motivo: "travado" }

    const v = validarAllowlist(j).filter((x) => x.regra === 3)
    expect(v).toHaveLength(1)
    expect(v[0]!.caminho).toBe("src/alvo/f0.ts")
    expect(v[0]!.mensagem).toContain("alvosExpiramEm")
  })

  it("prazo exatamente hoje NÃO vence (o vencimento é no dia seguinte)", () => {
    const hoje = new Date(2026, 8, 30) // 2026-09-30, local
    const j = fixtureValida()
    sec(j, "alvos-onda-2")["src/alvo/f0.ts"] = { motivo: "travado", alvosExpiramEm: "2026-09-30" }
    expect(validarAllowlist(j, hoje).filter((x) => x.regra === 3)).toEqual([])

    const amanha = new Date(2026, 9, 1) // 2026-10-01
    expect(validarAllowlist(j, amanha).filter((x) => x.regra === 3).length).toBeGreaterThanOrEqual(1)
  })
})

describe("validarAllowlist — controle positivo: o arquivo REAL", () => {
  it("`docs/audits/admin-client-allowlist.json` não tem violação nenhuma", () => {
    // Sem este caso, as mutações acima provariam algo sobre a função e nada sobre o arquivo.
    expect(validarAllowlist(allowlist)).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Ponte JSON ↔ runtime de lint
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("ponte entre o JSON e o `PERMITIDOS` da regra ESLint", () => {
  it("a união das 4 seções + `legado` soma 240", () => {
    const uniao = new Set([
      ...Object.keys(allowlist.plataforma),
      ...Object.keys(allowlist["itera-orgs"]),
      ...Object.keys(allowlist["alvos-onda-2"]),
      ...Object.keys(allowlist.legitimos),
      ...allowlist.legado,
    ])
    expect(uniao.size).toBe(TOTAL_ESPERADO)
  })

  it("`PERMITIDOS` da regra ESLint tem exatamente as mesmas 240 entradas", () => {
    // Antes desta story `PERMITIDOS` lia só `legitimos` + `legado`: seriam 190 aqui, e 51 arquivos
    // teriam perdido a isenção em silêncio (correção B1). É esta asserção que fixa isso.
    expect(PERMITIDOS.size).toBe(TOTAL_ESPERADO)

    const doJson = new Set([
      ...Object.keys(allowlist.plataforma),
      ...Object.keys(allowlist["itera-orgs"]),
      ...Object.keys(allowlist["alvos-onda-2"]),
      ...Object.keys(allowlist.legitimos),
      ...allowlist.legado,
    ])
    expect([...doJson].filter((k) => !PERMITIDOS.has(k))).toEqual([])
    expect([...PERMITIDOS].filter((k) => !doJson.has(k as string))).toEqual([])
  })

  /**
   * Story 900-24 · AC2 — o mecanismo de resolução de org do webhook está isento POR NOME.
   *
   * Deliberadamente **sem** contagem: a 900-23 e a 900-24 mexem nesta allowlist em paralelo, e um
   * total hardcoded numa asserção nova falharia por causa da OUTRA story em vez do próprio
   * conteúdo. `TOTAL_ESPERADO` acima já cobre o eixo "a lista inteira mudou e ninguém viu"; esta
   * cobre o eixo "a entrada da 900-24 sumiu num merge do JSON e o warning voltou em silêncio" —
   * que é o modo pior do conflito textual que o @po mediu entre as duas branches.
   */
  it("900-24: `src/lib/tenancy/webhook-org.ts` está em `legitimos` e chega ao `PERMITIDOS`", () => {
    const caminho = "src/lib/tenancy/webhook-org.ts"
    expect(Object.keys(allowlist.legitimos)).toContain(caminho)
    expect(allowlist.legitimos[caminho]).toContain("900-24")
    expect(PERMITIDOS.has(caminho)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Catraca de completude — o ESLint de verdade (correção R1)
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("catraca do ESLint por AST", () => {
  it(
    "acende para caminho FORA da allowlist e cala para caminho DENTRO — célula de vivacidade dos dois lados",
    () => {
      const fora = ocorrenciasDaRegra(
        rodarEslint(["--stdin", "--stdin-filename", "src/app/api/cron/__vivacidade_900_21b__/route.ts"], FONTE_COM_ADMIN_CLIENT),
      )
      expect(fora.length).toBeGreaterThanOrEqual(1)

      // `analytics-report/route.ts` é o arquivo que o parecer @po usou para medir a B1: com a
      // regra lendo só `legitimos`+`legado`, ele acendia 2 warnings depois da re-triagem.
      const dentro = ocorrenciasDaRegra(
        rodarEslint(["--stdin", "--stdin-filename", "src/app/api/cron/analytics-report/route.ts"], FONTE_COM_ADMIN_CLIENT),
      )
      expect(dentro).toEqual([])
    },
    180_000,
  )

  it(
    "`eslint src` inteiro não acusa nenhum `createAdminClient()` fora da allowlist",
    () => {
      const relatorio = rodarEslint(["src"])

      // Vivacidade da varredura: "0 ocorrências" sobre 0 arquivos analisados é verde por vacuidade.
      expect(relatorio.length).toBeGreaterThan(100)

      const hits = ocorrenciasDaRegra(relatorio)
      expect(hits).toEqual([])
    },
    180_000,
  )
})
