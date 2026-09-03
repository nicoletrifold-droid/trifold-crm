/**
 * Story 900-65 · AC6 + AC10 — as réguas do gate por host, **derivadas do filesystem**.
 *
 * ## O que é medido, e de onde vem cada número
 *
 * A lista de rotas do produto **não** é escrita à mão em lugar nenhum deste arquivo: ela é a
 * varredura de `packages/web/src/app/**` atrás de `page.tsx` e `route.ts`, no mesmo idioma de
 * `platform-query-scan.test.ts` e `dashboard-platform-boundary.test.ts`. Uma lista humana passa
 * verde para sempre e protege cada vez menos: a rota nº 480, criada amanhã por outra story, tem
 * que nascer coberta.
 *
 * ## Duas camadas, dois alfabetos — e o furo mora no que só uma delas vê
 *
 * A conversão atravessa duas representações, e elas **não** têm o mesmo alfabeto:
 *
 * | Camada | Delimitador | Alfabeto de um segmento (medido nesta árvore) |
 * |---|---|---|
 * | **Caminho de arquivo**, relativo a `src/app`, normalizado para `/` | `/` (POSIX; `path.sep` é `/` nas plataformas de CI e de dev deste repo) | `[A-Za-z0-9._-]+` **ou** `[...]` (parâmetro dinâmico) **ou** `(...)` (grupo de rota). Medidos hoje: 333 segmentos distintos, zero fora dessas três formas |
 * | **Pathname de rota** | `/` | `[A-Za-z0-9._-]+` e **nada mais** — nenhum `[`, `]`, `(`, `)`, `@` ou `_` sobrevive à conversão |
 *
 * As formas que **só a camada de arquivo enxerga** são exatamente onde uma régua ingênua fica
 * cega, porque elas somem no pathname sem deixar rastro:
 * - `(grupo)` — desaparece da URL. Hoje há **zero** nesta árvore, então a árvore real não exercita
 *   essa linha do conversor; ela é coberta pelos casos sintéticos de `pathnameDeArquivo` abaixo.
 * - `_privado` e `@slot` — o Next **não** roteia o primeiro e roteia o segundo como paralelo. Os
 *   dois virariam segmento de URL na conversão ingênua, produzindo um pathname que não existe. Há
 *   zero deles hoje e a régua **falha** se aparecer um, em vez de inventar um pathname.
 *
 * ## Esta régua lê o FILESYSTEM, não texto-fonte
 *
 * A pergunta que ela faz é "que arquivos de rota existem", respondida por `readdirSync` — comentário
 * nenhum pode responder por ela. A **única** asserção deste arquivo que lê fonte é a de C5 (o
 * consumo de `destinoDoBounceDeLogin` dentro de `middleware.ts`), e essa lê **código**, com os
 * comentários já removidos por `codigoDe` de `./fonte-scan`. Está marcada como tal no próprio `it`.
 *
 * ## C4 — as mutações que esta régua tem que ser estruturalmente incapaz de sobreviver
 *
 * Rodadas nesta implementação; ver Completion Notes da story para os números de cada uma.
 *
 * 1. **Allowlist → "permite tudo"** (`decidirNoHostAdmin` sempre `"segue"`): mata o laço da AC6.4
 *    (464 rotas deixam de ser `"bloqueado"`) e o C2. A régua não sobrevive porque o laço testa
 *    **TODAS** as rotas de fora, não uma amostra.
 * 2. **Deny-by-default → blocklist** (default `"segue"`, negando só `/dashboard`): mesma morte, e é
 *    o motivo de a asserção do laço ser positiva (`=== "bloqueado"`), nunca `!== "segue"`.
 * 3. **`decidirPorHost` sem o `return` antecipado do papel `"app"`**: mata C3 e C6 — é a mutação
 *    que desviaria o caminho de hoje do CRM da Trifold.
 * 4. **`destinoDoBounceDeLogin` devolvendo `/platform` para `"app"`**: mata C5.
 * 5. **`HOSTS_DE_TENANT` sem `crm.trifold.eng.br`**: mata C6.
 * 6. **Conversor devolvendo lista vazia**: mata C1 (vivacidade e conservação).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { codigoDe } from "./fonte-scan"
import {
  HOSTS_DE_TENANT,
  decidirNoHostAdmin,
  decidirPorHost,
  destinoDoBounceDeLogin,
  normalizarHost,
  papelDoHost,
} from "./papel-do-host"

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(AQUI, "../..") // packages/web/src
const APP = path.join(SRC, "app")

/** Os dois nomes de arquivo que o App Router transforma em rota. Não há `route.tsx` nem `page.ts`. */
const ARQUIVOS_DE_ROTA = new Set(["page.tsx", "route.ts"])

const HOST_ADMIN_DE_TESTE = "admin.judtecnologia.com.br"
const HOST_DE_TENANT = "crm.trifold.eng.br"

/**
 * Todo `page.tsx`/`route.ts` sob `src/app`, como caminho relativo com delimitador `/`.
 *
 * Sem exclusão de `__tests__`/`__mocks__`: um arquivo com esses nomes dentro deles seria uma rota
 * de verdade para o Next, então excluí-los aqui esconderia superfície real. Não há nenhum hoje.
 */
function arquivosDeRota(dir: string, relativo = "", acc: string[] = []): string[] {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = relativo === "" ? entrada.name : `${relativo}/${entrada.name}`
    if (entrada.isDirectory()) {
      arquivosDeRota(path.join(dir, entrada.name), rel, acc)
      continue
    }
    if (ARQUIVOS_DE_ROTA.has(entrada.name)) acc.push(rel)
  }
  return acc
}

/**
 * Caminho de arquivo → pathname de rota. Função **pura**, exercitada tanto pela árvore real quanto
 * pelos casos sintéticos abaixo (que são a única cobertura das formas com zero ocorrência hoje).
 *
 * - `[id]`, `[...slug]`, `[[...slug]]` → um valor concreto (`x`);
 * - `(grupo)` → some;
 * - `_privado` e `@slot` → **lança**. Fail-closed: inventar um pathname para um segmento que a URL
 *   não tem é como esta régua ficaria verde medindo uma rota que não existe.
 */
export function pathnameDeArquivo(relativo: string): string {
  const segmentos = relativo.split("/")
  segmentos.pop() // o nome do arquivo (`page.tsx`/`route.ts`) não é segmento de URL
  const rota: string[] = []
  for (const seg of segmentos) {
    if (seg.startsWith("(") && seg.endsWith(")")) continue
    if (seg.startsWith("[") && seg.endsWith("]")) {
      rota.push("x")
      continue
    }
    if (seg.startsWith("_") || seg.startsWith("@")) {
      throw new Error(
        `segmento "${seg}" em "${relativo}" só existe na camada de ARQUIVO (privado/paralelo); ` +
          `a conversão para pathname precisa de decisão explícita antes de esta régua voltar ao verde`
      )
    }
    rota.push(seg)
  }
  return "/" + rota.join("/")
}

function ehDePlataforma(pathname: string): boolean {
  return (
    pathname === "/platform" ||
    pathname.startsWith("/platform/") ||
    pathname === "/api/platform" ||
    pathname.startsWith("/api/platform/")
  )
}

const ARQUIVOS = arquivosDeRota(APP)
const PATHNAMES = ARQUIVOS.map(pathnameDeArquivo)
const DENTRO = PATHNAMES.filter(ehDePlataforma)
const FORA = PATHNAMES.filter((p) => !ehDePlataforma(p))

/** Guarda o valor real da env e devolve o ambiente ao estado de origem depois de cada teste. */
let envOriginal: string | undefined
beforeEach(() => {
  envOriginal = process.env["PLATFORM_ADMIN_HOSTS"]
  delete process.env["PLATFORM_ADMIN_HOSTS"]
})
afterEach(() => {
  if (envOriginal === undefined) delete process.env["PLATFORM_ADMIN_HOSTS"]
  else process.env["PLATFORM_ADMIN_HOSTS"] = envOriginal
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------------------------
// O conversor, nas formas que a árvore real não tem
// ---------------------------------------------------------------------------------------------

describe("pathnameDeArquivo — as formas que só a camada de ARQUIVO enxerga", () => {
  it("converte parâmetro, catch-all e catch-all opcional para um valor concreto", () => {
    expect(pathnameDeArquivo("page.tsx")).toBe("/")
    expect(pathnameDeArquivo("dashboard/page.tsx")).toBe("/dashboard")
    expect(pathnameDeArquivo("api/platform/orgs/[id]/route.ts")).toBe("/api/platform/orgs/x")
    expect(pathnameDeArquivo("api/files/[...path]/route.ts")).toBe("/api/files/x")
    expect(pathnameDeArquivo("blog/[[...slug]]/page.tsx")).toBe("/blog/x")
  })

  it("remove o grupo de rota — zero ocorrências na árvore real, então este é o único carrasco", () => {
    expect(pathnameDeArquivo("(marketing)/sobre/page.tsx")).toBe("/sobre")
    expect(pathnameDeArquivo("(a)/(b)/page.tsx")).toBe("/")
  })

  it("recusa segmento privado ou paralelo em vez de inventar um pathname", () => {
    expect(() => pathnameDeArquivo("dashboard/_components/page.tsx")).toThrow(/camada de ARQUIVO/)
    expect(() => pathnameDeArquivo("dashboard/@modal/page.tsx")).toThrow(/camada de ARQUIVO/)
  })
})

// ---------------------------------------------------------------------------------------------
// C1 — vivacidade e cardinalidade das DUAS partições, em duas dimensões
// ---------------------------------------------------------------------------------------------

describe("C1 — a varredura enxergou a árvore (vivacidade, cardinalidade, conservação)", () => {
  it("as duas partições têm cardinalidade declarada e nenhuma delas está vazia", () => {
    // Medido em 2026-09-03 contra `origin/main`: 479 arquivos de rota = 15 dentro + 464 fora
    // (138 páginas + 326 handlers fora de `/platform`). Os pisos abaixo são folgados de
    // propósito — os números crescem — mas nenhum deles é zero, e é o zero que aprova tudo.
    expect(ARQUIVOS.length).toBeGreaterThan(400)
    expect(DENTRO.length).toBeGreaterThanOrEqual(10)
    expect(FORA.length).toBeGreaterThan(100)
    expect(DENTRO.length).toBeGreaterThan(0)
    expect(FORA.length).toBeGreaterThan(0)
  })

  it("a partição é exaustiva e disjunta — conservação, não só contagem", () => {
    expect(DENTRO.length + FORA.length).toBe(ARQUIVOS.length)
    expect(PATHNAMES.length).toBe(ARQUIVOS.length)
    expect(DENTRO.every(ehDePlataforma)).toBe(true)
    expect(FORA.some((p) => p.startsWith("/platform"))).toBe(false)
  })

  it("nenhum pathname é produzido duas vezes (dois arquivos de rota na mesma pasta é erro do Next)", () => {
    // Segunda dimensão, independente da contagem: um conversor que colapsasse tudo em `/x`
    // manteria os 479, e morreria aqui.
    expect(new Set(PATHNAMES).size).toBe(PATHNAMES.length)
  })

  it("os pathnames respeitam o alfabeto declarado — nada da camada de arquivo vazou", () => {
    const forados = PATHNAMES.filter((p) => !/^\/$|^(\/[A-Za-z0-9._-]+)+$/.test(p))
    expect(forados).toEqual([])
  })

  it("o produto tem largura — as superfícies de topo estão todas representadas", () => {
    // Terceira dimensão: a contagem sozinha não distingue "464 rotas do produto inteiro" de
    // "464 rotas de um diretório só". Estes são os segmentos de topo medidos hoje.
    const topo = new Set(FORA.map((p) => p.split("/")[1] ?? ""))
    for (const esperado of [
      "agendar",
      "api",
      "auth",
      "broker",
      "cliente",
      "dashboard",
      "formulario",
      "login",
      "pasta",
      "portal-viewer",
    ]) {
      expect(topo.has(esperado)).toBe(true)
    }
    expect(topo.size).toBeGreaterThanOrEqual(10)
  })
})

// ---------------------------------------------------------------------------------------------
// AC6.4 / AC6.5 — o laço sobre TODAS as rotas, nos dois lados da partição
// ---------------------------------------------------------------------------------------------

describe("no host admin, a allowlist decide todas as rotas reais", () => {
  beforeEach(() => {
    process.env["PLATFORM_ADMIN_HOSTS"] = HOST_ADMIN_DE_TESTE
  })

  it("toda rota SOB /platform segue", () => {
    const desviantes = DENTRO.filter((p) => decidirNoHostAdmin({ pathname: p }).tipo !== "segue")
    expect(desviantes).toEqual([])
    expect(DENTRO.length).toBeGreaterThanOrEqual(10) // o laço acima não rodou sobre lista vazia
  })

  it("toda rota FORA de /platform é bloqueada, exceto as quatro nomeadas na allowlist", () => {
    const naoBloqueadas = FORA.filter((p) => decidirNoHostAdmin({ pathname: p }).tipo !== "bloqueado")
    // Literal âncora, não derivado da allowlist da implementação: se uma rota nova cair fora do
    // deny-by-default, esta régua fica vermelha e exige uma decisão humana. É o ponto do gate.
    expect([...new Set(naoBloqueadas)].sort()).toEqual([
      "/",
      "/auth/callback",
      "/login",
      "/reset-senha",
    ])
    const bloqueadas = FORA.filter((p) => decidirNoHostAdmin({ pathname: p }).tipo === "bloqueado")
    expect(bloqueadas.length).toBe(FORA.length - naoBloqueadas.length)
    expect(bloqueadas.length).toBeGreaterThan(100)
  })

  it("o gate completo (host + caminho) concorda com a allowlist no host admin", () => {
    const discordantes = PATHNAMES.filter(
      (p) =>
        decidirPorHost({ host: HOST_ADMIN_DE_TESTE, pathname: p }).tipo !==
        decidirNoHostAdmin({ pathname: p }).tipo
    )
    expect(discordantes).toEqual([])
    expect(PATHNAMES.length).toBeGreaterThan(400)
  })
})

// ---------------------------------------------------------------------------------------------
// C2 — controle positivo nomeado
// ---------------------------------------------------------------------------------------------

describe("C2 — controle positivo nomeado (independente da varredura)", () => {
  it("as nove superfícies do produto são bloqueadas no host admin", () => {
    process.env["PLATFORM_ADMIN_HOSTS"] = HOST_ADMIN_DE_TESTE
    for (const pathname of [
      "/dashboard",
      "/broker",
      "/cliente/x",
      "/pasta/x",
      "/agendar/x",
      "/formulario/x",
      "/portal-viewer/x",
      "/api/cron/keep-alive",
      "/api/webhook/whatsapp",
    ]) {
      expect(decidirPorHost({ host: HOST_ADMIN_DE_TESTE, pathname }).tipo).toBe("bloqueado")
    }
  })

  it("a fronteira do prefixo é o caractere `/`, não o começo do texto", () => {
    process.env["PLATFORM_ADMIN_HOSTS"] = HOST_ADMIN_DE_TESTE
    expect(decidirNoHostAdmin({ pathname: "/platform" }).tipo).toBe("segue")
    expect(decidirNoHostAdmin({ pathname: "/platform/orgs" }).tipo).toBe("segue")
    expect(decidirNoHostAdmin({ pathname: "/platformx" }).tipo).toBe("bloqueado")
    expect(decidirNoHostAdmin({ pathname: "/api/platformx/orgs" }).tipo).toBe("bloqueado")
    expect(decidirNoHostAdmin({ pathname: "/authx" }).tipo).toBe("bloqueado")
    expect(decidirNoHostAdmin({ pathname: "/loginx" }).tipo).toBe("bloqueado")
  })

  it("a raiz do host admin é REESCRITA para o console, não redirecionada", () => {
    process.env["PLATFORM_ADMIN_HOSTS"] = HOST_ADMIN_DE_TESTE
    expect(decidirPorHost({ host: HOST_ADMIN_DE_TESTE, pathname: "/" })).toEqual({
      tipo: "reescreve",
      para: "/platform",
    })
  })
})

// ---------------------------------------------------------------------------------------------
// AC1 — leitura da env, normalização do host
// ---------------------------------------------------------------------------------------------

describe("AC1 — papelDoHost", () => {
  it("sem a env, todo host é `app` — inclusive o próprio host admin", () => {
    expect(process.env["PLATFORM_ADMIN_HOSTS"]).toBeUndefined()
    for (const host of [HOST_ADMIN_DE_TESTE, HOST_DE_TENANT, "localhost:3000", null, "", "  "]) {
      expect(papelDoHost(host)).toBe("app")
    }
  })

  it("env vazia ou só com vírgulas continua sendo conjunto vazio", () => {
    for (const valor of ["", "   ", ",", " , , "]) {
      process.env["PLATFORM_ADMIN_HOSTS"] = valor
      expect(papelDoHost(HOST_ADMIN_DE_TESTE)).toBe("app")
    }
  })

  it("compara sem distinguir maiúsculas, dos dois lados, e ignora a porta", () => {
    process.env["PLATFORM_ADMIN_HOSTS"] = " ADMIN.JudTecnologia.com.BR , outro.example.com "
    expect(papelDoHost("admin.judtecnologia.com.br")).toBe("admin")
    expect(papelDoHost("Admin.JudTecnologia.COM.br")).toBe("admin")
    expect(papelDoHost("admin.judtecnologia.com.br:443")).toBe("admin")
    expect(papelDoHost("outro.example.com")).toBe("admin")
    expect(papelDoHost("nao.listado.com")).toBe("app")
  })

  it("normalizarHost tira porta e caixa, e preserva o literal IPv6", () => {
    expect(normalizarHost("EXEMPLO.com:3000")).toBe("exemplo.com")
    expect(normalizarHost("[::1]:3000")).toBe("[::1]")
    expect(normalizarHost(null)).toBe("")
  })

  it("lê a env a CADA chamada, sem cache de módulo", () => {
    expect(papelDoHost(HOST_ADMIN_DE_TESTE)).toBe("app")
    process.env["PLATFORM_ADMIN_HOSTS"] = HOST_ADMIN_DE_TESTE
    expect(papelDoHost(HOST_ADMIN_DE_TESTE)).toBe("admin")
    delete process.env["PLATFORM_ADMIN_HOSTS"]
    expect(papelDoHost(HOST_ADMIN_DE_TESTE)).toBe("app")
  })
})

// ---------------------------------------------------------------------------------------------
// C3 — o controle NEGATIVO: sem a env, zero desvio, e a allowlist nem é consultada
// ---------------------------------------------------------------------------------------------

describe("C3 — sem PLATFORM_ADMIN_HOSTS o gate é inerte (AC9)", () => {
  const HOSTS = [HOST_DE_TENANT, HOST_ADMIN_DE_TESTE, "localhost:3000", "qualquer.coisa", null]

  it("toda rota, em todo host, segue — e nenhum host é `admin`", () => {
    expect(process.env["PLATFORM_ADMIN_HOSTS"]).toBeUndefined()
    const desviantes: string[] = []
    for (const host of HOSTS) {
      expect(papelDoHost(host)).toBe("app")
      for (const pathname of PATHNAMES) {
        if (decidirPorHost({ host, pathname }).tipo !== "segue") desviantes.push(`${host}${pathname}`)
      }
    }
    expect(desviantes).toEqual([])
    expect(PATHNAMES.length * HOSTS.length).toBeGreaterThan(2000) // o laço rodou de verdade
  })

  it("a allowlist NÃO é consultada — provado pela divergência, não assumido", () => {
    // Se `decidirPorHost` consultasse `decidirNoHostAdmin`, estas 400+ rotas voltariam
    // "bloqueado". Elas voltam "segue". A única forma de as duas respostas divergirem é o
    // `return` antecipado do papel "app" — que é exatamente o que a AC9 exige.
    const bloqueariam = FORA.filter((p) => decidirNoHostAdmin({ pathname: p }).tipo === "bloqueado")
    expect(bloqueariam.length).toBeGreaterThan(100)
    const seguem = bloqueariam.filter(
      (p) => decidirPorHost({ host: HOST_ADMIN_DE_TESTE, pathname: p }).tipo === "segue"
    )
    expect(seguem.length).toBe(bloqueariam.length)
  })
})

// ---------------------------------------------------------------------------------------------
// C5 — o destino do bounce de /login (AC5)
// ---------------------------------------------------------------------------------------------

describe("C5 — destino do bounce de /login", () => {
  it("é /platform no host admin e /dashboard no host de app, na mesma asserção", () => {
    expect([destinoDoBounceDeLogin("admin"), destinoDoBounceDeLogin("app")]).toEqual([
      "/platform",
      "/dashboard",
    ])
  })

  it("o middleware CONSOME a função — e não sobrou destino fixo `/dashboard` no bounce", () => {
    // ⚠️ Única asserção deste arquivo que lê fonte. Ela lê **código**: `codigoDe` remove
    // comentário de linha, de bloco e de bloco JSX antes de medir, então uma menção em prosa
    // (inclusive as três linhas de comentário que a Story 900-65 acrescentou logo acima do
    // bounce) não satisfaz nem viola nada aqui.
    const fonte = fs.readFileSync(path.join(SRC, "lib/supabase/middleware.ts"), "utf8")
    const codigo = codigoDe(fonte)
    expect(codigo).toContain("destinoDoBounceDeLogin(papelDoHost(request.headers.get(\"host\")))")
    expect(codigo).not.toContain('url.pathname = "/dashboard"')
    expect(codigo).not.toContain("nextUrl.hostname")
  })
})

// ---------------------------------------------------------------------------------------------
// AC3/AC4/AC7 — a ORDEM no proxy: bloqueio antes de updateSession
// ---------------------------------------------------------------------------------------------

describe("AC3/AC4/AC7 — a forma do proxy", () => {
  // ⚠️ Segunda e última asserção que lê fonte, e também lê **código** (`codigoDe`). Ela mede
  // POSIÇÃO NA PILHA, não presença de texto: a AC7 não é "o 404 existe", é "o 404 acontece
  // ANTES de `updateSession`". Cada índice é conferido contra `-1` primeiro, porque um recorte
  // que não encontrou o alvo devolveria `-1` e faria a comparação de ordem passar por acidente.
  const codigo = codigoDe(fs.readFileSync(path.join(SRC, "proxy.ts"), "utf8"))

  const posicao = (agulha: string): number => {
    const i = codigo.indexOf(agulha)
    expect(i, `ausente no código de proxy.ts: ${agulha}`).toBeGreaterThan(-1)
    return i
  }

  it("lê o host do CABEÇALHO, nunca de nextUrl.hostname", () => {
    posicao('decidirPorHost({')
    posicao('request.headers.get("host")')
    expect(codigo).not.toContain("nextUrl.hostname")
  })

  it("a decisão, o 404 nu e o rewrite vêm ANTES da chamada a updateSession", () => {
    const chamadas = codigo.split("updateSession(request)").length - 1
    expect(chamadas).toBe(1)
    const fim = posicao("updateSession(request)")
    expect(posicao("decidirPorHost({")).toBeLessThan(fim)
    expect(posicao("status: 404")).toBeLessThan(fim)
    expect(posicao("NextResponse.rewrite(")).toBeLessThan(fim)
  })

  it("o 404 tem corpo NU e o cabeçalho de não-indexação", () => {
    posicao("new NextResponse(null, {")
    posicao('"X-Robots-Tag": "noindex, nofollow"')
    // `not-found` renderizado passaria pelo layout raiz e vazaria a marca do inquilino.
    expect(codigo).not.toContain("notFound")
  })
})

// ---------------------------------------------------------------------------------------------
// C6 — AC10: host de inquilino nunca vira host admin
// ---------------------------------------------------------------------------------------------

describe("C6 — AC10: host de tenant é recusado mesmo se a env mandar", () => {
  it("recusa o host de tenant E promove o host da Jud, na mesma asserção", () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {})
    process.env["PLATFORM_ADMIN_HOSTS"] = `${HOST_DE_TENANT},${HOST_ADMIN_DE_TESTE}`
    // As duas juntas: a primeira sozinha ficaria verde se a função parasse de funcionar.
    expect([papelDoHost(HOST_DE_TENANT), papelDoHost(HOST_ADMIN_DE_TESTE)]).toEqual([
      "app",
      "admin",
    ])
    expect(erro).toHaveBeenCalledWith(
      "[900-65] host de tenant recusado em PLATFORM_ADMIN_HOSTS",
      { host: HOST_DE_TENANT }
    )
  })

  it("recusa também com caixa diferente e com porta", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    process.env["PLATFORM_ADMIN_HOSTS"] = "CRM.Trifold.ENG.br:443"
    expect(papelDoHost(HOST_DE_TENANT)).toBe("app")
    expect(papelDoHost("CRM.TRIFOLD.ENG.BR")).toBe("app")
  })

  it("no host de tenant a allowlist não é consultada — as 464 rotas do CRM seguem", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    process.env["PLATFORM_ADMIN_HOSTS"] = `${HOST_DE_TENANT},${HOST_ADMIN_DE_TESTE}`
    const bloqueariam = FORA.filter((p) => decidirNoHostAdmin({ pathname: p }).tipo === "bloqueado")
    expect(bloqueariam.length).toBeGreaterThan(100)
    const desviantes = bloqueariam.filter(
      (p) => decidirPorHost({ host: HOST_DE_TENANT, pathname: p }).tipo !== "segue"
    )
    expect(desviantes).toEqual([])
  })

  it("o host da Trifold está na constante, com um nome só", () => {
    expect(HOSTS_DE_TENANT).toContain(HOST_DE_TENANT)
    expect(HOSTS_DE_TENANT.length).toBeGreaterThan(0)
  })
})
