/**
 * Story 900-67 — carrasco da decisão de marca do cabeçalho do e-mail.
 *
 * Três blocos, três coisas diferentes:
 *
 * 1. **A função pura** (AC1/AC8) — `isMarcaTrifold` só é `true` para a Trifold real.
 * 2. **O cabeçalho renderizado** (AC8) — com a org da Trifold a saída é **byte a byte** a de
 *    hoje; com qualquer outra, incluindo a `"Trifold Sandbox"` que a Story 900-25 vai criar,
 *    nunca mais aparece o `<img>` da Trifold.
 * 3. **O ALCANCE** (AC11) — todo call site de `renderBaseLayout`/`renderPasswordActionEmail` no
 *    repositório passa `orgId`, com UMA exceção declarada. Sem este bloco, um call site novo
 *    nasceria sem `orgId`, perderia a logo em silêncio, e nada ficaria vermelho.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join, relative } from "node:path"

import { isMarcaTrifold } from "./header-brand"
import { renderHeader } from "./components/header"
import { renderBaseLayout } from "./index"
import { trifoldOrgId } from "@web/lib/tenancy/trifold-org"
import { arquivosDeProducao, codigoDe, ocorrenciasNoCodigo } from "@web/lib/tenancy/fonte-scan"

/**
 * O `<img>` que SÓ a Trifold real pode receber, escrito por extenso.
 *
 * Literal, e não montado a partir de `TRIFOLD_LOGO_URL`/`emailTokens`: uma régua derivada da
 * fonte que ela mesma testa concorda com qualquer valor que a fonte passe a ter. Este é o byte de
 * HOJE, copiado do branch antes da mudança — é contra ELE que a promessa "com a org da Trifold, a
 * saída é byte a byte igual" se mede.
 */
const IMG_TRIFOLD =
  '<img src="https://crm.trifold.eng.br/logo-trifold-email.png" alt="Trifold" width="263" height="28" style="height:28px;width:263px;display:block;border:0;outline:none;text-decoration:none;">'

/** Um `organizations.id` que não é o da Trifold. Não é o literal vigiado (AC9). */
const OUTRA_ORG = "11111111-2222-3333-4444-555555555555"

describe("isMarcaTrifold (AC1)", () => {
  it("é true SOMENTE para o org id da Trifold", () => {
    expect(isMarcaTrifold(trifoldOrgId())).toBe(true)
  })

  it("é false para outra org — o caso que a 900-25 vai criar de verdade", () => {
    expect(isMarcaTrifold(OUTRA_ORG)).toBe(false)
  })

  it("é false para null e para undefined — inverte o `!orgName ⇒ Trifold` de hoje", () => {
    // Não sei de quem é o e-mail ⇒ saída neutra (texto), nunca a marca do primeiro cliente.
    expect(isMarcaTrifold(null)).toBe(false)
    expect(isMarcaTrifold(undefined)).toBe(false)
  })

  it("não decide por NOME: o nome que casava o regex antigo não muda nada", () => {
    // O regex morto era `/trifold/i.test(orgName)`. A função nem recebe nome — este `it` prova
    // que nenhum texto reabre a porta, medindo os dois lados: o nome que casava com uma org
    // errada continua `false`, e a Trifold real continua `true` com um nome que não casa.
    expect(isMarcaTrifold("Trifold Sandbox")).toBe(false)
    expect(isMarcaTrifold("trifold")).toBe(false)
  })
})

describe("renderHeader (AC8)", () => {
  it("com a org da Trifold: a saída é byte a byte a de hoje", () => {
    const html = renderHeader({ orgName: "Trifold", orgId: trifoldOrgId() })
    // String COMPLETA do bloco, não `toContain("Trifold")` — a palavra "Trifold" aparece nos
    // DOIS branches (é o `alt` da imagem e o texto do span), então `toContain` não distingue
    // qual deles renderizou. Este `toBe` distingue.
    expect(html).toBe(
      `<tr>\n  <td style="background-color:#1a1a2e;padding:24px 32px;">\n    ${IMG_TRIFOLD}\n  </td>\n</tr>`,
    )
  })

  it('com "Trifold Sandbox" (Story 900-25): texto, e NUNCA o <img> da Trifold', () => {
    const html = renderHeader({ orgName: "Trifold Sandbox", orgId: OUTRA_ORG })
    expect(html).not.toContain("<img")
    expect(html).toContain("<span")
    expect(html).toContain(">Trifold Sandbox</span>")
    // O nome está nomeado de propósito: é a org que a 900-25 planeja criar e que casaria o
    // regex antigo. O vínculo com o caso real fica registrado no código do teste.
    expect(html).not.toContain(IMG_TRIFOLD)
  })

  it("sem orgId nenhum: texto, não a logo — o oposto do fallback de hoje", () => {
    const html = renderHeader({ orgName: "", orgId: undefined })
    expect(html).not.toContain("<img")
    expect(html).toContain("<span")
  })
})

describe("renderBaseLayout threada o orgId (AC3, AC8)", () => {
  it("com a org da Trifold, o layout inteiro contém o <img> exato", () => {
    const html = renderBaseLayout("<p>Body</p>", { orgName: "Trifold", orgId: trifoldOrgId() })
    expect(html).toContain(IMG_TRIFOLD)
  })

  it("o orgId é a ÚNICA diferença entre os dois layouts — nada mais mudou de forma", () => {
    const daTrifold = renderBaseLayout("<p>Body</p>", { orgName: "Trifold", orgId: trifoldOrgId() })
    const deOutra = renderBaseLayout("<p>Body</p>", { orgName: "Trifold", orgId: OUTRA_ORG })
    const SPAN =
      '<span style="color:#ffffff;font-size:20px;font-weight:700;font-family:Inter, Arial, sans-serif;">Trifold</span>'
    expect(deOutra).toContain(SPAN)
    // Trocar a marca por um rótulo comum tem de igualar os dois documentos: se algo ALÉM do
    // elemento de marca divergisse, este `toBe` acusaria.
    expect(daTrifold.replace(IMG_TRIFOLD, "«MARCA»")).toBe(deOutra.replace(SPAN, "«MARCA»"))
  })

  it("layout SEM orgId não cai mais para a logo da Trifold", () => {
    const html = renderBaseLayout("<p>Body</p>", { orgName: "Trifold" })
    expect(html).not.toContain(IMG_TRIFOLD)
    expect(html).not.toContain("<img")
  })
})

// ---------------------------------------------------------------------------------------------
// AC11 — o carrasco de ALCANCE
// ---------------------------------------------------------------------------------------------

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const RAIZ_WEB = join(SRC, "..")

const MARCADORES = ["renderBaseLayout(", "renderPasswordActionEmail("] as const

/**
 * As DEFINIÇÕES das duas funções. Excluídas por caminho: a chamada que `password-action.ts` faz a
 * `renderBaseLayout` é o repasse interno da AC6, não um call site de aplicação.
 */
const DEFINICOES = new Set([
  "src/lib/email-layout/index.ts",
  "src/lib/email-layout/components/password-action.ts",
])

/** A exceção da AC7, por extenso. Um elemento, nomeado. */
const EXCECAO_AC7 = "src/lib/auto-vincular-cliente-obra.ts"

/**
 * Os 9 call sites FIADOS e quantos cada arquivo tem. Escrito à mão, nunca derivado da varredura —
 * uma lista montada a partir do que a varredura achou é o teste concordando consigo mesmo.
 *
 * A CONTAGEM importa tanto quanto o nome: um conjunto de nomes fica verde se um segundo call site
 * nascer sem `orgId` dentro de um arquivo que já está na lista por causa do primeiro.
 */
const FIADOS_ESPERADOS: Record<string, number> = {
  "src/app/api/admin/clientes/[id]/senha/route.ts": 1,
  "src/app/api/admin/email-templates/preview/route.ts": 1,
  "src/app/api/brokers/route.ts": 2,
  "src/app/api/cron/appointment-email-reminders/route.ts": 2,
  "src/app/api/users/[id]/reset-password/route.ts": 1,
  "src/app/login/actions.ts": 1,
  "src/lib/tenancy/admin-invite.ts": 1,
}

/**
 * `orgId` como CHAVE do objeto de opções: `orgId: valor`, `orgId,` (atalho) ou `orgId }` (atalho
 * na ÚLTIMA posição, sem vírgula final).
 *
 * O `}` na classe não é decoração: a primeira versão desta régua era `/\borgId\s*[,:]/` e ficou
 * VERDE contra a mutação obrigatória da AC11.5 — `{ orgName: "Portal de Obras", orgId }` em
 * `auto-vincular-cliente-obra.ts` não tem vírgula depois do atalho, e o furo deixava a porta
 * que a AC7 existe para fechar aberta em silêncio. Foi a mutação que achou, não a leitura.
 */
const PASSA_ORG_ID = /\borgId\s*[,:}]/

/**
 * Da abertura do marcador até o parêntese que a FECHA, contando profundidade.
 *
 * Recorte por balanceamento e não "até o fim do arquivo": um `slice` até o EOF engoliria o call
 * site seguinte, e a asserção sobre o primeiro passaria a ser satisfeita pelo segundo. Sem
 * fechamento, devolve `""` — que não casa `PASSA_ORG_ID` e cai na partição SEM `orgId`, onde a
 * asserção de conjunto o acusa pelo nome. Um recorte que falhou nunca vira aprovação.
 */
function regioesDeChamada(codigo: string, marcador: string): string[] {
  const regioes: string[] = []
  for (let de = 0; ; ) {
    const inicio = codigo.indexOf(marcador, de)
    if (inicio < 0) return regioes
    const abre = inicio + marcador.length - 1
    let profundidade = 0
    let fim = -1
    for (let j = abre; j < codigo.length; j++) {
      if (codigo[j] === "(") profundidade++
      else if (codigo[j] === ")" && --profundidade === 0) {
        fim = j
        break
      }
    }
    regioes.push(fim < 0 ? "" : codigo.slice(inicio, fim + 1))
    de = abre + 1
  }
}

interface CallSite {
  arquivo: string
  regiao: string
  marcador: string
}

const arquivosVarridos = arquivosDeProducao(SRC)

const callSites: CallSite[] = []
for (const caminho of arquivosVarridos) {
  const arquivo = relative(RAIZ_WEB, caminho).split("\\").join("/")
  if (DEFINICOES.has(arquivo)) continue
  // `codigoDe` remove os comentários ANTES de qualquer casamento. Obrigatório: a AC7 acabou de
  // plantar, em `auto-vincular-cliente-obra.ts`, um comentário que menciona `orgId` — uma régua
  // de texto cru leria aquele comentário como se o sítio estivesse fiado, e a exceção ficaria
  // invisível justamente no arquivo que ela existe para vigiar.
  const codigo = codigoDe(readFileSync(caminho, "utf-8"))
  for (const marcador of MARCADORES) {
    for (const regiao of regioesDeChamada(codigo, marcador)) {
      callSites.push({ arquivo, regiao, marcador })
    }
  }
}

function contarPor(sites: CallSite[]): Map<string, number> {
  const mapa = new Map<string, number>()
  for (const s of sites) mapa.set(s.arquivo, (mapa.get(s.arquivo) ?? 0) + 1)
  return mapa
}

const comOrgId = contarPor(callSites.filter((s) => PASSA_ORG_ID.test(s.regiao)))
const semOrgId = contarPor(callSites.filter((s) => !PASSA_ORG_ID.test(s.regiao)))
const ordenado = (m: Map<string, number>) => Object.fromEntries([...m].sort())

describe("AC11 — todo call site de e-mail passa orgId, com UMA exceção declarada", () => {
  it("vivacidade: a varredura enxerga a árvore de verdade e acha os 10 call sites", () => {
    // Uma varredura que devolve zero call site por erro de caminho passaria verde contra uma
    // partição vazia. Esta não: o total é afirmado, e é o número medido (4 diretos + 6 via
    // `renderPasswordActionEmail`).
    expect(arquivosVarridos.length).toBeGreaterThan(100)
    expect(callSites.length).toBe(10)
    expect(callSites.every((s) => s.regiao !== "")).toBe(true)
  })

  it("nenhum recorte engoliu o call site vizinho", () => {
    // O `slice` que atravessa o próximo call site é a forma 3 do cabeçalho de `fonte-scan.ts`.
    // Cada região tem de conter exatamente UMA chamada: a sua.
    const engolidas = callSites
      .filter(
        (s) =>
          MARCADORES.reduce((n, m) => n + ocorrenciasNoCodigo(s.regiao, m), 0) !== 1,
      )
      .map((s) => `${s.arquivo} :: ${s.marcador}`)
    expect(engolidas).toEqual([])
  })

  it("a contagem por arquivo bate com uma medida independente do mesmo texto", () => {
    // Segunda medida, por `ocorrenciasNoCodigo` sobre o arquivo inteiro, sem passar pelo
    // balanceamento de parênteses. Se o recorte estivesse errado, as duas discordariam.
    const porRegiao = contarPor(callSites)
    const porOcorrencia = new Map<string, number>()
    for (const caminho of arquivosVarridos) {
      const arquivo = relative(RAIZ_WEB, caminho).split("\\").join("/")
      if (DEFINICOES.has(arquivo)) continue
      const fonte = readFileSync(caminho, "utf-8")
      const n = MARCADORES.reduce((acc, m) => acc + ocorrenciasNoCodigo(fonte, m), 0)
      if (n > 0) porOcorrencia.set(arquivo, n)
    }
    expect(ordenado(porRegiao)).toEqual(ordenado(porOcorrencia))
  })

  it("os call sites SEM orgId são exatamente a exceção da AC7 — nem um a mais", () => {
    // `.toEqual` sobre as chaves ORDENADAS, nunca `.has()`: `.has` fica verde se três call
    // sites novos aparecerem sem `orgId`.
    expect([...semOrgId.keys()].sort()).toEqual([EXCECAO_AC7])
    // Segunda dimensão: a CONTAGEM. Um conjunto de nomes perdoa um segundo call site sem
    // `orgId` dentro do próprio arquivo excepcionado.
    expect(semOrgId.get(EXCECAO_AC7)).toBe(1)
    // A porta que a AC7 fecha: quem "completar" a fiação aqui derruba esta suíte. Threadar o
    // `orgId` real trocaria "Portal de Obras" pela LOGO da Trifold — regressão na própria
    // Trifold, que é o que o programa de whitelabel proíbe.
  })

  it("os 9 call sites fiados são exatamente estes, com estas contagens", () => {
    expect(ordenado(comOrgId)).toEqual(FIADOS_ESPERADOS)
  })
})
