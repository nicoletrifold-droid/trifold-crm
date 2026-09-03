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
 *
 * ⚠️ É testada contra `objetoDeOpcoes(regiao).codigo`, **nunca** contra a região inteira (furo
 * QA-900-67-1) e **nunca** contra o `.literal` (furo QA-900-67-5). Ver `objetoDeOpcoes`.
 *
 * ⚠️ Ancorar em `(^|[{,])` NÃO substitui o apagamento de string: medido pelo @qa, a âncora
 * ingênua continua casando `${orgId}`, porque o caractere anterior é o `{` do abre-interpolação.
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

/** O que `objetoDeOpcoes` devolve: o recorte cru e o recorte SEM o conteúdo dos literais. */
interface Opcoes {
  /** O objeto de opções como está escrito no arquivo. Serve para ler e para asserção de forma. */
  literal: string
  /**
   * O MESMO recorte com o conteúdo de todo literal de string apagado (trocado por espaço, com as
   * quebras de linha preservadas). É contra ISTO — e só isto — que `PASSA_ORG_ID` é medido.
   */
  codigo: string
}

/** Extração que não achou objeto de opções. Fail-closed nos dois campos. */
const SEM_OPCOES: Opcoes = { literal: "", codigo: "" }

/**
 * O ÚLTIMO objeto literal de TOPO da região — o objeto de OPÇÕES, e só ele.
 *
 * Medir `PASSA_ORG_ID` contra a região INTEIRA foi o furo **QA-900-67-1**: a região vai de
 * `renderBaseLayout(` até o `)` que a fecha, e portanto inclui o argumento `content`. Um token
 * `orgId:` em QUALQUER argumento satisfazia a régua. Medido pelo @qa: tirar
 * `orgId: appointment.org_id` das OPÇÕES de `appointment-email-reminders` (o e-mail passa a
 * renderizar TEXTO em vez da logo, em silêncio) e devolver o token dentro de um comentário HTML
 * no corpo deixava `tsc` em rc=0 e a suíte INTEIRA verde — o modo de falha nº 1 que a AC11 existe
 * para fechar, na forma que o próximo refactor produz (`renderBaseLayout(montarCorpo({ orgId }),
 * { orgName })`).
 *
 * **"De topo" é o que fecha isso**: só conta o `{` que abre quando a pilha de aninhamento tem
 * apenas o `(` da própria chamada. O objeto que o @qa escondeu no `content` está dentro de um
 * `${…}` de template literal — nunca no topo da lista de argumentos.
 *
 * A varredura tem ESTADO de string (`'`, `"`, crase, e o `${…}` que volta a ser código dentro do
 * template): sem ele, uma chave dentro de um literal desbalancearia a pilha. Comentários já
 * saíram antes, em `codigoDe` (AC11.1).
 *
 * **Fail-closed nas três direções**: região sem `(`, região sem fechamento, ou chamada que passa
 * as opções por VARIÁVEL (`renderBaseLayout(corpo, opcoes)`) devolvem `""` — que não casa
 * `PASSA_ORG_ID`, cai na partição SEM `orgId` e é acusada pelo nome. Uma extração que não achou
 * o objeto nunca vira aprovação.
 *
 * ## Por que o `.codigo` existe — o furo QA-900-67-5
 *
 * A versão anterior declarava um resíduo "não alcançável": um `orgId` aninhado dentro das opções
 * (`{ orgName, extra: { orgId } }`) casaria, mas os dois tipos são PLANOS e o excess property
 * checking do `tsc` recusa a chave inventada. O argumento estava certo e era irrelevante — **a
 * dívida não precisa de chave inventada**. `PASSA_ORG_ID` é texto, e o token `orgId` dentro do
 * VALOR de uma opção-irmã do tipo string satisfazia a régua. Medido pelo @qa em call site REAL,
 * `src/lib/tenancy/admin-invite.ts:296`: tirar a chave `orgId,` e trocar `actionLink,` por
 * `` actionLink: `${actionLink}&org=${orgId}` `` — o que um refactor de rastreamento de org
 * produz sozinho — deixava `tsc` em rc=0, o convite de admin SEM a logo, e a suíte 19/19 verde.
 * O `}` que fecha a interpolação vinha logo depois do token e satisfazia a classe `[,:}]`.
 *
 * Por isso a mesma varredura devolve `codigo`: o conteúdo de todo literal (aspas, aspas duplas e
 * crase) sai trocado por espaço antes de a régua correr. Sem segunda varredura — duas máquinas de
 * estado que possam divergir são a dívida que esta onda está fechando.
 *
 * **`${…}` também é apagado, embora seja CÓDIGO para o JS.** É deliberado: a pergunta desta régua
 * é "`orgId` está fiado como CHAVE das opções?", e uma chave não pode morar dentro de um literal
 * de string. Tudo que aparece numa interpolação é, por construção, parte do VALOR de uma
 * opção-irmã — deixar a interpolação transparente reabre exatamente o QA-900-67-5. Os 10 call
 * sites reais têm o `orgId` FORA de string, e a vivacidade abaixo acende se isso mudar.
 *
 * Limite conhecido: literal de expressão regular com aspas ou chaves desbalanceadas dentro da
 * chamada confundiria a pilha. Nenhum dos 10 call sites tem um, e a vivacidade
 * (`opcoes.literal !== ""`, abaixo) acende se algum passar a ter.
 */
function objetoDeOpcoes(regiao: string, marcador: string): Opcoes {
  const abre = marcador.length - 1
  if (regiao[abre] !== "(") return SEM_OPCOES
  const pilha: string[] = ["("]
  // O texto mascarado é construído NA MESMA passada: a máquina de estado que equilibra a pilha é
  // a que sabe o que é literal. Uma segunda varredura poderia divergir desta em silêncio.
  const mascara = regiao.split("")
  /** Aspas ABERTAS na pilha. `> 0` ⇒ este ponto do texto mora dentro de um literal. */
  let aspas = 0
  let candidato = -1
  let de = -1
  let ate = -1
  let fechou = false

  // Espaço, não remoção: apagar encurtando deslocaria `de`/`ate`, que indexam o texto ORIGINAL.
  // A quebra de linha fica: `codigoDe` já juntou as linhas com `\n` e o `\s*` da régua a atravessa
  // de qualquer jeito, então preservá-la só mantém o recorte legível numa falha.
  const apagar = (i: number) => {
    if (i < mascara.length && mascara[i] !== "\n") mascara[i] = " "
  }

  for (let i = abre + 1; i < regiao.length; i++) {
    const c = regiao[i]
    const topo = pilha[pilha.length - 1]
    // Avaliado ANTES de processar `c`: diz se este caractere já estava dentro de um literal.
    const emLiteral = aspas > 0

    if (topo === "'" || topo === '"' || topo === "`") {
      if (c === "\\") {
        apagar(i)
        apagar(i + 1)
        i++
      } else if (c === topo) {
        pilha.pop()
        aspas--
        // A aspa que fecha um literal ANINHADO (dentro de um `${…}`) ainda é conteúdo do de fora.
        if (aspas > 0) apagar(i)
      } else if (topo === "`" && c === "$" && regiao[i + 1] === "{") {
        apagar(i)
        apagar(i + 1)
        pilha.push("${")
        i++
      } else {
        apagar(i)
      }
      continue
    }

    // Daqui para baixo `c` é CÓDIGO para o JS. Se `emLiteral`, esse código está dentro de um
    // `${…}` de template — e para ESTA régua isso é valor, não chave. Ver o cabeçalho.
    if (emLiteral) apagar(i)

    if (c === "'" || c === '"' || c === "`") {
      pilha.push(c)
      aspas++
      continue
    }

    if (c === "(" || c === "[") {
      pilha.push(c)
      continue
    }

    if (c === "{") {
      if (pilha.length === 1) candidato = i
      pilha.push("{")
      continue
    }

    if (c === "}" || c === ")" || c === "]") {
      const aberto = pilha.pop()
      if (aberto === "{" && pilha.length === 1 && candidato >= 0) {
        de = candidato
        ate = i
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
  return { literal: regiao.slice(de, ate + 1), codigo: mascara.slice(de, ate + 1).join("") }
}

interface CallSite {
  arquivo: string
  regiao: string
  /** O objeto de opções da região. `PASSA_ORG_ID` mede o `.codigo`, nunca o `.literal`. */
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

// `s.opcoes.codigo`, jamais `s.regiao` (a região inclui o argumento `content` — QA-900-67-1) e
// jamais `s.opcoes.literal` (o token dentro de um literal de string — QA-900-67-5).
const comOrgId = contarPor(callSites.filter((s) => PASSA_ORG_ID.test(s.opcoes.codigo)))
const semOrgId = contarPor(callSites.filter((s) => !PASSA_ORG_ID.test(s.opcoes.codigo)))
const ordenado = (m: Map<string, number>) => Object.fromEntries([...m].sort())

/**
 * O carrasco do EXTRATOR — QA-900-67-1 e QA-900-67-3.
 *
 * Estes `it` rodam contra entradas SINTÉTICAS, e é de propósito: o corpus real tem 10 call sites
 * todos bem-comportados, e uma régua que só olha o corpus não distingue "o extrator está certo"
 * de "o corpus ainda não produziu a forma errada". A forma errada já foi produzida uma vez — pelo
 * @qa, contra o código de verdade — e está reproduzida aqui.
 *
 * O `it` que ficava aqui antes ("a contagem por arquivo bate com uma medida independente do mesmo
 * texto") foi APAGADO, não consertado: os dois lados contavam ocorrências dos MESMOS marcadores no
 * MESMO `codigoDe`, e `regioesDeChamada` empurra exatamente uma região por ocorrência — dê certo o
 * balanceamento ou não. Não havia entrada capaz de reprová-lo, e o @qa mediu isso trocando o
 * recorte por um `slice` até o EOF: o `it` vizinho ficou vermelho e aquele ficou verde. Guarda que
 * não pode reprovar é pior que guarda ausente, porque conta como cobertura. Quem cobre o recorte
 * é, e sempre foi, o `it` "nenhum recorte engoliu o call site vizinho".
 */
describe("objetoDeOpcoes — a régua mede as OPÇÕES, não a região (QA-900-67-1/5)", () => {
  const REND = "renderBaseLayout("

  /**
   * O veredicto da régua para cada call site de uma fonte SINTÉTICA, pelo caminho COMPLETO:
   * `codigoDe` → `regioesDeChamada` → `objetoDeOpcoes` → `PASSA_ORG_ID` sobre o `.codigo`.
   * É o mesmo caminho que o corpus percorre — nenhum elo é pulado.
   */
  const passa = (fonte: string) =>
    callSitesDe("sintetico.ts", fonte).map((s) => PASSA_ORG_ID.test(s.opcoes.codigo))

  it("recorta o objeto de opções — e é ele que a régua aprova", () => {
    const regiao = 'renderBaseLayout("<p>Body</p>", { orgName: "Trifold", orgId: appUser.org_id })'
    const opcoes = objetoDeOpcoes(regiao, REND)
    expect(opcoes.literal).toBe('{ orgName: "Trifold", orgId: appUser.org_id }')
    // O `.codigo` perde só o MIOLO do literal: a estrutura, as chaves e o `orgId` continuam lá.
    expect(opcoes.codigo).toBe('{ orgName: "       ", orgId: appUser.org_id }')
    expect(PASSA_ORG_ID.test(opcoes.codigo)).toBe(true)
  })

  it("🔴 o furo QA-900-67-1: `orgId` escondido no argumento `content` NÃO conta", () => {
    // Forma exata da mutação M5 do @qa, sobre `appointment-email-reminders`: as OPÇÕES perdem o
    // `orgId` (o e-mail perde a logo, em silêncio) e o token reaparece dentro de um comentário
    // HTML no corpo. `tsc` aceita, e contra a REGIÃO isto ficava verde na suíte inteira.
    const regiao =
      'renderBaseLayout(`<p>Olá, ${broker.name}!</p><!--${({ orgId: a.org_id }).orgId ?? ""}-->`, { orgName: "Trifold" })'
    expect(objetoDeOpcoes(regiao, REND).literal).toBe('{ orgName: "Trifold" }')
    expect(PASSA_ORG_ID.test(objetoDeOpcoes(regiao, REND).codigo)).toBe(false)
    // Controle positivo, obrigatório: é a MESMA entrada que a régua antiga aprovava. Sem esta
    // linha, um `objetoDeOpcoes` que devolvesse `""` para tudo passaria neste `it` por acidente.
    expect(PASSA_ORG_ID.test(regiao)).toBe(true)
  })

  it("objeto aninhado em OUTRA CHAMADA também não conta — a forma do próximo refactor", () => {
    const regiao = 'renderBaseLayout(montarCorpo({ orgId }), { orgName: "Trifold" })'
    expect(objetoDeOpcoes(regiao, REND).literal).toBe('{ orgName: "Trifold" }')
    expect(PASSA_ORG_ID.test(objetoDeOpcoes(regiao, REND).codigo)).toBe(false)
    expect(PASSA_ORG_ID.test(regiao)).toBe(true)
  })

  it("fail-closed: opções por VARIÁVEL, ou região truncada, caem na partição acusada", () => {
    // "Não consegui medir" nunca pode virar "está fiado": sem objeto literal de topo o resultado
    // é `""`, que não casa a régua e cai no lado que a asserção de conjunto acusa pelo nome.
    // `toEqual` sobre o par: os DOIS campos têm de sair vazios. Um `.literal` vazio com um
    // `.codigo` sobrevivente reabriria a porta pelo campo que a régua realmente mede.
    const VAZIO = { literal: "", codigo: "" }
    expect(objetoDeOpcoes("renderBaseLayout(corpo, opcoes)", REND)).toEqual(VAZIO)
    expect(objetoDeOpcoes("renderBaseLayout(corpo, { orgId }", REND)).toEqual(VAZIO)
    expect(objetoDeOpcoes("", REND)).toEqual(VAZIO)
    expect(PASSA_ORG_ID.test("")).toBe(false)
  })

  it("🔴 o furo QA-900-67-5: `orgId` dentro de um LITERAL DE STRING não conta", () => {
    // Forma exata da mutação M6 do @qa, sobre `src/lib/tenancy/admin-invite.ts:296`: a CHAVE
    // `orgId,` sai das opções — o convite de admin perde a logo da Trifold em silêncio — e o
    // token reaparece interpolado na URL de uma opção-irmã, que é o que um refactor de
    // rastreamento de org produz sozinho. `tsc` aceita, e contra o `.literal` isto ficava
    // 19/19 VERDE. Está aqui como código sintético para que a régua não dependa de ninguém
    // manter aquele call site na forma que hoje a mata.
    const comOrgIdSoNaString = [
      "const { subject, html } = renderPasswordActionEmail({",
      "userName: admin.name ?? nomeDerivado,",
      "actionLink: `${actionLink}&org=${orgId}`,",
      "siteUrl,",
      'mode: "create",',
      "})",
    ].join("\n")
    expect(passa(comOrgIdSoNaString)).toEqual([false])

    // Controle positivo nº 1, obrigatório: é a MESMA entrada que a régua de `4bafc03d` aprovava.
    // Sem o apagamento do conteúdo do literal, o `}` do fecha-interpolação satisfaz a classe
    // `[,:}]` — o `.literal` prova que a diferença está no apagamento, e não em outra coisa.
    const literais = callSitesDe("sintetico.ts", comOrgIdSoNaString).map((s) => s.opcoes.literal)
    expect(literais.map((l) => PASSA_ORG_ID.test(l))).toEqual([true])

    // Controle positivo nº 2: o apagamento não come a fiação LEGÍTIMA que vem DEPOIS de um
    // literal, nem quando o vizinho é uma crase. Um estado de string que não fechasse mascararia
    // o resto do objeto e reprovaria os 10 sítios reais — falso alarme, acusado aqui.
    expect(passa(comOrgIdSoNaString.replace('mode: "create",', "mode: `create`, orgId,"))).toEqual([
      true,
    ])
  })

  it("comentário DENTRO do objeto de opções não conta como fiação (AC11.1)", () => {
    // O carrasco PRÓPRIO do `codigoDe` obrigatório, e a resposta ao QA-900-67-3: até aqui a
    // matabilidade da AC11.1 dependia de UMA linha de prosa no comentário da AC7 em
    // `auto-vincular-cliente-obra.ts` — reescrever aquela prosa devolvia o filtro ao estado
    // decorativo, em silêncio. Agora o filtro morre por construção: tirar `codigoDe` de
    // `callSitesDe` deixa este `it` vermelho, e nenhuma prosa do repositório o sustenta.
    const semFiacao = [
      "const html = renderBaseLayout(corpo, {",
      '  orgName: "Portal de Obras",',
      "  // orgId: deliberadamente ausente — ver AC7",
      "})",
    ].join("\n")
    // `toEqual([false])` e não `.some()`: afirma o veredicto E que houve exatamente um call site.
    expect(passa(semFiacao)).toEqual([false])
    // Controle positivo no mesmo `it`: com o `orgId` em CÓDIGO, o mesmo caminho aprova.
    expect(passa(semFiacao.replace("// orgId: deliberadamente ausente — ver AC7", "orgId,"))).toEqual([
      true,
    ])
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
