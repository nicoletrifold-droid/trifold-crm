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
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => createElement("img", { src, alt }),
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

const ITENS = [
  { href: "/dashboard", label: "Dashboard", icon: null },
  { href: "/dashboard/leads", label: "Leads", icon: null },
]

function renderizar(atalho?: { href: string; label: string } | null): string {
  return renderToStaticMarkup(
    createElement(SidebarNav, {
      items: ITENS,
      userName: "Marcos Teste",
      userRole: "admin",
      basePath: "/dashboard",
      ...(atalho === undefined ? {} : { atalhoDoConsole: atalho }),
    })
  )
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
