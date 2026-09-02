/**
 * Story 900-22b — AC-B4: o detector de leitura crua e a varredura dos dois diretórios de
 * plataforma.
 *
 * ONDE ESTE ARQUIVO MORA E POR QUÊ: em `lib/tenancy/`, ao lado do detector e da fixture, e
 * **fora** dos dois diretórios varridos. O `it` de varredura real espera `[]`; se este arquivo
 * (que contém `db.from("leads")` como fixture inline) estivesse dentro de `app/platform/**`, a
 * régua se leria a si mesma e nunca ficaria verde. A exclusão de `*.test.ts` no walker abaixo
 * existe pelo mesmo motivo — cinto e suspensório de propósito, para que a segurança não dependa
 * de uma única linha.
 */
import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { detectRawTableReads, detectEmbeddedTableReads } from "./platform-query-scan"
import { callSiteDe, codigoDe, linhasDeCodigo, ocorrenciasNoCodigo, trechoDelimitado } from "./fonte-scan"

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(AQUI, "../..") // packages/web/src

/** Os dois diretórios que a AC-B4 manda varrer. */
const DIRETORIOS_VARRIDOS = [
  path.join(SRC, "app/api/platform"),
  path.join(SRC, "app/platform"),
]

/**
 * Restrito a `.ts`/`.tsx` de propósito: um `.md`/`.json` com um trecho de exemplo de código
 * dentro de `app/platform/**` não é acesso a banco e não deve acender. Sem essa restrição, a
 * reação natural ao ruído seria afrouxar as EXCLUSÕES — que é justamente o que não pode
 * acontecer, porque são elas que impedem a régua de se ler a si mesma.
 *
 * Excluímos `*.test.ts`/`*.test.tsx`, `__tests__/` e `__fixtures__/`: código de teste carrega
 * chamadas cruas como fixture literal, de propósito. NÃO REMOVER — sem essas exclusões, um
 * teste futuro colocado dentro dos diretórios varridos deixaria esta suíte permanentemente
 * vermelha e o próximo dev "consertaria" apagando a régua.
 */
function arquivosVarridos(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const alvo = path.join(dir, entrada.name)
    if (entrada.isDirectory()) {
      if (entrada.name === "__tests__" || entrada.name === "__fixtures__") continue
      arquivosVarridos(alvo, acc)
      continue
    }
    if (!/\.tsx?$/.test(entrada.name)) continue
    if (/\.test\.tsx?$/.test(entrada.name)) continue
    acc.push(alvo)
  }
  return acc
}

describe("detectRawTableReads — formas que o repositório realmente produz (AC-B4 item 1)", () => {
  it("literal numa linha só", () => {
    expect(detectRawTableReads(`const r = db.from("leads").select("id")`)).toEqual(["leads"])
  })

  it("argumento quebrado em várias linhas", () => {
    const fonte = `const r = db.from(
  "leads"
)`
    expect(detectRawTableReads(fonte)).toEqual(["leads"])
  })

  it("receiver na linha ANTERIOR (forma dominante do repositório — 1.511 ocorrências)", () => {
    const fonte = `const { data } = await db
  .from("leads")
  .select("id")`
    expect(detectRawTableReads(fonte)).toEqual(["leads"])
  })

  it("receiver como CHAMADA — é a forma da mutação nomeada na AC-B3", () => {
    expect(detectRawTableReads(`createAdminClient().from("leads").select("id")`)).toEqual([
      "leads",
    ])
  })

  it("homônimos da stdlib não acendem", () => {
    const fonte = `const a = Buffer.from("hex")
const b = Array.from([1, 2, 3])`
    expect(detectRawTableReads(fonte)).toEqual([])
  })

  it("fonte sem acesso a tabela devolve lista vazia", () => {
    expect(detectRawTableReads(`export const x = 1`)).toEqual([])
  })
})

describe("AC-B4 item 3 — fixture commitado do orgs/page.tsx ANTES desta story", () => {
  it("o detector pega as duas leituras cruas que existiam até este PR", () => {
    const fixture = fs.readFileSync(
      path.join(AQUI, "__fixtures__/orgs-page-pre-900-22b.txt"),
      "utf8",
    )
    expect(detectRawTableReads(fixture)).toEqual(["organizations", "users"])
  })
})

describe("AC-B3 — orgs/page.tsx passou a ler por platformQuery", () => {
  const PAGE = path.join(SRC, "app/platform/orgs/page.tsx")

  it("não importa mais o client de service-role direto", () => {
    const fonte = fs.readFileSync(PAGE, "utf8")
    const importsCrus = fonte
      .split("\n")
      .filter((l) => /^import\b/.test(l.trim()) && /createAdminClient/.test(l))
    expect(importsCrus).toEqual([])
  })

  it("importa platformQuery", () => {
    const fonte = fs.readFileSync(PAGE, "utf8")
    expect(fonte).toMatch(/^import \{ platformQuery \} from "@web\/lib\/tenancy\/platform-query"$/m)
  })

  it("o detector não encontra nenhuma leitura crua no arquivo", () => {
    expect(detectRawTableReads(fs.readFileSync(PAGE, "utf8"))).toEqual([])
  })

  // REL-001 (gate @qa): o desempate `created_at ASC` de `ensureAdminInvited` só vale se a
  // LEITURA usar o mesmo critério — senão o badge aponta para uma linha e o "Reenviar" age
  // sobre outra, produzindo `400 NO_PENDING_INVITE` sem explicação na org "Trifold" legada,
  // que tem mais de um `role='admin'`. Régua estática porque `page.tsx` é server component
  // sem harness; o que ela impede é a linha sumir num refactor sem ninguém notar.
  it("a consulta dedicada de admin desempata pelo mesmo critério da escrita", () => {
    const fonte = fs.readFileSync(PAGE, "utf8")
    // A projeção ganhou `created_at` na Story 900-58: `pendenciasDeConvite` exige
    // `AdminDaOrg.criadoEm`, que é a fonte de tempo do convite. É a MESMA projeção de
    // `app/platform/page.tsx`, e tem que continuar sendo — as duas telas derivam o mesmo estado.
    const ANCORA = 'platformQuery("users", "org_id, id, auth_id, created_at")'
    // Fail-closed explícito: `indexOf` devolve `-1` quando a âncora some, e `slice(-1)` devolve
    // o ÚLTIMO caractere do arquivo — um recorte que não achou o alvo não pode virar aprovação
    // por acidente do que estiver no fim da fonte.
    expect(fonte.indexOf(ANCORA), "âncora da consulta de admin").toBeGreaterThanOrEqual(0)
    const consulta = fonte.slice(fonte.indexOf(ANCORA))
    expect(consulta).toMatch(/\.eq\("role", "admin"\)/)
    expect(consulta).toMatch(/\.order\("created_at", \{ ascending: true \}\)/)
  })
})

/**
 * Story 900-62 · AC13 — a projeção do Resumo da empresa PRECISA carregar `updated_at` e
 * `settings`, e isso não pode depender de ninguém lembrar.
 *
 * ## Por que uma régua estática, e por que ela existe
 *
 * `orgs/[id]/page.tsx` é Server Component sem harness. As duas colunas foram acrescentadas pela
 * `900-62`; sem elas, a story falha das DUAS maneiras piores, e nenhuma acende sozinha:
 *
 *   • Sem `updated_at`: `expectedUpdatedAt` sai `undefined` do diálogo e a rota devolve `400` —
 *     funcionalidade morta. Se alguém "consertar" mandando `null`, a comparação `<>` com `NULL`
 *     avalia para `NULL`, o `IF` não entra no ramo e a trava otimista passa BATIDO. Uma feature
 *     morta é ruim; uma trava que mente é pior, porque a AC3 afirma ao operador que ela existe.
 *     (A migration `252` também barra isso, com `IS DISTINCT FROM` + `P0024` — duas redes.)
 *   • Sem `settings`: os seis campos de contato/fiscal abrem SEMPRE vazios, inclusive numa
 *     empresa que já tem os dados. O operador que abre o diálogo para corrigir o `name` e salva
 *     APAGA o contato e o fiscal já gravados — perda de dado silenciosa, com `200` na tela.
 *
 * ## A régua lê o LITERAL, não a região
 *
 * O trecho do arquivo em volta da consulta tem um comentário que menciona `updated_at` e
 * `settings` — de propósito, porque é onde a explicação pertence. Um `expect(regiao).toContain(
 * "updated_at")` ficaria VERDE só por causa desse comentário, mesmo com a coluna fora da
 * projeção. Por isso o que se mede é a primeira linha DEPOIS da âncora que começa com aspas: a
 * lista de colunas, e nada mais. Linhas de comentário começam com `//` e não casam.
 */
describe("AC13 (900-62) — a projeção de orgs/[id]/page.tsx", () => {
  const PAGE = path.join(SRC, "app/platform/orgs/[id]/page.tsx")
  const ANCORA = 'platformQuery(\n    "organizations",'

  /** A lista de colunas, extraída do literal — nunca do texto em volta dele. */
  function projecaoDeOrganizations(): string {
    const fonte = fs.readFileSync(PAGE, "utf8")
    // Fail-closed explícito: `indexOf` devolve `-1` quando a âncora some, e um recorte que não
    // achou o alvo não pode virar aprovação por acidente do que estiver no resto do arquivo.
    const i = fonte.indexOf(ANCORA)
    expect(i, "âncora da consulta de `organizations`").toBeGreaterThanOrEqual(0)
    const depois = fonte.slice(i + ANCORA.length)
    const linha = depois.split("\n").find((l) => l.trim().startsWith('"'))
    expect(linha, "literal de colunas depois da âncora").toBeTruthy()
    return linha!.trim().replace(/^"|",?$/g, "")
  }

  it("carrega `updated_at` — a trava otimista da AC3 depende dela", () => {
    expect(projecaoDeOrganizations().split(", ")).toContain("updated_at")
  })

  it("carrega `settings` — sem ela, editar o nome APAGA o contato e o fiscal já gravados", () => {
    expect(projecaoDeOrganizations().split(", ")).toContain("settings")
  })

  /**
   * Story 900-63 · AC11 — `logo_url` na MESMA linha, SOMADA e nunca substituindo as duas acima.
   *
   * Sem ela, `org.logo_url` é `undefined` e o bloco do logo mostra SEMPRE o placeholder —
   * inclusive logo depois de um upload bem-sucedido e do `router.refresh()`. É o pior tipo de
   * bug: o texto obrigatório da AC9 ("isto só guarda o arquivo") daria ao operador uma explicação
   * plausível para aceitar o defeito como se fosse o comportamento declarado.
   */
  it("carrega `logo_url` (900-63) — sem ela o painel diz 'sem logo' para quem TEM logo", () => {
    expect(projecaoDeOrganizations().split(", ")).toContain("logo_url")
  })

  it("as TRÊS colunas convivem — a segunda story SOMA, nunca substitui", () => {
    // A regra de coordenação declarada entre a AC13 da `900-62` e a AC11 da `900-63`: as duas
    // stories tocam esta única linha. Sem esta asserção, "acrescentar logo_url" removendo
    // `settings` passaria pelos três `it` de cima um a um e reprovaria só em produção.
    const colunas = projecaoDeOrganizations().split(", ")
    expect(colunas).toEqual(expect.arrayContaining(["updated_at", "settings", "logo_url"]))
  })

  /**
   * QA-900-62-1 — a coluna lida CHEGA aos seis campos.
   *
   * Os dois `it` acima prendem a projeção. O gate mediu que isso parava uma casa antes do dano
   * que a AC13 nomeia: com `settings` na projeção, trocar o espalhamento por seis literais `""`
   * na prop `inicial` deixava `tsc` rc=0 e a suíte INTEIRA verde — e apagava contato e fiscal com
   * `200` na tela.
   *
   * O COMPORTAMENTO da montagem tem carrasco próprio em `console-dados-empresa.test.ts`
   * (`dadosIniciaisDoDialogo`). O que só se pode medir por texto é o `.tsx` CONSUMIR aquela
   * função — função pura bem testada com componente que a ignora é o mesmo verde vazio.
   *
   * Medida por LINHA, e não por `toContain` no arquivo inteiro: um comentário que reproduzisse a
   * âncora satisfaria o `toContain` sem que uma linha de código mudasse. Linha de comentário
   * começa com `//`, `/*` ou `*` depois do `trim` e não casa com `inicial=` — e duas linhas
   * casando também reprova, porque `toHaveLength(1)` é exigência, não tolerância.
   */
  function linhaDaPropInicial(): string {
    const fonte = fs.readFileSync(PAGE, "utf8")
    const casadas = fonte
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("inicial="))
    expect(casadas, "prop `inicial` de <EditarDadosEmpresa /> em orgs/[id]/page.tsx").toHaveLength(
      1,
    )
    return casadas[0]!
  }

  it("a prop `inicial` é a função pura — os seis campos não são montados no JSX", () => {
    expect(linhaDaPropInicial()).toBe("inicial={dadosIniciaisDoDialogo(org)}")
  })

  it("as duas funções vêm do módulo com carrasco, e não de cópias locais do `.tsx`", () => {
    // Sem isto, um `dadosIniciaisDoDialogo` definido dentro do próprio `.tsx` — de volta ao ponto
    // cego do vitest — satisfaria a âncora de cima com exatamente o mesmo texto.
    const fonte = fs.readFileSync(PAGE, "utf8")
    const importes = [
      ...fonte.matchAll(/import \{[^}]*\} from "@web\/lib\/tenancy\/console-dados-empresa"/g),
    ]
    expect(importes, "import de `console-dados-empresa` em orgs/[id]/page.tsx").toHaveLength(1)
    expect(importes[0]![0]).toContain("dadosIniciaisDoDialogo")
    expect(importes[0]![0]).toContain("linhasDeContatoEFiscal")
  })

  /**
   * QA-900-62-2 — a AC15 tem carrasco de COMPORTAMENTO em `console-dados-empresa.test.ts`
   * (`linhasDeContatoEFiscal`). Aqui fica só o elo que nenhum teste de comportamento alcança: o
   * card de fato pedir as seis linhas e de fato imprimi-las. Sem o segundo `expect`, a chamada
   * poderia continuar existindo com o resultado jogado fora — que é o desfecho que o gate mediu
   * (PROBE-2: apagar as seis linhas do card deixava a suíte inteira verde).
   */
  it("AC15 — o card CHAMA as seis linhas e as imprime", () => {
    const fonte = fs.readFileSync(PAGE, "utf8")
    const chamadas = fonte
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("const secoesDeDados"))
    expect(chamadas, "a chamada de `linhasDeContatoEFiscal` no card").toEqual([
      "const secoesDeDados = linhasDeContatoEFiscal(org?.settings)",
    ])
    expect(fonte.split("\n").filter((l) => l.includes("secoesDeDados.map("))).toHaveLength(1)
  })

  it("controle: a régua lê o literal, e não o comentário que fala das duas colunas", () => {
    // Sem esta asserção, a leitura poderia ter voltado a região inteira do arquivo (comentário
    // incluído) e os dois `it` acima passariam com a projeção vazia. A projeção é uma lista de
    // colunas: sem `//`, sem quebra de linha, e sem `(` — que é embedding do PostgREST, fechado
    // pela `900-42a` por vazar PII de lead (e a AC8 dela proíbe afrouxar a guarda).
    const projecao = projecaoDeOrganizations()
    expect(projecao).not.toContain("//")
    expect(projecao).not.toContain("\n")
    expect(projecao).not.toContain("(")
    expect(projecao).not.toContain("*")
    expect(projecao.split(", ").length).toBeGreaterThanOrEqual(8)
  })
})

describe("AC-B4 item 2 — varredura da árvore real", () => {
  it("nenhum `.from(<literal>)` cru sobrevive em app/platform/** e app/api/platform/**", () => {
    const achados: Array<{ arquivo: string; tabelas: string[] }> = []
    for (const dir of DIRETORIOS_VARRIDOS) {
      for (const arquivo of arquivosVarridos(dir)) {
        const tabelas = detectRawTableReads(fs.readFileSync(arquivo, "utf8"))
        if (tabelas.length > 0) {
          achados.push({ arquivo: path.relative(SRC, arquivo), tabelas })
        }
      }
    }
    expect(achados).toEqual([])
  })

  it("a varredura de fato olha para arquivos (guarda de vivacidade — sem isto, `[]` seria trivial)", () => {
    const total = DIRETORIOS_VARRIDOS.reduce(
      (n, dir) => n + arquivosVarridos(dir).length,
      0,
    )
    expect(total).toBeGreaterThan(0)
  })
})

/**
 * Story 900-42a (SEC-001) — a segunda rede passa a enxergar embedding.
 *
 * Até esta story a varredura só procurava `.from(<literal>)`. Embedding do PostgREST vaza
 * linhas de outra tabela SEM emitir `.from()` nenhum, então passava invisível pelas duas redes
 * ao mesmo tempo. O bloco abaixo mede as duas direções: o que TEM de acender e o que NÃO PODE
 * acender. Só o primeiro sentido deixaria uma régua que recusa tudo passar por correta — e ela
 * pararia o painel inteiro na primeira consulta legítima.
 */
describe("detectEmbeddedTableReads — o que TEM de acender (900-42a)", () => {
  it("embedding com colunas nomeadas — a forma que vazava PII de lead", () => {
    const fonte = `const r = await platformQuery("organizations", "id, leads(name, phone)")`
    expect(detectEmbeddedTableReads(fonte)).toHaveLength(1)
  })

  it('embedding com "*" dentro', () => {
    expect(
      detectEmbeddedTableReads(`platformQuery("organizations", "id, users(*)")`),
    ).toHaveLength(1)
  })

  it("argumentos quebrados em várias linhas (forma que o Prettier produz)", () => {
    const fonte = `const { data } = await platformQuery(
  "organizations",
  "id, leads(name, phone)",
)`
    expect(detectEmbeddedTableReads(fonte)).toHaveLength(1)
  })

  it("`.select()` encadeado, não só `platformQuery()` — quem escapar do caminho sancionado", () => {
    expect(detectEmbeddedTableReads(`qualquerBuilder.select("id, leads(name)")`)).toHaveLength(1)
  })

  it("sintaxe de agregado também acende — é forma de embedding (AC8)", () => {
    expect(detectEmbeddedTableReads(`platformQuery("organizations", "id, users(count)")`))
      .toHaveLength(1)
  })
})

describe("detectEmbeddedTableReads — o que NÃO PODE acender (controle negativo, 900-42a)", () => {
  it("os columns REAIS dos call sites de produção não acendem", () => {
    // Levantados por `git grep -n "platformQuery(" -- packages/web/src` em 2026-08-31.
    const fonte = `
      await platformQuery("organizations", "id").eq("id", orgId).maybeSingle()
      await platformQuery("org_integrations", "provider, status", orgId)
      await platformQuery("platform_audit_log", "id, actor_type, org_id, action, metadata", orgId)
      await platformQuery("organizations", "id, admin_invite_email")
      await platformQuery("users", "id, auth_id, email")
      await platformQuery(
        "organizations",
        "id, name, slug, google_oauth_tokens",
      )
      await platformQuery("organizations", "id, name, slug, is_active, created_at, admin_invite_email")
      await platformQuery("users", "org_id")
      await platformQuery("users", "org_id, id, auth_id")
      await platformQuery("whatsapp_config", "status, phone_number_id, updated_at", orgId)
    `
    expect(detectEmbeddedTableReads(fonte)).toEqual([])
  })

  it("`platformQuery()` citado em prosa (parênteses vazio) não acende", () => {
    const fonte = `// As leituras passam por \`platformQuery()\` — este arquivo está em app/platform/**`
    expect(detectEmbeddedTableReads(fonte)).toEqual([])
  })

  it("encadeamento depois da chamada não acende", () => {
    const fonte = `await platformQuery("users", "org_id, id, auth_id")
  .eq("role", "admin")
  .order("created_at", { ascending: true })`
    expect(detectEmbeddedTableReads(fonte)).toEqual([])
  })

  it("fonte sem chamada nenhuma devolve lista vazia", () => {
    expect(detectEmbeddedTableReads(`export const x = 1`)).toEqual([])
  })
})

describe("900-42a — varredura da árvore real por embedding", () => {
  it("nenhum embedding sobrevive em app/platform/** e app/api/platform/**", () => {
    const arquivos = DIRETORIOS_VARRIDOS.flatMap((dir) => arquivosVarridos(dir))

    // GUARDA DE VIVACIDADE, no mesmo `it` de propósito: se o walker devolvesse `[]`, o
    // `expect(achados).toEqual([])` abaixo ficaria verde por VACUIDADE — aprovando o vazio em
    // vez de aprovar a árvore. Separar em outro `it` deixaria os dois poderem divergir.
    expect(arquivos.length).toBeGreaterThan(0)

    const achados: Array<{ arquivo: string; trechos: string[] }> = []
    for (const arquivo of arquivos) {
      const trechos = detectEmbeddedTableReads(fs.readFileSync(arquivo, "utf8"))
      if (trechos.length > 0) achados.push({ arquivo: path.relative(SRC, arquivo), trechos })
    }
    expect(achados).toEqual([])
  })

  it("o detector está VIVO contra o corpus real, não só contra fixture sintética", () => {
    // Envenenar um arquivo REAL da árvore varrida e exigir que acenda. Sem isto, o `[]` do
    // teste acima provaria "a árvore está limpa" tanto quanto "o detector está morto" — e um
    // detector morto é indistinguível de uma árvore limpa até o dia em que vaza.
    const arquivos = DIRETORIOS_VARRIDOS.flatMap((dir) => arquivosVarridos(dir))
    expect(arquivos.length).toBeGreaterThan(0)

    const fonteLimpa = fs.readFileSync(arquivos[0] as string, "utf8")
    expect(detectEmbeddedTableReads(fonteLimpa)).toEqual([])

    const fonteEnvenenada = `${fonteLimpa}\nconst vazamento = platformQuery("organizations", "id, leads(name, phone)")\n`
    expect(detectEmbeddedTableReads(fonteEnvenenada)).toHaveLength(1)
  })
})

/**
 * Story 900-63 · AC6 — a régua NÃO é modificada, e este bloco fixa POR QUÊ.
 *
 * ## A suspeita do rascunho foi medida e é FALSA
 *
 * O rascunho v0.1 da `900-63` supunha que `admin.storage.from("org-logos")` casaria
 * `detectRawTableReads` (receiver `storage`, "tabela" `org-logos`) e que por isso a story
 * precisaria AFROUXAR o detector, excluindo `"storage"` como receiver. A regex captura o nome com
 * `[a-zA-Z_]\w*`, e **`\w` não inclui hífen**: não acende, e não há o que consertar.
 *
 * ## E o "conserto" proposto era ativamente perigoso
 *
 * Excluir o receiver `storage` deixaria INVISÍVEL uma variável chamada `storage` lendo uma tabela
 * de verdade — nome comum, e o detector trata receiver por EXCLUSÃO de identificador, não por
 * forma de chamada. O controle positivo abaixo é exatamente a asserção que aquela "correção"
 * teria quebrado, e é por isso que ela mora aqui.
 *
 * Soma-se a AC8 da `900-42a` (em produção), que **proíbe explicitamente** afrouxar esta guarda.
 *
 * ## O nome do bucket é LOAD-BEARING
 *
 * Se alguém renomear `org-logos` para uma forma sem hífen, a varredura de `AC-B4 item 2` acima
 * passa a acusar o arquivo da rota. O conserto sancionado NÃO é excluir o receiver: é ancorar a
 * exclusão na forma de dois segmentos `.storage.from(`, e isso é story própria.
 */
describe("900-63 · AC6 — `org-logos` não acende, e o que segura é o HÍFEN", () => {
  const ROTA_DO_LOGO = path.join(SRC, "app/api/platform/orgs/[id]/logo/route.ts")

  it("caracterização: `storage.from(\"org-logos\")` NÃO é lido como leitura crua de tabela", () => {
    expect(detectRawTableReads('await admin.storage.from("org-logos").upload(p, b)')).toEqual([])
  })

  it("CONTROLE POSITIVO: um receiver chamado `storage` lendo tabela de verdade CONTINUA acendendo", () => {
    // Esta é a asserção que a "correção" do rascunho teria quebrado. Sem ela, excluir o receiver
    // `storage` abriria um buraco real na rede de segurança para resolver um problema inexistente.
    expect(
      detectRawTableReads('const storage = c(); await storage.from("organizations").select("id")'),
    ).toEqual(["organizations"])
  })

  it("o que segura é o HÍFEN — as mesmas chamadas sem hífen ACENDEM", () => {
    // Sem este par, a caracterização acima seria indistinguível de "o detector está morto".
    expect(detectRawTableReads('await admin.storage.from("orglogos").upload(p, b)')).toEqual([
      "orglogos",
    ])
    expect(detectRawTableReads('await admin.storage.from("org_logos").upload(p, b)')).toEqual([
      "org_logos",
    ])
  })

  it("a caracterização fixa a string que a ROTA de fato usa — não uma que ninguém escreve", () => {
    // Sem isto, o bloco inteiro poderia estar verde sobre um nome de bucket hipotético enquanto a
    // rota usa outro. Medido em LINHA DE CÓDIGO e exigido ÚNICO: um comentário que reproduzisse a
    // constante satisfaria um `toContain` no arquivo inteiro.
    const linhas = linhasDeCodigo(fs.readFileSync(ROTA_DO_LOGO, "utf8")).filter((l) =>
      l.startsWith("export const BUCKET_DE_LOGOS"),
    )
    expect(linhas).toEqual(['export const BUCKET_DE_LOGOS = "org-logos"'])
  })

  it("o arquivo REAL da rota não acende nenhum dos dois detectores", () => {
    // A varredura de `AC-B4 item 2` já cobre isto, mas ali o alvo é a árvore inteira e a falha
    // chegaria como uma lista grande. Aqui a mensagem nomeia o arquivo desta story.
    const fonte = fs.readFileSync(ROTA_DO_LOGO, "utf8")
    expect(fonte.length).toBeGreaterThan(0)
    expect(detectRawTableReads(fonte)).toEqual([])
    expect(detectEmbeddedTableReads(fonte)).toEqual([])
  })
})

/**
 * Story 900-63 · AC8/AC9 — o elo que nenhum teste de comportamento alcança.
 *
 * As decisões do logo moram em `console-logo-empresa.ts`, com carrasco próprio. O que só se pode
 * medir por texto é o `.tsx` CONSUMIR aquelas funções e o `.tsx` ser ALCANÇÁVEL — função pura bem
 * testada com componente que a ignora é o mesmo verde vazio, e um bloco correto dentro de um ramo
 * que nunca roda some da tela com tudo verde.
 *
 * Tudo medido sobre `linhasDeCodigo`/`callSiteDe`: comentário enganou régua de texto-fonte oito
 * vezes nesta onda, e o docblock destes dois arquivos cita justamente as constantes que se afirma.
 */
describe("900-63 · AC8 — o bloco do logo está fiado e é ALCANÇÁVEL", () => {
  const PAGE = path.join(SRC, "app/platform/orgs/[id]/page.tsx")
  const COMPONENTE = path.join(SRC, "app/platform/orgs/_components/logo-empresa.tsx")
  const GUARD = "{org && !orgFalhou && ("

  const fontePage = () => fs.readFileSync(PAGE, "utf8")
  const fonteComponente = () => fs.readFileSync(COMPONENTE, "utf8")

  it("o call site existe UMA vez e recebe os dados LIDOS, não literais", () => {
    // O mutante que isto mata: `logoUrl={null}` / `expectedUpdatedAt=""`. Os dois compilam, os
    // dois deixam a suíte de `console-logo-empresa.test.ts` 100% verde, e os dois quebram a tela
    // — o primeiro mostra "sem logo" para quem tem, o segundo mata a trava otimista.
    expect(ocorrenciasNoCodigo(fontePage(), "<LogoDaEmpresa")).toBe(1)
    // `codigoDe` ANTES de recortar, e não depois: `trechoDelimitado` faz `indexOf` na fonte CRUA,
    // e o docblock do topo de `page.tsx` cita `<LogoDaEmpresa />` em prosa — medido nesta story,
    // com o recorte devolvendo o COMENTÁRIO e a asserção reprovando o código certo. É a forma (1)
    // do cabeçalho de `fonte-scan.ts`, e a citação fica lá de propósito, como controle vivo.
    const call = callSiteDe(codigoDe(fontePage()), "<LogoDaEmpresa")
    expect(call, "call site de <LogoDaEmpresa />").not.toBe("")
    expect(call).toContain("orgId={orgId}")
    expect(call).toContain("logoUrl={org.logo_url}")
    expect(call).toContain("expectedUpdatedAt={org.updated_at}")
  })

  it("ALCANCE — o call site está DENTRO do ramo guardado por `org && !orgFalhou`", () => {
    // Presença e ordem não bastam: mover o bloco para fora do ramo (ou para dentro de um ramo que
    // nunca é verdade) some com ele da tela com tudo verde. O que se mede é que entre o guard mais
    // próximo ANTES do call site e o próprio call site não há FECHAMENTO de bloco JSX.
    const codigo = codigoDe(fontePage())
    const i = codigo.indexOf("<LogoDaEmpresa")
    expect(i, "call site de <LogoDaEmpresa /> no código").toBeGreaterThanOrEqual(0)
    const guard = codigo.lastIndexOf(GUARD, i)
    expect(guard, "o guard `org && !orgFalhou` antes do call site").toBeGreaterThanOrEqual(0)
    expect(codigo.slice(guard, i), "nada fecha o ramo entre o guard e o call site").not.toContain(
      ")}",
    )
  })

  it("ALCANCE — e o ramo mora no card `Identidade`, que é onde a AC8 o coloca", () => {
    const recorte = trechoDelimitado(
      codigoDe(fontePage()),
      '<Cartao titulo="Identidade">',
      "</Cartao>",
    )
    expect(recorte, "recorte do card Identidade").not.toBe("")
    expect(ocorrenciasNoCodigo(recorte, "<LogoDaEmpresa")).toBe(1)
  })

  it("o componente importa as decisões do módulo com carrasco, e não cópias locais", () => {
    // Sem isto, um `validarArquivoDeLogo` definido dentro do próprio `.tsx` — de volta ao ponto
    // cego do vitest — satisfaria as âncoras de uso abaixo com exatamente o mesmo texto.
    const importes = [
      ...fonteComponente().matchAll(
        /import \{[^}]*\} from "@web\/lib\/tenancy\/console-logo-empresa"/g,
      ),
    ]
    expect(importes, "import de `console-logo-empresa` em logo-empresa.tsx").toHaveLength(1)
    for (const simbolo of [
      "AVISO_DE_QUE_ISTO_SO_GUARDA",
      "avisoDeArquivoNaoRemovido",
      "decidirDesfechoDoLogo",
      "urlDePreVisualizacao",
      "validarArquivoDeLogo",
    ]) {
      expect(importes[0]![0], simbolo).toContain(simbolo)
    }
  })

  it("e as CHAMA — import sobrevive à remoção do uso", () => {
    // O outro sentido do mutante: a função pode continuar importada, perfeita e verde no seu
    // próprio arquivo de teste, enquanto o componente decide sozinho no lugar dela.
    const fonte = fonteComponente()
    for (const chamada of [
      "validarArquivoDeLogo(",
      "decidirDesfechoDoLogo(",
      "urlDePreVisualizacao(",
      "avisoDeArquivoNaoRemovido(",
    ]) {
      expect(ocorrenciasNoCodigo(fonte, chamada), chamada).toBe(1)
    }
  })

  it("AC9 — o aviso é IMPRESSO, e depois do botão de envio", () => {
    // Duas coisas, e as duas são a AC: que a frase apareça (uma vez, em código, não em
    // comentário) e que ela apareça ABAIXO do botão — um aviso acima do botão é lido antes de
    // haver o que avisar.
    const codigo = codigoDe(fonteComponente())
    expect(codigo.split("{AVISO_DE_QUE_ISTO_SO_GUARDA}").length - 1).toBe(1)
    const botao = codigo.indexOf('"Enviar logo"')
    const aviso = codigo.indexOf("{AVISO_DE_QUE_ISTO_SO_GUARDA}")
    expect(botao, "o rótulo do botão de envio").toBeGreaterThanOrEqual(0)
    expect(aviso).toBeGreaterThan(botao)
  })

  it("AC8 — o placeholder de 'sem logo' é NEUTRO, e nunca a marca da Trifold", () => {
    // Mostrar a marca da Trifold aqui sugeriria, erradamente, que é ela que o cliente vê por causa
    // deste cadastro — que é exatamente o que a AC9 nega. Medido no CÓDIGO: o docblock do arquivo
    // fala de "Trifold" de propósito, e um `toContain` no arquivo inteiro reprovaria por isso.
    const codigo = codigoDe(fonteComponente())
    expect(codigo).toContain("sem logo")
    expect(codigo).not.toContain("Trifold")
  })
})
