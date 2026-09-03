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
 * A régua PURAMENTE TEXTUAL das rodadas 1–3: `orgId` seguido de `:`, `,` ou `}`.
 *
 * ⚠️ **Não é a régua desta suíte.** Está aqui como CONTROLE POSITIVO dos `it` de furo: cada
 * entrada de ataque é medida também por ela, e o `true` prova que a entrada é mesmo a forma que
 * a régua antiga aprovava — sem isso, um extrator que devolvesse vazio para tudo passaria nos
 * `it` de furo por acidente, e não por medir.
 *
 * A história de por que ela morreu, em três epiciclos, é o motivo de a régua de hoje ser de
 * POSIÇÃO e não de texto:
 *
 * 1. **QA-900-67-1** — medida contra a REGIÃO da chamada, casava `orgId` escondido no argumento
 *    `content`. Conserto: medir só o objeto de opções (`objetoDeOpcoes`).
 * 2. **QA-900-67-5** — medida contra o objeto de opções, casava `orgId` interpolado no VALOR de
 *    uma opção-irmã (``actionLink: `${actionLink}&org=${orgId}` ``), porque o `}` do
 *    fecha-interpolação satisfaz a classe. Conserto de então: apagar o conteúdo dos literais.
 * 3. **QA-900-67-6** — a máscara apaga o CONTEÚDO do literal, e na CONCATENAÇÃO o token mora
 *    FORA dele: `actionLink: actionLink + "&org=" + orgId,` ficava 🟢 20/20 em call site real, e
 *    o mesmo valia para um objeto ANINHADO no valor de uma irmã
 *    (`new URLSearchParams({ orgId: … })`) — que não exige nome nenhum e alcançava **9 dos 9**
 *    sítios fiados.
 *
 * Três consertos de texto, três furos de texto. A pergunta nunca foi "o token `orgId` aparece?",
 * e sim "`orgId` é CHAVE DE TOPO do objeto de opções?". `objetoDeOpcoes` responde essa, extraindo
 * as chaves na mesma passada que equilibra os delimitadores — ver `passaOrgId`.
 */
const REGUA_SO_DE_TEXTO = /\borgId\s*[,:}]/

/**
 * Da abertura do marcador até o parêntese que a FECHA, contando profundidade.
 *
 * Recorte por balanceamento e não "até o fim do arquivo": um `slice` até o EOF engoliria o call
 * site seguinte, e a asserção sobre o primeiro passaria a ser satisfeita pelo segundo. Sem
 * fechamento, devolve `""` — de onde `objetoDeOpcoes` não extrai chave nenhuma, e o sítio cai na
 * partição SEM `orgId`, onde a asserção de conjunto o acusa pelo nome. Um recorte que falhou nunca
 * vira aprovação.
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

/** O que `objetoDeOpcoes` devolve: o recorte cru e as CHAVES DE TOPO desse recorte. */
interface Opcoes {
  /** O objeto de opções como está escrito no arquivo. Serve para ler e para asserção de forma. */
  literal: string
  /**
   * Os nomes que aparecem em POSIÇÃO DE CHAVE no nível de topo desse objeto, na ordem do texto.
   * É a única coisa que a régua consulta — ver `passaOrgId`.
   */
  chaves: string[]
}

/** Extração que não achou objeto de opções. Fail-closed: nenhuma chave. */
const SEM_OPCOES: Opcoes = { literal: "", chaves: [] }

/**
 * 🔴 **A régua.** `orgId` está fiado como CHAVE DE TOPO do objeto de opções?
 *
 * Não é presença de TEXTO — é POSIÇÃO NA PILHA. Foi essa troca de natureza que encerrou três
 * rodadas de epiciclo sobre `REGUA_SO_DE_TEXTO` (ver o histórico lá em cima): interpolação,
 * concatenação e objeto aninhado no valor de uma opção-irmã morrem todos de uma vez, porque
 * nenhum deles põe o nome em posição de chave no topo.
 */
function passaOrgId(opcoes: Opcoes): boolean {
  return opcoes.chaves.includes("orgId")
}

const INICIO_DE_NOME = /[A-Za-z_$]/
const CORPO_DE_NOME = /[\w$]/

/**
 * O ÚLTIMO objeto literal de TOPO da região — o objeto de OPÇÕES — e as chaves de topo DELE.
 *
 * Uma passada só, com pilha de delimitadores e estado de literal de string. A pilha já existia
 * para achar o objeto; marcar a POSIÇÃO de cada nome é o registro que faltava nela.
 *
 * ## O que "de topo" e "posição de chave" significam aqui
 *
 * - **De topo (o objeto)**: só conta o `{` que abre quando a pilha tem apenas o `(` da própria
 *   chamada. Objeto dentro de outro argumento, dentro de outra chamada ou dentro de um `${…}`
 *   nunca é o objeto de opções.
 * - **De topo (a chave)**: só conta o nome lido quando a pilha é exatamente `["(", "{"]` — isto é,
 *   diretamente dentro do objeto de opções, fora de qualquer aninhamento — e em posição de chave:
 *   logo após a abertura do objeto ou após uma `,` daquele nível, com o próximo caractere não
 *   branco sendo `:` (`orgId: valor`), `,` (atalho) ou `}` (atalho na última posição, sem vírgula
 *   final — a forma que a mutação obrigatória da AC11.5 exige, e que a primeira régua desta story
 *   deixou passar).
 *
 * ## Por que POSIÇÃO, e não texto — o furo QA-900-67-6
 *
 * A régua de texto foi consertada três vezes e furou três vezes, sempre um elo adiante. A terceira
 * (`.codigo`, com o conteúdo dos literais apagado) caiu porque **a máscara apaga o conteúdo do
 * literal e na CONCATENAÇÃO o token mora fora dele**. Medido pelo @qa em dois call sites REAIS,
 * `tsc` rc=0 e suíte 20/20 verde nos dois, o e-mail sem logo nos dois:
 *
 * - `src/lib/tenancy/admin-invite.ts:296` — a chave `orgId,` sai e `actionLink,` vira
 *   `actionLink: actionLink + "&org=" + orgId,`.
 * - `src/app/api/users/[id]/reset-password/route.ts` — a chave sai e `actionLink,` vira
 *   `actionLink: actionLink + "&" + new URLSearchParams({ orgId: … }).toString()`. Esta forma
 *   **não exige nome nenhum**: basta aninhar `{ orgId: … }` no valor de qualquer opção-irmã, e os
 *   dois tipos de opção têm irmã `string` inline em **9 dos 9** sítios fiados.
 *
 * Medir posição mata as três formas de uma vez, e **torna a máscara desnecessária** — ela foi
 * removida, não deixada como código órfão: um nome só é lido como chave fora de qualquer literal,
 * porque a mesma pilha que equilibra os delimitadores sabe quando está dentro de um.
 *
 * ## Fail-closed
 *
 * Região sem `(`, região sem o `)` que a fecha, chamada que passa as opções por VARIÁVEL
 * (`renderBaseLayout(corpo, opcoes)`) ou objeto sem nenhuma chave de topo reconhecível devolvem
 * `chaves` vazio — o sítio cai na partição SEM `orgId` e é acusado pelo nome. Uma extração que não
 * achou nunca vira aprovação.
 *
 * ## Limites conhecidos, todos fail-closed (falso alarme visível, nunca verde silencioso)
 *
 * - Chave em forma de literal (`{ "orgId": v }`) ou computada (`{ ["orgId"]: v }`) não é lida como
 *   chave: o sítio seria ACUSADO, não aprovado. Nenhum dos 10 sítios reais usa essas formas, e o
 *   `it` dos 9 fiados acende se algum passar a usar.
 * - `orgId` espalhado por `...` a partir de outro objeto (`{ ...comOrgId }`) também acusa.
 * - Comentário é removido antes, por `codigoDe` (AC11.1) — sem isso, um comentário entre a `,` e a
 *   chave quebraria a leitura da chave seguinte e produziria falso alarme. É o que o `it` da
 *   AC11.1 mede, nos dois sentidos.
 *
 * O resíduo que SOBRA é `orgId: outraCoisa` — chave certa, VALOR errado. Está declarado como
 * dívida BAIXA na Story 900-67: fechá-lo exigiria seguir o valor, e isso não é régua de
 * texto-fonte. A régua mede fiação, não destinatário.
 */
function objetoDeOpcoes(regiao: string, marcador: string): Opcoes {
  const abre = marcador.length - 1
  if (regiao[abre] !== "(") return SEM_OPCOES
  const pilha: string[] = ["("]
  let candidato = -1
  let chavesCandidatas: string[] = []
  /** Estamos num ponto do objeto de topo onde a próxima coisa lida seria uma CHAVE? */
  let esperandoChave = false
  let de = -1
  let ate = -1
  let chaves: string[] = []
  let fechou = false

  for (let i = abre + 1; i < regiao.length; i++) {
    const c = regiao[i]
    const topo = pilha[pilha.length - 1]

    // Dentro de um literal de string: nada aqui é chave, e nada aqui mexe na pilha além do
    // próprio fechamento e do `${…}` do template, que volta a ser código para o balanceamento.
    if (topo === "'" || topo === '"' || topo === "`") {
      if (c === "\\") i++
      else if (c === topo) pilha.pop()
      else if (topo === "`" && c === "$" && regiao[i + 1] === "{") {
        pilha.push("${")
        i++
      }
      continue
    }

    // POSIÇÃO: diretamente dentro do objeto de opções, fora de qualquer aninhamento.
    if (pilha.length === 2 && pilha[1] === "{") {
      if (c === ",") {
        esperandoChave = true
        continue
      }
      if (esperandoChave) {
        // `charAt` e não indexação: sob `noUncheckedIndexedAccess` o índice devolve
        // `string | undefined`, e `undefined` não entra num `RegExp.test`. Fora do texto o
        // `charAt` devolve `""`, que não casa nenhuma das classes — o mesmo fail-closed.
        if (/\s/.test(regiao.charAt(i))) continue
        if (INICIO_DE_NOME.test(regiao.charAt(i))) {
          let j = i + 1
          while (j < regiao.length && CORPO_DE_NOME.test(regiao.charAt(j))) j++
          let k = j
          while (k < regiao.length && /\s/.test(regiao.charAt(k))) k++
          const seguinte = regiao.charAt(k)
          // `:` é `chave: valor`; `,` e `}` são o atalho. Qualquer outra coisa (`(` de método,
          // por exemplo) não é a fiação que a AC4/AC5 pede, e o sítio cai na partição acusada.
          if (seguinte === ":" || seguinte === "," || seguinte === "}") {
            chavesCandidatas.push(regiao.slice(i, j))
          }
          esperandoChave = false
          i = j - 1
          continue
        }
        // `...`, aspas, `[`: não é chave de nome simples. Sai do modo chave e deixa o caractere
        // seguir para o tratamento estrutural abaixo (o `[` precisa entrar na pilha).
        esperandoChave = false
      }
    }

    if (c === "'" || c === '"' || c === "`") {
      pilha.push(c)
      continue
    }

    if (c === "(" || c === "[") {
      pilha.push(c)
      continue
    }

    if (c === "{") {
      if (pilha.length === 1) {
        candidato = i
        chavesCandidatas = []
        esperandoChave = true
      }
      pilha.push("{")
      continue
    }

    if (c === "}" || c === ")" || c === "]") {
      const aberto = pilha.pop()
      if (aberto === "{" && pilha.length === 1 && candidato >= 0) {
        de = candidato
        ate = i
        chaves = chavesCandidatas
        candidato = -1
      }
      // O `)` que zera a pilha é o que fecha a chamada: daí em diante já não é esta região.
      if (pilha.length === 0) {
        fechou = true
        break
      }
    }
  }

  // Sem o `)` da chamada, o que veio antes é um recorte truncado, e um objeto achado nele pode
  // estar aberto no texto real. Fail-closed nos dois campos.
  if (!fechou || de < 0) return SEM_OPCOES
  return { literal: regiao.slice(de, ate + 1), chaves }
}

interface CallSite {
  arquivo: string
  regiao: string
  /** O objeto de opções da região. A régua consulta `.chaves`; `.literal` é só para ler. */
  opcoes: Opcoes
  marcador: string
}

/**
 * Os call sites de UM arquivo, a partir do texto CRU.
 *
 * É função, e não código solto no laço, porque o `codigoDe` que ela aplica é **obrigatório** pela
 * AC11.1 e precisa de carrasco PRÓPRIO: o `it` "comentário DENTRO do objeto de opções não conta
 * como fiação" chama esta função com uma fonte sintética e fica vermelho se o `codigoDe` sair
 * daqui. Antes, a matabilidade daquele filtro dependia de uma linha de PROSA no comentário da AC7
 * em `auto-vincular-cliente-obra.ts` (QA-900-67-3): reescrever aquela prosa devolvia o filtro ao
 * estado decorativo, em silêncio.
 */
function callSitesDe(arquivo: string, fonte: string): CallSite[] {
  const codigo = codigoDe(fonte)
  const sites: CallSite[] = []
  for (const marcador of MARCADORES) {
    for (const regiao of regioesDeChamada(codigo, marcador)) {
      sites.push({ arquivo, regiao, opcoes: objetoDeOpcoes(regiao, marcador), marcador })
    }
  }
  return sites
}

const arquivosVarridos = arquivosDeProducao(SRC)

const callSites: CallSite[] = []
for (const caminho of arquivosVarridos) {
  const arquivo = relative(RAIZ_WEB, caminho).split("\\").join("/")
  if (DEFINICOES.has(arquivo)) continue
  callSites.push(...callSitesDe(arquivo, readFileSync(caminho, "utf-8")))
}

function contarPor(sites: CallSite[]): Map<string, number> {
  const mapa = new Map<string, number>()
  for (const s of sites) mapa.set(s.arquivo, (mapa.get(s.arquivo) ?? 0) + 1)
  return mapa
}

// A partição sai de `passaOrgId` — POSIÇÃO na pilha, nunca casamento de texto. Medir texto contra
// a região (QA-900-67-1), contra o objeto cru (QA-900-67-5) ou contra o objeto mascarado
// (QA-900-67-6) furou três vezes; ver o histórico em `REGUA_SO_DE_TEXTO`.
const comOrgId = contarPor(callSites.filter((s) => passaOrgId(s.opcoes)))
const semOrgId = contarPor(callSites.filter((s) => !passaOrgId(s.opcoes)))
const ordenado = (m: Map<string, number>) => Object.fromEntries([...m].sort())

/**
 * O carrasco do EXTRATOR — QA-900-67-1, -3, -5 e -6.
 *
 * Estes `it` rodam contra entradas SINTÉTICAS, e é de propósito: o corpus real tem 10 call sites
 * todos bem-comportados, e uma régua que só olha o corpus não distingue "o extrator está certo"
 * de "o corpus ainda não produziu a forma errada". Cada forma errada aqui já foi produzida uma
 * vez — pelo @qa, contra o código de verdade — e está reproduzida.
 *
 * **Todo `it` de furo tem controle positivo com `REGUA_SO_DE_TEXTO`**: a mesma entrada, medida
 * pela régua de TEXTO das rodadas 1–3, sai `true`. Sem essa linha, um extrator que devolvesse
 * "nenhuma chave" para tudo passaria em todos eles por acidente, e não por medir.
 *
 * O `it` que ficava aqui antes ("a contagem por arquivo bate com uma medida independente do mesmo
 * texto") foi APAGADO, não consertado: os dois lados contavam ocorrências dos MESMOS marcadores no
 * MESMO `codigoDe`, e `regioesDeChamada` empurra exatamente uma região por ocorrência — dê certo o
 * balanceamento ou não. Não havia entrada capaz de reprová-lo, e o @qa mediu isso trocando o
 * recorte por um `slice` até o EOF: o `it` vizinho ficou vermelho e aquele ficou verde. Guarda que
 * não pode reprovar é pior que guarda ausente, porque conta como cobertura. Quem cobre o recorte
 * é, e sempre foi, o `it` "nenhum recorte engoliu o call site vizinho".
 */
describe("objetoDeOpcoes — a régua mede POSIÇÃO, não texto (QA-900-67-1/5/6)", () => {
  const REND = "renderBaseLayout("

  /**
   * As opções de cada call site de uma fonte SINTÉTICA, pelo caminho COMPLETO:
   * `codigoDe` → `regioesDeChamada` → `objetoDeOpcoes`. É o mesmo caminho que o corpus percorre —
   * nenhum elo é pulado.
   */
  const opcoesDe = (fonte: string) => callSitesDe("sintetico.ts", fonte).map((s) => s.opcoes)

  /** O veredicto da régua de verdade, por call site. */
  const passa = (fonte: string) => opcoesDe(fonte).map(passaOrgId)

  /** O veredicto da régua de TEXTO morta, por call site. Só existe como controle positivo. */
  const passaNoTexto = (fonte: string) =>
    opcoesDe(fonte).map((o) => REGUA_SO_DE_TEXTO.test(o.literal))

  it("recorta o objeto de opções e lê as chaves de TOPO dele", () => {
    const regiao = 'renderBaseLayout("<p>Body</p>", { orgName: "Trifold", orgId: appUser.org_id })'
    const opcoes = objetoDeOpcoes(regiao, REND)
    expect(opcoes.literal).toBe('{ orgName: "Trifold", orgId: appUser.org_id }')
    // As chaves, na ordem do texto — e SÓ elas: nada do VALOR entra nesta lista.
    expect(opcoes.chaves).toEqual(["orgName", "orgId"])
    expect(passaOrgId(opcoes)).toBe(true)
  })

  it("as três formas de escrever a chave contam; o atalho na última posição inclusive", () => {
    // `orgId: valor`, `orgId,` e `orgId }` (sem vírgula final). A terceira é a forma da mutação
    // obrigatória da AC11.5, e foi ela que a primeira régua desta story deixou passar.
    expect(objetoDeOpcoes('renderBaseLayout(c, { a: 1, orgId: x })', REND).chaves).toEqual([
      "a",
      "orgId",
    ])
    expect(objetoDeOpcoes("renderBaseLayout(c, { orgId, a: 1 })", REND).chaves).toEqual([
      "orgId",
      "a",
    ])
    expect(objetoDeOpcoes("renderBaseLayout(c, { a: 1, orgId })", REND).chaves).toEqual([
      "a",
      "orgId",
    ])
  })

  it("🔴 o furo QA-900-67-1: `orgId` escondido no argumento `content` NÃO conta", () => {
    // Forma exata da mutação M5 do @qa, sobre `appointment-email-reminders`: as OPÇÕES perdem o
    // `orgId` (o e-mail perde a logo, em silêncio) e o token reaparece dentro de um comentário
    // HTML no corpo. `tsc` aceita, e contra a REGIÃO isto ficava verde na suíte inteira.
    const regiao =
      'renderBaseLayout(`<p>Olá, ${broker.name}!</p><!--${({ orgId: a.org_id }).orgId ?? ""}-->`, { orgName: "Trifold" })'
    expect(objetoDeOpcoes(regiao, REND).literal).toBe('{ orgName: "Trifold" }')
    expect(objetoDeOpcoes(regiao, REND).chaves).toEqual(["orgName"])
    // Controle positivo, obrigatório: é a MESMA entrada que a régua antiga aprovava, medida
    // contra a região. Sem esta linha, um extrator que devolvesse vazio para tudo passaria aqui.
    expect(REGUA_SO_DE_TEXTO.test(regiao)).toBe(true)
  })

  it("objeto aninhado em OUTRA CHAMADA também não conta — a forma do próximo refactor", () => {
    const regiao = 'renderBaseLayout(montarCorpo({ orgId }), { orgName: "Trifold" })'
    expect(objetoDeOpcoes(regiao, REND).literal).toBe('{ orgName: "Trifold" }')
    expect(objetoDeOpcoes(regiao, REND).chaves).toEqual(["orgName"])
    expect(REGUA_SO_DE_TEXTO.test(regiao)).toBe(true)
  })

  it("fail-closed: opções por VARIÁVEL, ou região truncada, caem na partição acusada", () => {
    // "Não consegui medir" nunca pode virar "está fiado": sem objeto literal de topo o resultado
    // é o par vazio, que não tem chave nenhuma e cai no lado que a asserção de conjunto acusa
    // pelo nome. `toEqual` sobre o par: os DOIS campos têm de sair vazios.
    const VAZIO = { literal: "", chaves: [] }
    expect(objetoDeOpcoes("renderBaseLayout(corpo, opcoes)", REND)).toEqual(VAZIO)
    expect(objetoDeOpcoes("renderBaseLayout(corpo, { orgId }", REND)).toEqual(VAZIO)
    expect(objetoDeOpcoes("", REND)).toEqual(VAZIO)
    expect(passaOrgId(SEM_OPCOES)).toBe(false)
  })

  it("🔴 o furo QA-900-67-5: `orgId` INTERPOLADO no valor de uma opção-irmã não conta", () => {
    // Forma exata da mutação M6 do @qa, sobre `src/lib/tenancy/admin-invite.ts:296`: a CHAVE
    // `orgId,` sai das opções — o convite de admin perde a logo da Trifold em silêncio — e o
    // token reaparece interpolado na URL de uma opção-irmã, que é o que um refactor de
    // rastreamento de org produz sozinho. `tsc` aceita, e contra o objeto CRU isto ficava
    // 19/19 verde.
    const comOrgIdSoNaString = [
      "const { subject, html } = renderPasswordActionEmail({",
      "userName: admin.name ?? nomeDerivado,",
      "actionLink: `${actionLink}&org=${orgId}`,",
      "siteUrl,",
      'mode: "create",',
      "})",
    ].join("\n")
    expect(passa(comOrgIdSoNaString)).toEqual([false])
    // O nome não está na lista de chaves — e as chaves REAIS estão, o que prova que a leitura
    // aconteceu (uma lista vazia passaria no `passa` acima por acidente).
    expect(opcoesDe(comOrgIdSoNaString).map((o) => o.chaves)).toEqual([
      ["userName", "actionLink", "siteUrl", "mode"],
    ])
    // Controle positivo: é a MESMA entrada que a régua de `4bafc03d` aprovava sobre o objeto cru.
    expect(passaNoTexto(comOrgIdSoNaString)).toEqual([true])

    // Falso alarme, o outro sentido: o estado de literal não pode comer a fiação LEGÍTIMA que vem
    // DEPOIS de um literal, nem quando o vizinho é uma crase.
    expect(passa(comOrgIdSoNaString.replace('mode: "create",', "mode: `create`, orgId,"))).toEqual([
      true,
    ])
  })

  it("🔴 o furo QA-900-67-6 (a): `orgId` CONCATENADO no valor de uma opção-irmã não conta", () => {
    // Forma exata da mutação M7 do @qa, sobre `src/lib/tenancy/admin-invite.ts:296`. A máscara de
    // literais da rodada 3 apagava o CONTEÚDO da string; na concatenação o token mora FORA dela,
    // e a régua de texto voltava a casar `orgId,`. Medido em call site real: `tsc` rc=0, convite
    // de admin sem a logo, suíte 20/20 VERDE.
    const comOrgIdConcatenado = [
      "const { subject, html } = renderPasswordActionEmail({",
      "userName: admin.name ?? nomeDerivado,",
      'actionLink: actionLink + "&org=" + orgId,',
      "siteUrl,",
      'mode: "create",',
      "})",
    ].join("\n")
    expect(passa(comOrgIdConcatenado)).toEqual([false])
    expect(opcoesDe(comOrgIdConcatenado).map((o) => o.chaves)).toEqual([
      ["userName", "actionLink", "siteUrl", "mode"],
    ])
    // Controle positivo: a régua de texto — inclusive com o conteúdo dos literais apagado, porque
    // o token está fora deles — aprova esta entrada. É o furo, medido.
    expect(passaNoTexto(comOrgIdConcatenado)).toEqual([true])
  })

  it("🔴 o furo QA-900-67-6 (b): objeto ANINHADO no valor de uma opção-irmã não conta", () => {
    // Forma exata da mutação M8 do @qa, sobre `src/app/api/users/[id]/reset-password/route.ts`.
    // Esta é a pior das duas porque **não exige nome nenhum**: basta aninhar `{ orgId: … }` no
    // valor de qualquer opção-irmã do tipo string, e os dois tipos de opção têm irmã `string`
    // inline em 9 dos 9 sítios fiados. `tsc` rc=0, e-mail sem logo, suíte 20/20 VERDE.
    const comOrgIdAninhado = [
      "const { subject, html } = renderPasswordActionEmail({",
      "userName: brokerName,",
      'actionLink: actionLink + "&" + new URLSearchParams({ orgId: appUser.org_id ?? "" }).toString(),',
      "siteUrl,",
      'mode: "reset",',
      "})",
    ].join("\n")
    expect(passa(comOrgIdAninhado)).toEqual([false])
    // A chave aninhada não sobe: as chaves de topo são só as quatro reais.
    expect(opcoesDe(comOrgIdAninhado).map((o) => o.chaves)).toEqual([
      ["userName", "actionLink", "siteUrl", "mode"],
    ])
    expect(passaNoTexto(comOrgIdAninhado)).toEqual([true])

    // Falso alarme, o outro sentido: a fiação legítima que vem DEPOIS de um objeto aninhado
    // continua sendo lida. Um `esperandoChave` que não se restabelecesse na `,` de topo depois do
    // aninhamento reprovaria os sítios reais.
    expect(passa(comOrgIdAninhado.replace('mode: "reset",', 'mode: "reset", orgId'))).toEqual([true])
  })

  it("comentário DENTRO do objeto de opções — os dois sentidos (AC11.1)", () => {
    // Sentido 1 — comentário NÃO conta como fiação. Quem fecha esta porta agora é a POSIÇÃO: o
    // `/` não é início de nome, então o modo "esperando chave" se desliga e nada depois dele
    // naquele item é lido como chave. A régua de texto lia `orgId:` desta prosa como fiação.
    const semFiacao = [
      "const html = renderBaseLayout(corpo, {",
      '  orgName: "Portal de Obras",',
      "  // orgId: deliberadamente ausente — ver AC7",
      "})",
    ].join("\n")
    // `toEqual([false])` e não `.some()`: afirma o veredicto E que houve exatamente um call site.
    expect(passa(semFiacao)).toEqual([false])
    // Sem controle positivo de `REGUA_SO_DE_TEXTO` aqui, e o motivo é medido: `.literal` já sai
    // de `codigoDe`, então a régua de texto também não vê este comentário. Quem faz o papel de
    // controle positivo neste `it` é a linha abaixo — com o `orgId` em CÓDIGO, o mesmo caminho
    // aprova, o que prova que o `false` de cima veio do comentário e não de um extrator morto.
    expect(passa(semFiacao.replace("// orgId: deliberadamente ausente — ver AC7", "orgId,"))).toEqual(
      [true],
    )

    // Sentido 2 — e é ele que torna o `codigoDe()` da AC11.1 OBRIGATÓRIO por construção. Um
    // comentário entre a `,` e a chave seguinte quebra a leitura DAQUELA chave: sem remover
    // comentário, `orgId` deixa de ser visto e o sítio vira FALSO ALARME. Tirar `codigoDe` de
    // `callSitesDe` derruba esta linha.
    //
    // ⚠️ Na rodada 3 este carrasco morava no sentido 1, e a troca da régua de texto por posição o
    // teria desarmado em silêncio: com a régua nova, o sentido 1 dá `false` com ou sem
    // `codigoDe`. Foi a re-rodada da M3 contra a régua nova que achou isso — troca de régua
    // invalida os vermelhos de TODAS as mutações, não só os da que mudou.
    const fiadoAtrasDeComentario = 'renderBaseLayout(corpo, { orgName, /* ver AC7 */ orgId })'
    expect(passa(fiadoAtrasDeComentario)).toEqual([true])
    expect(opcoesDe(fiadoAtrasDeComentario).map((o) => o.chaves)).toEqual([["orgName", "orgId"]])
  })
})

describe("AC11 — todo call site de e-mail passa orgId, com UMA exceção declarada", () => {
  it("vivacidade: a varredura enxerga a árvore de verdade e acha os 10 call sites", () => {
    // Uma varredura que devolve zero call site por erro de caminho passaria verde contra uma
    // partição vazia. Esta não: o total é afirmado, e é o número medido (4 diretos + 6 via
    // `renderPasswordActionEmail`).
    expect(arquivosVarridos.length).toBeGreaterThan(100)
    expect(callSites.length).toBe(10)
    expect(callSites.every((s) => s.regiao !== "")).toBe(true)
    // Vivacidade da SEGUNDA extração, a que a régua realmente mede: `objetoDeOpcoes` achou um
    // objeto literal de topo nos 10. Um extrator que devolvesse `""` para tudo é fail-closed (cai
    // na partição acusada), mas acender aqui diz QUAL das duas coisas quebrou.
    expect(callSites.filter((s) => s.opcoes.literal === "").map((s) => s.arquivo)).toEqual([])
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
