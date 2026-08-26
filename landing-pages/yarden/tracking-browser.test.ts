/**
 * Story 86-12 (AC1, AC2, AC3, AC4, AC10, AC11, AC12) — os helpers de tracking do
 * `index.html`.
 *
 * Este runtime não tem bundler: o JS vive inline no HTML e não é importável. Em
 * vez de deixá-lo coberto só por verificação manual, o teste EXTRAI os dois
 * `<script>` do arquivo e os executa com globais falsos. Isso pega exatamente o
 * que a inspeção manual não pega de forma confiável:
 *
 * - o id do Pixel divergindo entre `fbq('init')` e o `<noscript>` (AC1) — dois
 *   lugares, um erro silencioso: o `PageView` sem-JS iria para outro dataset;
 * - os endpoints do proxy apontando para o projeto Vercel errado (AC12) — o
 *   modo mais provável de falha num arquivo clonado de outra landing;
 * - o `console.log` do payload do lead (defeito `86.11-QA-005`) voltando num
 *   merge (AC10);
 * - `localStorage` bloqueado ou rede fora do ar derrubando a página (AC11).
 *
 * O arquivo mora fora de `api/` de propósito e está no `.vercelignore`.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import path from "path"

const DIR = path.dirname(fileURLToPath(import.meta.url))
const HTML = readFileSync(path.join(DIR, "index.html"), "utf8")

const PIXEL_ID = "1337310707164669"
const ORIGEM_PROXY = "https://yarden.vercel.app"

/** Todos os blocos `<script>` inline, em ordem de aparição. */
const SCRIPTS = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!)

const SCRIPT_TRACKING = SCRIPTS.find((s) => s.includes("window.TrifoldTracking"))!
const SCRIPT_FORM = SCRIPTS.find((s) => s.includes("leadForm"))!

/**
 * Remove comentários antes de afirmar sobre a FORMA do código.
 *
 * Sem isso, um comentário que explica "`client_ip` não vai daqui" faria o teste
 * falhar exatamente por dizer a coisa certa.
 */
function codigo(script: string): string {
  return script.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")
}

const CODIGO_TRACKING = codigo(SCRIPT_TRACKING)
const CODIGO_FORM = codigo(SCRIPT_FORM)

// ---------------------------------------------------------------------------
// Contrato estático do HTML
// ---------------------------------------------------------------------------

describe("index.html — contrato estático (AC1, AC10, AC12)", () => {
  it("o id do Pixel é o mesmo no fbq('init') e no <noscript> (AC1)", () => {
    expect(HTML).toContain(`window.TRIFOLD_PIXEL_ID = '${PIXEL_ID}'`)
    expect(HTML).toContain("fbq('init', window.TRIFOLD_PIXEL_ID)")
    expect(HTML).toContain(`facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`)

    // Nenhum outro id de dataset perdido no arquivo: se aparecer um segundo
    // número de 15-16 dígitos, alguém clonou meio caminho.
    const ids = new Set(HTML.match(/\b\d{15,16}\b/g) ?? [])
    expect([...ids]).toEqual([PIXEL_ID])
  })

  it("os DOIS endpoints do proxy apontam para o projeto Vercel do Yarden (AC12)", () => {
    expect(SCRIPT_TRACKING).toContain(`var TRACK_ENDPOINT = '${ORIGEM_PROXY}/api/track'`)
    expect(SCRIPT_FORM).toContain(`leadEndpoint: "${ORIGEM_PROXY}/api/lead"`)
    // O clone veio do Vind Residence — nenhum resquício pode ficar.
    expect(HTML).not.toContain("vind-residence.vercel.app")
    expect(HTML).not.toContain("vindresidence")
  })

  it("não loga o payload/resposta do lead no console (defeito 86.11-QA-005, AC10)", () => {
    // O `console.log('[lead capturado]', data)` do Vind Residence imprime
    // `fbc`/`fbp` no console do browser. Herdá-lo num arquivo NOVO seria
    // regressão introduzida por esta story, não herdada.
    expect(CODIGO_FORM).not.toMatch(/console\.(log|debug|info)/)
    expect(CODIGO_FORM).not.toContain("lead capturado")
  })

  it("o formulário tem os campos que o tracking e o proxy esperam", () => {
    for (const id of ["leadForm", "formMsg", "nome", "whats", "email", "empresa"]) {
      expect(HTML).toContain(`id="${id}"`)
    }
    // Honeypot fora do fluxo de teclado e da árvore de acessibilidade.
    expect(HTML).toMatch(/id="empresa"[^>]*tabindex="-1"/)
    expect(HTML).toMatch(/id="empresa"[^>]*aria-hidden="true"/)
  })

  it("o browser não escreve `landing`, `client_ip` nem `client_ua` (AC5, AC8)", () => {
    // A fonte confiável desses três é o proxy. Se o HTML passar a mandá-los, a
    // garantia do AC5 vira teatro — o proxy sobrescreve, mas a intenção do
    // arquivo já estaria errada.
    for (const script of [CODIGO_FORM, CODIGO_TRACKING]) {
      expect(script).not.toMatch(/landing\s*[:=]\s*['"]/)
      expect(script).not.toContain("client_ip")
      expect(script).not.toContain("client_ua")
    }
  })

  it("não referencia assets que ainda não existem (conteúdo é dependência externa)", () => {
    // Um `<img src="assets/...">` clonado da outra landing daria 404 em
    // produção — e o AC12 proíbe inventar conteúdo, não só copy.
    expect(HTML).not.toMatch(/(?:src|href)="assets\//)
  })
})

// ---------------------------------------------------------------------------
// Execução dos helpers com globais falsos
// ---------------------------------------------------------------------------

interface Cenario {
  localStorageQuebrado?: boolean
  cookie?: string
  search?: string
  fetchQuebrado?: boolean
  semFbq?: boolean
  fbqQuebrado?: boolean
}

interface Resultado {
  T: {
    novoId: (p: string) => string
    visitorId: () => string
    atribuicao: () => Record<string, string>
    pixelTrack: (evento: string, id: string) => void
    evento: (nome: string) => void
    pageUrl: string
  }
  pixel: { evento: string; eventId: string }[]
  servidor: Record<string, unknown>[]
  storage: Map<string, string>
  /** Callbacks pendentes do `setInterval` (ad-blocker: `_fbp` nunca nasce). */
  ticks: (() => void)[]
}

/**
 * Roda o `<script>` de tracking do `<head>` num ambiente controlado.
 *
 * Globais são passados como PARÂMETROS (não injetados em `globalThis`) para o
 * teste não poder contaminar outro nem depender de jsdom, que este projeto não
 * usa.
 */
function rodarTracking(cenario: Cenario = {}): Resultado {
  const pixel: Resultado["pixel"] = []
  const servidor: Resultado["servidor"] = []
  const storage = new Map<string, string>()
  const sessao = new Map<string, string>()
  const ticks: (() => void)[] = []

  const armazenamento = (mapa: Map<string, string>) =>
    cenario.localStorageQuebrado
      ? {
          getItem() {
            throw new Error("SecurityError: localStorage bloqueado")
          },
          setItem() {
            throw new Error("SecurityError: localStorage bloqueado")
          },
        }
      : {
          getItem: (k: string) => (mapa.has(k) ? mapa.get(k)! : null),
          setItem: (k: string, v: string) => void mapa.set(k, v),
        }

  const fakeWindow: Record<string, unknown> = {
    crypto: { randomUUID: () => `uuid-${Math.random().toString(36).slice(2, 10)}` },
    localStorage: armazenamento(storage),
    sessionStorage: armazenamento(sessao),
    location: {
      href: `https://trifold.eng.br/yarden/${cenario.search ?? ""}`,
      search: cenario.search ?? "",
    },
    fbq: cenario.semFbq
      ? undefined
      : cenario.fbqQuebrado
        ? () => {
            throw new Error("fbq substituído por um stub quebrado")
          }
        : (_metodo: string, evento: string, _params: unknown, opcoes: { eventID: string }) => {
            pixel.push({ evento, eventId: opcoes.eventID })
          },
  }

  const fakeDocument = { cookie: cenario.cookie ?? "" }

  const fakeFetch = (_url: string, init: { body: string }) => {
    if (cenario.fetchQuebrado) return Promise.reject(new Error("net::ERR_BLOCKED_BY_CLIENT"))
    servidor.push(JSON.parse(init.body))
    return Promise.resolve({ ok: true })
  }

  const fakeSetInterval = (fn: () => void) => {
    ticks.push(fn)
    return ticks.length
  }

  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const executar = new Function(
    "window",
    "document",
    "fetch",
    "setInterval",
    "clearInterval",
    SCRIPT_TRACKING,
  )
  executar(fakeWindow, fakeDocument, fakeFetch, fakeSetInterval, () => {})

  return {
    T: fakeWindow.TrifoldTracking as Resultado["T"],
    pixel,
    servidor,
    storage,
    ticks,
  }
}

const COOKIE_COM_FBP = "_fbp=fb.1.1700000000000.9876543210"

describe("tracking do <head> — eventos de carregamento (AC1, AC4)", () => {
  it("dispara PageView só no browser e ViewContent nos dois lados, com o MESMO id", () => {
    const { pixel, servidor } = rodarTracking({ cookie: COOKIE_COM_FBP })

    expect(pixel.map((p) => p.evento)).toEqual(["PageView", "ViewContent"])
    // PageView não tem contraparte de servidor: página anônima, sem correlato
    // confiável no backend (AC1).
    expect(servidor).toHaveLength(1)
    expect(servidor[0]!.event_name).toBe("ViewContent")
    // Ids divergentes inflariam a contagem em vez de deduplicar.
    expect(servidor[0]!.event_id).toBe(pixel[1]!.eventId)
    expect(pixel[0]!.eventId).not.toBe(pixel[1]!.eventId)
  })

  it("manda visitor_id e page_url ao servidor, e nunca client_ip/client_ua/landing", () => {
    const { servidor } = rodarTracking({ cookie: COOKIE_COM_FBP })

    const corpo = servidor[0]!
    expect(corpo.visitor_id).toBeTypeOf("string")
    expect(corpo.page_url).toBe("https://trifold.eng.br/yarden/")
    expect(corpo.client_ip).toBeUndefined()
    expect(corpo.client_ua).toBeUndefined()
    expect(corpo.landing).toBeUndefined()
  })

  it("expõe a API que o script do formulário consome", () => {
    const { T } = rodarTracking({ cookie: COOKIE_COM_FBP })
    for (const chave of ["novoId", "visitorId", "atribuicao", "pixelTrack", "evento", "pageUrl"]) {
      expect(T).toHaveProperty(chave)
    }
  })
})

describe("visitor_id (AC2)", () => {
  it("persiste em localStorage sob a MESMA chave da outra landing", () => {
    const { T, storage } = rodarTracking({ cookie: COOKIE_COM_FBP })
    const id = T.visitorId()

    // Chave compartilhada de propósito: as duas landings vivem sob
    // trifold.eng.br, e um visitante que passe pelas duas mantém o mesmo id.
    expect(storage.get("trifold_visitor_id")).toBe(id)
    expect(T.visitorId()).toBe(id)
  })

  it("sem localStorage cai para memória, estável no carregamento (AC11)", () => {
    const { T } = rodarTracking({ cookie: COOKIE_COM_FBP, localStorageQuebrado: true })
    const id = T.visitorId()

    expect(id).toBeTruthy()
    expect(T.visitorId()).toBe(id)
  })
})

describe("fbc / fbp / fbclid (AC3)", () => {
  it("lê o _fbp do cookie e NUNCA o fabrica", () => {
    const comCookie = rodarTracking({ cookie: COOKIE_COM_FBP })
    expect(comCookie.T.atribuicao().fbp).toBe("fb.1.1700000000000.9876543210")

    // Sem cookie, `fbp` fica ausente — inventar um valor destruiria a
    // correspondência do lado do Meta.
    const semCookie = rodarTracking({ cookie: "" })
    expect(semCookie.T.atribuicao().fbp).toBeUndefined()
  })

  it("deriva fbc do fbclid da URL quando o cookie _fbc ainda não nasceu", () => {
    const { T } = rodarTracking({ cookie: COOKIE_COM_FBP, search: "?fbclid=IwAR-teste" })
    const atrib = T.atribuicao()

    expect(atrib.fbclid).toBe("IwAR-teste")
    expect(atrib.fbc).toMatch(/^fb\.1\.\d+\.IwAR-teste$/)
  })

  it("prefere o cookie _fbc real ao valor derivado", () => {
    const { T } = rodarTracking({
      cookie: `${COOKIE_COM_FBP}; _fbc=fb.1.1700000000000.oficial`,
      search: "?fbclid=IwAR-teste",
    })
    expect(T.atribuicao().fbc).toBe("fb.1.1700000000000.oficial")
  })

  it("guarda o fbclid na sessão para sobreviver à navegação interna", () => {
    const { T } = rodarTracking({ cookie: COOKIE_COM_FBP, search: "?fbclid=IwAR-teste" })
    // A primeira leitura já gravou; a segunda (sem query) ainda encontra.
    expect(T.atribuicao().fbclid).toBe("IwAR-teste")
  })
})

describe("degradação graciosa (AC11)", () => {
  it("sem window.fbq (ad-blocker) nada lança e o envio ao servidor continua", () => {
    const { servidor, pixel } = rodarTracking({ cookie: COOKIE_COM_FBP, semFbq: true })

    expect(pixel).toHaveLength(0)
    // O par server-side é o que salva a atribuição quando o Pixel é bloqueado.
    expect(servidor).toHaveLength(1)
  })

  it("fetch rejeitado não vira unhandled rejection nem lança", async () => {
    const { servidor } = rodarTracking({ cookie: COOKIE_COM_FBP, fetchQuebrado: true })
    expect(servidor).toHaveLength(0)
    // O `.catch()` interno é o que impede a falha de escapar; se ele sumir, esta
    // asserção passa mas o processo acusa unhandled rejection.
    await Promise.resolve()
  })

  it("localStorage e sessionStorage bloqueados não impedem o evento", () => {
    const { servidor } = rodarTracking({ cookie: COOKIE_COM_FBP, localStorageQuebrado: true })
    expect(servidor).toHaveLength(1)
    expect(servidor[0]!.visitor_id).toBeTruthy()
  })

  it("sem _fbp o envio espera, mas desiste depois do teto e manda o evento", () => {
    // Defeito 86.9-QA-004: disparar antes do `_fbp` nascer manda o evento sem
    // ele. Mas quem usa bloqueador nunca terá o cookie — o teto existe para o
    // evento não ficar preso para sempre.
    const { servidor, ticks } = rodarTracking({ cookie: "" })

    expect(servidor).toHaveLength(0)
    expect(ticks).toHaveLength(1)
    for (let i = 0; i < 50; i++) ticks[0]!()
    expect(servidor).toHaveLength(1)
    expect(servidor[0]!.fbp).toBeUndefined()
  })

  it("pixelTrack não propaga exceção — nem sem fbq, nem com um fbq quebrado", () => {
    // Cenário real: um bloqueador que injeta um stub que lança, ou que remove o
    // `fbq` inteiro. Nos dois casos o formulário tem que continuar de pé.
    const semFbq = rodarTracking({ cookie: COOKIE_COM_FBP, semFbq: true })
    expect(() => semFbq.T.pixelTrack("Lead", "e-1")).not.toThrow()

    const quebrado = rodarTracking({ cookie: COOKIE_COM_FBP, fbqQuebrado: true })
    expect(() => quebrado.T.pixelTrack("Lead", "e-1")).not.toThrow()
  })
})
