/**
 * Story 900-23 · AC10.3 — **catraca** do último UUID fixo da Trifold no código.
 *
 * ## Por que catraca, e não medição
 *
 * A R11 desta story pede os `grep -c` colados no Dev Agent Record. Isso mede **hoje** e não impede
 * o **próximo** UUID: o padrão que gerou o `DEFAULT_ORG_ID` duplicado em três rotas foi
 * exatamente "cada um copiou o literal do vizinho", e nenhum grep de uma vez só teria acendido.
 * Aqui o conjunto de arquivos que podem conter o literal é **declarado**, com uma linha de
 * justificativa cada. Arquivo novo com o UUID reprova o teste, nomeando o arquivo.
 *
 * Mesma forma de `scripts/admin-client-allowlist.test.ts` (Story 900-21b): varre a árvore de
 * verdade e compara com um conjunto escrito à mão — nunca derivado do que a varredura encontrou,
 * que seria o teste concordando consigo mesmo.
 *
 * ## Como sair daqui
 *
 * Ver o cabeçalho de `trifold-org.ts`: o marcador morre quando o Telegram tiver destino por org
 * (`org_integrations`, `provider = 'telegram'`) e `DAILY_REPORT_RECIPIENTS` for aposentada. O dia
 * em que os dois conjuntos abaixo puderem ficar vazios, este arquivo pode ser apagado.
 */
import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join, relative } from "node:path"

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const RAIZ_WEB = join(SRC, "..")

/** O literal vigiado. É o `organizations.id` da Trifold Engenharia. */
const LITERAL = "00000000-0000-0000-0000-000000000001"

/**
 * Arquivos de **implementação** autorizados a conter o literal. Dois, e a justificativa de cada um
 * diz por que ele não pode simplesmente importar `trifoldOrgId()`.
 */
const IMPLEMENTACAO_AUTORIZADA: Record<string, string> = {
  "src/lib/tenancy/trifold-org.ts":
    "a ÚNICA declaração do literal — exceção nomeada, com sucessor declarado no cabeçalho do módulo",
  "src/app/api/cron/nicole-health/route.ts":
    "PLATFORM_ALERT_ORG_ID: canal de ENTREGA do alerta de plataforma (de quem é o whatsapp_config " +
    "que envia), não o org do incidente — semântica diferente da de trifoldOrgId(), por isso não " +
    "compartilha a constante (AC3 da 900-23)",
}

/**
 * Arquivos de **teste** autorizados. Ficam declarados pela mesma razão: um fixture que copia o
 * UUID é como a duplicação começa, e a próxima cópia costuma ser em código de produção.
 */
const TESTES_AUTORIZADOS: Record<string, string> = {
  "src/lib/tenancy/trifold-org-literal.test.ts": "este arquivo — o literal É o padrão vigiado",
  "src/lib/tenancy/trifold-org.test.ts": "carrasco do valor devolvido por trifoldOrgId()",
  "src/app/api/cron/daily-report/route.test.ts":
    "fixture: identifica qual das orgs ativas é a Trifold, para provar o escopo de DAILY_REPORT_RECIPIENTS",
  "src/app/api/cron/nicole-agenda-reconcile/route.test.ts":
    "fixture: identifica a Trifold, para provar que o Telegram só recebe dado dela (C5)",
  "src/app/api/cron/analytics-report/route.test.ts": "fixture de org, pré-existente (Story 75-x)",
  "src/app/api/properties/nicole-enabled.test.ts": "fixture de org, pré-existente",
}

const IGNORAR = new Set(["node_modules", ".next", "__snapshots__"])

function varrer(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (IGNORAR.has(nome)) continue
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) {
      varrer(caminho, saida)
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(nome)) {
      saida.push(caminho)
    }
  }
  return saida
}

const arquivosComLiteral = varrer(SRC)
  .filter((c) => readFileSync(c, "utf-8").includes(LITERAL))
  .map((c) => relative(RAIZ_WEB, c).split("\\").join("/"))
  .sort()

const ehTeste = (c: string) => /\.test\.tsx?$/.test(c)

describe("catraca do literal da Trifold (AC10.3)", () => {
  it("a varredura enxerga a árvore de verdade — vivacidade, antes de acreditar em qualquer lista", () => {
    // Sem isto, "o conjunto bate" seria indistinguível de "a varredura leu zero arquivos".
    expect(varrer(SRC).length).toBeGreaterThan(100)
    expect(arquivosComLiteral.length).toBeGreaterThan(0)
  })

  it("o literal aparece em EXATAMENTE os arquivos de implementação declarados", () => {
    const encontrados = arquivosComLiteral.filter((c) => !ehTeste(c))
    const declarados = Object.keys(IMPLEMENTACAO_AUTORIZADA).sort()

    const naoDeclarados = encontrados.filter((c) => !(c in IMPLEMENTACAO_AUTORIZADA))
    expect(
      naoDeclarados,
      `arquivo de implementação com o UUID da Trifold fora do conjunto declarado — importe ` +
        `trifoldOrgId() de @web/lib/tenancy/trifold-org, ou declare a exceção aqui com justificativa`,
    ).toEqual([])

    const declaradosSemUso = declarados.filter((c) => !encontrados.includes(c))
    expect(
      declaradosSemUso,
      "exceção declarada que não existe mais no código — remova a linha em vez de deixá-la apodrecer",
    ).toEqual([])

    expect(encontrados).toEqual(declarados)
  })

  it("o literal aparece em EXATAMENTE os arquivos de teste declarados", () => {
    const encontrados = arquivosComLiteral.filter(ehTeste)
    expect(encontrados.filter((c) => !(c in TESTES_AUTORIZADOS))).toEqual([])
    expect(Object.keys(TESTES_AUTORIZADOS).filter((c) => !encontrados.includes(c))).toEqual([])
  })

  it("toda entrada declarada tem justificativa não vazia", () => {
    const vazias = [
      ...Object.entries(IMPLEMENTACAO_AUTORIZADA),
      ...Object.entries(TESTES_AUTORIZADOS),
    ]
      .filter(([, motivo]) => motivo.trim().length < 20)
      .map(([caminho]) => caminho)
    expect(vazias).toEqual([])
  })
})
