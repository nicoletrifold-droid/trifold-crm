/**
 * Story 900-56 (defeito da porta de entrada) — METADE B da régua: **o caminho de ida existe na
 * tela, e só para quem é da plataforma**.
 *
 * Antes desta mudança, `grep -rn '/platform' packages/web/src` fora de `src/app/platform/`
 * devolvia só comentários e rotas de API: o console tinha `← Voltar ao CRM` e nenhum caminho de
 * ida. O painel existia e era, de fora, indistinguível de inexistente.
 *
 * ## Por que `renderToStaticMarkup` e não Testing Library
 *
 * O `include` do `vitest.config.ts` casa **`*.test.ts`** — `.test.tsx` existe no repositório e
 * nunca roda. E não há `environment: "jsdom"` configurado nem `@testing-library/react` instalado;
 * adicionar qualquer um dos dois seria dependência nova numa correção de defeito. `react-dom/server`
 * já está aqui e roda em node: renderiza o componente REAL (não uma cópia da lógica) e devolve o
 * HTML que o servidor manda para o navegador — que é exatamente a superfície onde "o usuário comum
 * não pode nem descobrir a rota" precisa ser verdade. O arquivo é `.ts` e usa `createElement`
 * em vez de JSX pela mesma razão do sufixo.
 *
 * ⚠️ O que este arquivo NÃO prova: geometria. `isVisible()` do Playwright responde `true` para
 * elemento recortado por `overflow-hidden` de ancestral (medido na 900-58), então nem ele serviria
 * — a prova de alcançabilidade na tela é `elementFromPoint`, e está registrada na story, não aqui.
 *
 * ## As duas metades, e por que os conjuntos de morte são DISJUNTOS
 *
 *   • **metade 1** — com `atalhoDoConsole` presente, o item aparece (desktop e mobile).
 *   • **metade 2** — sem ele, NADA aparece: nem o item, nem a rota em lugar nenhum do HTML.
 *
 * Se a mesma mutação matasse as duas, a régua não distinguiria "protegi o item" de "escondi o
 * item de todo mundo" — que é o estado de antes da story, e ele não pode passar.
 */

import { describe, it, expect, vi } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
// A prop do render vem da função de PRODUÇÃO, não de um literal escrito aqui: um literal
// deixaria a régua verde no dia em que `atalhoDoConsole()` passasse a devolver outra coisa.
// O comportamento dela é medido em `lib/platform.test.ts`.
import { atalhoDoConsole } from "@web/lib/platform"
import { callSiteDe, codigoDe, ocorrenciasNoCodigo } from "@web/lib/tenancy/fonte-scan"

vi.mock("next/link", () => ({
  default: ({ children, ...resto }: Record<string, unknown> & { children?: unknown }) =>
    createElement("a", resto as Record<string, unknown>, children as never),
}))
// Story 900-64 (AC13) — o mock repassa `className`. Enquanto ele só repassava `src`/`alt`, a
// classe NUNCA chegava ao HTML: uma asserção "o logo do cliente não tem `brightness-0`" passaria
// idêntica com a `className` deixada incondicional no componente. A régua nasceria verde
// desligada. A contraprova está registrada no Dev Agent Record da story.
//
// `onError` continua sendo descartado, e isso é uma LACUNA NOMEADA (AC4): `renderToStaticMarkup`
// não executa handler de evento, então nem repassá-lo produziria carrasco. A EXECUÇÃO da fiação
// `onError → setImgFailed → resolveSidebarBrand` segue sem carrasco neste arquivo; o que ganhou
// régua é a DELEÇÃO e a REALOCAÇÃO das duas linhas — ver o último `describe`, "(AC4 via AC12)".
vi.mock("next/image", () => ({
  default: ({ src, alt, className }: { src: string; alt: string; className?: string }) =>
    createElement("img", { src, alt, className }),
}))
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }))
vi.mock("./logout-button", () => ({
  LogoutButton: () => createElement("button", null, "Sair"),
}))
vi.mock("@web/components/theme-toggle", () => ({
  ThemeToggle: () => createElement("button", null, "tema"),
}))

const { SidebarNav } = await import("./sidebar-nav")

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(AQUI, "../..") // packages/web/src
const FONTE_DA_BARRA = path.join(SRC, "components/layout/sidebar-nav.tsx")
const LAYOUT_DO_CRM = path.join(SRC, "app/dashboard/layout.tsx")
// Story 900-64 — o SEGUNDO consumidor do componente. O arquivo só conhecia o do dashboard, e uma
// régua que vigia um dos dois layouts deixa o outro sair sem props e sem vermelho.
const LAYOUT_DO_CORRETOR = path.join(SRC, "app/broker/layout.tsx")

const ITENS = [
  { href: "/dashboard", label: "Dashboard", icon: null },
  { href: "/dashboard/leads", label: "Leads", icon: null },
]

function renderizar(
  atalho?: { href: string; label: string } | null,
  marca?: { orgName?: string | null; orgLogoUrl?: string | null }
): string {
  return renderToStaticMarkup(
    createElement(SidebarNav, {
      items: ITENS,
      userName: "Marcos Teste",
      userRole: "admin",
      basePath: "/dashboard",
      ...(atalho === undefined ? {} : { atalhoDoConsole: atalho }),
      ...(marca ?? {}),
    })
  )
}

/**
 * As tags `<img …>` do HTML, em ordem de documento: `[0]` é o da barra lateral do desktop,
 * `[1]` é o da barra superior do mobile.
 *
 * Recortar a tag é o que impede a família de defeito de `toContain` sobre o documento inteiro:
 * `not.toContain("brightness-0")` no HTML todo seria satisfeito por qualquer outro elemento da
 * página, e `toContain("object-contain")` também. Quem chama afirma o COMPRIMENTO antes de
 * indexar — um recorte que não achou nada nunca pode virar aprovação.
 */
function imagens(html: string): string[] {
  return [...html.matchAll(/<img[^>]*>/g)].map((m) => m[0])
}

/** Quantas vezes `agulha` aparece em `texto`. */
function ocorrencias(texto: string, agulha: string): number {
  return texto.split(agulha).length - 1
}

describe("vivacidade — o render de fato acontece", () => {
  it("o HTML tem o conteúdo normal da barra, com e sem o atalho", () => {
    // Sem isto, "zero ocorrências de /platform" seria indistinguível de "o componente estourou e
    // o HTML é vazio" — e a metade 2 ficaria verde por acidente para sempre.
    for (const [rotulo, html] of [
      ["com atalho", renderizar(atalhoDoConsole(true))],
      ["sem atalho", renderizar(null)],
    ] as const) {
      expect(html.length, rotulo).toBeGreaterThan(500)
      expect(html, rotulo).toContain("Marcos Teste")
      expect(html, rotulo).toContain("/dashboard/leads")
      expect(html, rotulo).toContain("Sair")
    }
  })
})

describe("METADE 1 — o platform admin VÊ o caminho de ida", () => {
  const html = renderizar(atalhoDoConsole(true))

  it("o rodapé da barra lateral tem o link para o console", () => {
    expect(html).toContain('data-atalho-console="sidebar"')
  })

  it("a barra superior do mobile também tem — o desktop sozinho deixaria o celular sem saída", () => {
    expect(html).toContain('data-atalho-console="mobile"')
  })

  it("os dois apontam para a rota do console e carregam o rótulo", () => {
    expect(ocorrencias(html, 'href="/platform"')).toBe(2)
    expect(html).toContain("Painel da plataforma")
  })

  it("o atalho fica no rodapé, ao lado do `Sair` — não no meio dos módulos do CRM", () => {
    // O lugar importa: entre os itens de módulo, o atalho pareceria um módulo do CRM. Medido
    // pela ordem DENTRO da barra lateral do desktop — o HTML tem três blocos (aside, topo do
    // mobile, barra inferior do mobile) e os itens de navegação se repetem nos três, então
    // medir a ordem no documento inteiro mediria o bloco errado.
    const aside = html.slice(html.indexOf("<aside"), html.indexOf("</aside>"))
    expect(aside.length).toBeGreaterThan(500) // fail-closed: recorte vazio aprovaria tudo
    const iModulo = aside.lastIndexOf("/dashboard/leads")
    const iAtalho = aside.indexOf('data-atalho-console="sidebar"')
    const iSair = aside.indexOf("Sair")
    expect(iModulo).toBeGreaterThan(-1)
    expect(iAtalho).toBeGreaterThan(iModulo)
    expect(iSair).toBeGreaterThan(iAtalho)
  })
})

describe("METADE 2 — o usuário comum não vê o item NEM descobre a rota", () => {
  it("`atalhoDoConsole` nulo: nenhum marcador e nenhuma ocorrência da rota no HTML", () => {
    const html = renderizar(null)
    expect(html).not.toContain("data-atalho-console")
    expect(ocorrencias(html, "/platform")).toBe(0)
    expect(html).not.toContain("Painel da plataforma")
  })

  it("prop AUSENTE (não `null`): mesmo resultado", () => {
    // O rótulo é a ausência de verdade. Um layout que simplesmente não passa a prop é o caso
    // real de toda tela que não fez a conta — e ele não pode cair no ramo do atalho.
    const html = renderizar(undefined)
    expect(html).not.toContain("data-atalho-console")
    expect(ocorrencias(html, "/platform")).toBe(0)
  })

  it("a rota não está no TEXTO-FONTE do componente — o bundle do cliente não a carrega", () => {
    // Este componente é `"use client"`: um literal `/platform` aqui viajaria para o navegador de
    // todo usuário logado, e esconder o item esconderia só o pixel. O par `{href,label}` vem
    // pronto do servidor por isso.
    const fonte = fs.readFileSync(FONTE_DA_BARRA, "utf8")
    expect(fonte.length).toBeGreaterThan(1000) // vivacidade: o arquivo foi mesmo lido
    expect(ocorrenciasNoCodigo(fonte, '"/platform"')).toBe(0)
    expect(ocorrenciasNoCodigo(fonte, "'/platform'")).toBe(0)
    expect(ocorrenciasNoCodigo(fonte, "`/platform")).toBe(0)
  })
})

describe("a ligação no layout do CRM — quem calcula o booleano", () => {
  /**
   * O elo que o render não alcança: `app/dashboard/layout.tsx` é um server component `async` com
   * dezenas de consultas, e não é renderizável aqui. A mutação que sobraria sem esta régua é a
   * pior possível — passar o atalho INCONDICIONALMENTE, vazando o painel para as 113 pessoas do
   * CRM — e ela deixaria as duas metades acima verdes.
   *
   * Por isso a asserção é sobre a EXPRESSÃO inteira, não sobre a presença do nome: trocar o
   * argumento (`atalhoDoConsole(true)`, outra fonte de verdade, ou o objeto direto) apaga a
   * forma e reprova. O recorte é o call site do `<SidebarNav …/>` e o texto passa por
   * `codigoDe`, então nem um comentário citando a linha nem um segundo call site a satisfazem.
   */
  const LIGACAO = "atalhoDoConsole={atalhoDoConsole(await isPlatformAdmin(user.id))}"

  it("o layout passa o atalho calculado a partir de `isPlatformAdmin` do usuário da sessão", () => {
    const fonte = fs.readFileSync(LAYOUT_DO_CRM, "utf8")
    const callSite = callSiteDe(fonte, "<SidebarNav")
    expect(callSite.length).toBeGreaterThan(0) // fail-closed: recorte vazio reprovaria em silêncio
    expect(callSite).toContain(LIGACAO)
  })

  it("a ligação aparece UMA vez no código do layout — nem zero, nem duplicada", () => {
    const fonte = fs.readFileSync(LAYOUT_DO_CRM, "utf8")
    expect(ocorrenciasNoCodigo(fonte, LIGACAO)).toBe(1)
  })

  it("o layout importa a autoridade de plataforma, e não o caminho de leitura cross-org", () => {
    // `lib/tenancy/platform-guard`/`platform-query` são proibidos em `app/dashboard/**`
    // (`dashboard-platform-boundary.test.ts`, AC9 da 900-51). Esta asserção diz qual módulo é o
    // certo — a outra régua diz quais são os errados, e as duas juntas fecham a pergunta.
    const codigo = codigoDe(fs.readFileSync(LAYOUT_DO_CRM, "utf8"))
    expect(codigo).toContain('from "@web/lib/platform"')
    expect(codigo).not.toContain("lib/tenancy/platform-guard")
    expect(codigo).not.toContain("lib/tenancy/platform-query")
  })
})


/**
 * Story 900-64 — **a marca da empresa aparece no lugar da Trifold**, na barra lateral do CRM e do
 * app do corretor. Login e e-mails transacionais continuam dizendo Trifold para toda empresa, por
 * decisão declarada da story (a org só é conhecida DEPOIS do login; os 10 pontos de chamada de
 * e-mail passam `orgName` literal). Nenhum resumo pode omitir esse qualificador.
 *
 * Estas asserções só medem alguma coisa porque o mock de `next/image` deste arquivo passou a
 * repassar `className` (AC13). Antes disso a classe nunca chegava ao HTML.
 */
describe("Story 900-64 — sem logo da empresa, a marca é a da Trifold, byte a byte como hoje", () => {
  const html = renderizar()

  it("as duas imagens são o asset da Trifold, com as classes de filtro de HOJE", () => {
    const imgs = imagens(html)
    expect(imgs).toHaveLength(2) // fail-closed: sem as duas, nada abaixo mede o que diz medir
    expect(imgs[0]).toBe(
      '<img src="/logo-trifold.webp" alt="Trifold" class="brightness-0 dark:brightness-0 dark:invert"/>'
    )
    expect(imgs[1]).toBe(
      '<img src="/logo-trifold.webp" alt="Trifold" class="dark:brightness-0 dark:invert"/>'
    )
  })

  it("o rótulo de texto ao lado do logo continua na barra do mobile", () => {
    expect(html).toContain(
      '<span class="text-sm font-semibold text-stone-900 dark:text-stone-100">Trifold</span>'
    )
  })

  it("a palavra aparece exatamente 3 vezes: os dois `alt` e o rótulo do mobile", () => {
    // O par desta contagem é o `toBe(0)` do caso com logo. Uma sozinha não distingue "troquei a
    // marca" de "apaguei a barra".
    expect(html.length).toBeGreaterThan(500)
    expect(ocorrencias(html, "Trifold")).toBe(3)
  })

  it.each([
    ["string vazia", ""],
    ["nulo", null],
  ])("`orgLogoUrl` %s não é um logo: a barra segue com a marca da Trifold", (_rotulo, orgLogoUrl) => {
    const semLogo = renderizar(null, { orgName: "Construtora Aurora", orgLogoUrl })
    const imgs = imagens(semLogo)
    expect(imgs).toHaveLength(2)
    for (const img of imgs) expect(img).toContain('src="/logo-trifold.webp"')
    expect(ocorrencias(semLogo, "Construtora Aurora")).toBe(0)
  })
})

describe("Story 900-64 — com logo da empresa, a marca é a dela, sem filtro e dentro da caixa", () => {
  const URL_DO_LOGO =
    "https://xnxvygyfyyyzwhiuoehz.supabase.co/storage/v1/object/public/org-logos/aurora/logo.png?v=0123456789abcdef"
  const html = renderizar(null, { orgName: "Construtora Aurora", orgLogoUrl: URL_DO_LOGO })

  it("as duas imagens são o logo da empresa, com a trava de caixa e sem filtro monocromático", () => {
    const imgs = imagens(html)
    expect(imgs).toHaveLength(2)
    expect(imgs[0]).toBe(
      `<img src="${URL_DO_LOGO}" alt="Construtora Aurora" class="h-auto max-h-12 w-auto max-w-full object-contain"/>`
    )
    expect(imgs[1]).toBe(
      `<img src="${URL_DO_LOGO}" alt="Construtora Aurora" class="h-auto max-h-8 w-auto max-w-32 object-contain"/>`
    )
  })

  it("nenhuma das duas superfícies carrega `brightness-0`/`invert` — nem o desktop nem o mobile", () => {
    // Repete o que o `toBe` acima já implica, de propósito e com outra duração de vida: aquele
    // morre no dia em que a classe de caixa mudar, este continua reprovando o filtro que
    // pintaria de preto o logo colorido de um cliente. O `dark:` do mobile foi o furo que quase
    // sobreviveu à primeira versão da story.
    const imgs = imagens(html)
    expect(imgs).toHaveLength(2)
    for (const [rotulo, img] of [
      ["desktop", imgs[0]],
      ["mobile", imgs[1]],
    ] as const) {
      expect(img, rotulo).not.toContain("brightness-0")
      expect(img, rotulo).not.toContain("invert")
      expect(img, rotulo).toContain("object-contain")
    }
    expect(imgs[0]).toContain("max-h-12") // 48 px dentro do contêiner `h-20` do desktop
    expect(imgs[1]).toContain("max-h-8") //  32 px dentro do contêiner `h-14` do mobile
  })

  it("a marca da Trifold some do HTML inteiro — inclusive o rótulo de texto do mobile", () => {
    expect(html.length).toBeGreaterThan(500) // vivacidade: HTML vazio também teria zero
    expect(html).toContain("Marcos Teste")
    expect(ocorrencias(html, "Trifold")).toBe(0)
    expect(html).not.toContain(">Trifold</span>")
  })

  it("sem nome de empresa, o texto alternativo é genérico — nunca vazio", () => {
    const semNome = renderizar(null, { orgName: null, orgLogoUrl: URL_DO_LOGO })
    const imgs = imagens(semNome)
    expect(imgs).toHaveLength(2)
    for (const img of imgs) expect(img).toContain('alt="Logo da empresa"')
  })
})

describe("Story 900-64 (AC12) — as DUAS ligações de layout", () => {
  /**
   * O elo que o render não alcança, pela mesma razão do `atalhoDoConsole` acima: os dois layouts
   * são server components `async`. Sem esta régua, a mutação "o layout não passa prop nenhuma"
   * deixa o helper e o componente VERDES e a story inteira invisível — exatamente o desfecho que
   * ela existe para evitar.
   *
   * A asserção é sobre a EXPRESSÃO inteira, não sobre a presença do nome da prop: passar outra
   * fonte de verdade (`user.name`, um literal) apaga a forma e reprova. O texto vem de
   * `callSiteDe`/`ocorrenciasNoCodigo`, então nem um comentário citando a linha nem um segundo
   * call site a satisfazem.
   *
   * Um `it` por layout de propósito: os conjuntos de morte precisam ser DISJUNTOS. Apagar a prop
   * de um dos arquivos tem de reprovar só a linha daquele arquivo — senão a régua não distingue
   * "os dois passam" de "um passa".
   */
  const LIGACOES = ["orgName={orgBrand?.name}", "orgLogoUrl={orgBrand?.logo_url}"] as const
  const LAYOUTS = [
    ["o CRM", LAYOUT_DO_CRM],
    ["o app do corretor", LAYOUT_DO_CORRETOR],
  ] as const

  it.each(LAYOUTS)("%s passa nome e logo da empresa no call site da barra", (_rotulo, caminho) => {
    const fonte = fs.readFileSync(caminho, "utf8")
    const callSite = callSiteDe(fonte, "<SidebarNav")
    expect(callSite.length).toBeGreaterThan(0) // fail-closed: recorte vazio aprovaria em silêncio
    expect(ocorrencias(callSite, "<SidebarNav")).toBe(1) // o recorte é UM call site, não dois
    for (const ligacao of LIGACOES) expect(callSite).toContain(ligacao)
  })

  it.each(LAYOUTS)("%s faz cada ligação UMA vez no código — nem zero, nem duplicada", (_rotulo, caminho) => {
    const fonte = fs.readFileSync(caminho, "utf8")
    for (const ligacao of LIGACOES) expect(ocorrenciasNoCodigo(fonte, ligacao)).toBe(1)
  })

  it.each(LAYOUTS)("%s lê `logo_url` da própria org da sessão, sem `.single()`", (_rotulo, caminho) => {
    // O insumo da ligação acima. A projeção sozinha não prova nada (o valor pode ser descartado na
    // fiação) e a fiação sozinha também não compila sem ela — as duas juntas fecham a pergunta.
    // `.maybeSingle()` porque zero linhas não é erro nesta leitura.
    const codigo = codigoDe(fs.readFileSync(caminho, "utf8"))
    expect(codigo).toContain('.select("name, logo_url")')
    // `codigoDe` trima cada linha: a quebra é o que separa esta leitura da de `settings`, que
    // usa `.single()` no MESMO arquivo com o mesmo `.eq`.
    expect(codigo).toContain('.eq("id", user.orgId)\n.maybeSingle()')
  })
})

describe("Story 900-64 (AC4 via AC12) — a fiação `onError` das DUAS imagens", () => {
  /**
   * O que esta régua cobre, e o que ela NÃO cobre — a distinção é a razão de ela existir.
   *
   * NÃO cobre a fiação em EXECUÇÃO. O mock de `next/image` descarta `onError` e
   * `renderToStaticMarkup` não dispara handler de evento: nada neste arquivo prova que
   * `onError → setImgFailed → resolveSidebarBrand` devolve o fallback. A AC4 segue com a lacuna
   * comportamental que a story declarou, e ninguém pode declarar a fiação coberta.
   *
   * COBRE a DELEÇÃO e a REALOCAÇÃO dessa fiação, que até aqui passavam em silêncio. Medido no
   * gate 900.64 e reproduzido: apagar as duas linhas `onError` é uma deleção de 2 linhas que
   * compila (`tsc --noEmit` rc=0 — `setImgFailed` continua ligado no `useState`) e deixava a
   * suíte INTEIRA verde. Um logo de cliente que falhasse ao carregar mostraria imagem quebrada
   * em vez da marca da Trifold, e nenhuma régua do repositório reprovaria.
   *
   * Duas asserções, e não uma, porque CONTAGEM É INVARIANTE SOB MOVER: as duas linhas realocadas
   * para outro elemento mantêm o `2` e recriam o defeito idêntico. A segunda prende cada fiação à
   * imagem da SUA superfície pela linha de `className` que só aquela imagem tem — `codigoDe` junta
   * as linhas de código já trimadas com quebra, o mesmo recorte por adjacência que a leitura de
   * `.maybeSingle()` usa acima.
   *
   * Reordenar os atributos da imagem deixa a segunda asserção VERMELHA sem que haja defeito. É
   * sobra, não falta: falso alarme é visível e se conserta na hora; falso verde é exatamente o que
   * esta régua nasceu para eliminar.
   */
  const FIACAO = "onError={() => setImgFailed(true)}"

  it("a fiação existe DUAS vezes no código — some por inteiro se apagarem as duas linhas", () => {
    const fonte = fs.readFileSync(FONTE_DA_BARRA, "utf8")
    expect(ocorrenciasNoCodigo(fonte, FIACAO)).toBe(2) // desktop e mobile; nenhuma em comentário
  })

  it("cada fiação está presa à imagem da SUA superfície — desktop e mobile", () => {
    const codigo = codigoDe(fs.readFileSync(FONTE_DA_BARRA, "utf8"))
    for (const superficie of ["DESKTOP", "MOBILE"] as const) {
      const classe = `className={brand.isCustom ? CLASSES_LOGO_CLIENTE_${superficie} : CLASSES_LOGO_TRIFOLD_${superficie}}`
      expect(codigo, superficie).toContain(`${classe}\n${FIACAO}`)
    }
  })
})
