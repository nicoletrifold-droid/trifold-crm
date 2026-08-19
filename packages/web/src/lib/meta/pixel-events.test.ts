/**
 * Story 86-9 / defeito 86.9-QA-001 — a espera pelo Pixel.
 *
 * O projeto não tem jsdom, então aqui o `window` é simulado à mão. Não é teste
 * de UI: o alvo é a decisão de ESPERAR, que é o que separa um evento com `fbp`
 * de um evento sem. O gate do @qa reprovou a primeira versão exatamente por
 * disparar antes de o `fbevents.js` existir — este teste impede a volta disso.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

process.env.NEXT_PUBLIC_META_PIXEL_ID = "1337310707164669"

type Chamada = [string, string, Record<string, unknown>?, { eventID?: string }?]

function janelaFalsa(): { window: Record<string, unknown>; chamadas: Chamada[] } {
  const chamadas: Chamada[] = []
  return { window: {}, chamadas }
}

let atual: ReturnType<typeof janelaFalsa>

beforeEach(() => {
  vi.useFakeTimers()
  atual = janelaFalsa()
  vi.stubGlobal("window", atual.window)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** Simula o `fbevents.js` chegando: define `window.fbq`. */
function pixelCarrega() {
  atual.window.fbq = (...args: Chamada) => {
    atual.chamadas.push(args)
  }
}

describe("pixelTrack espera o Pixel carregar", () => {
  it("dispara quando o script chega DEPOIS do evento ser pedido", async () => {
    const { pixelTrack } = await import("./pixel-events")

    // Ordem real em produção: o useEffect roda na hidratação, o `fbevents.js`
    // (afterInteractive) só depois. Sem a espera, este evento se perderia.
    const promessa = pixelTrack("ViewContent", "evt-1", { content_category: "x" })

    await vi.advanceTimersByTimeAsync(250)
    pixelCarrega()
    await vi.advanceTimersByTimeAsync(150)

    await expect(promessa).resolves.toBe(true)
    expect(atual.chamadas).toHaveLength(1)
    expect(atual.chamadas[0]?.[0]).toBe("track")
    expect(atual.chamadas[0]?.[1]).toBe("ViewContent")
    // O eventID é o que deduplica com o disparo da CAPI.
    expect(atual.chamadas[0]?.[3]).toEqual({ eventID: "evt-1" })
  })

  it("dispara na hora quando o Pixel já está carregado", async () => {
    const { pixelTrack } = await import("./pixel-events")
    pixelCarrega()

    await expect(pixelTrack("Lead", "evt-2")).resolves.toBe(true)
    expect(atual.chamadas).toHaveLength(1)
  })

  it("desiste após o teto e NÃO deixa timer rodando (bloqueador de anúncios)", async () => {
    const { pixelTrack } = await import("./pixel-events")

    const promessa = pixelTrack("ViewContent", "evt-3")
    await vi.advanceTimersByTimeAsync(6000)

    await expect(promessa).resolves.toBe(false)
    expect(atual.chamadas).toHaveLength(0)
    // Um timer sobrevivente por página aberta seria um vazamento silencioso.
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe("pixelIdentificar (Advanced Matching)", () => {
  it("manda os dados em TEXTO PURO — o script do Meta é quem hasheia", async () => {
    const { pixelIdentificar } = await import("./pixel-events")
    pixelCarrega()

    await pixelIdentificar({ external_id: "v-1", fn: "maria", ph: "5544997344650" })

    expect(atual.chamadas[0]?.[0]).toBe("init")
    // Hashear aqui produziria o hash de um hash, e o Meta não casaria nada.
    expect(atual.chamadas[0]?.[2]).toEqual({
      external_id: "v-1",
      fn: "maria",
      ph: "5544997344650",
    })
  })

  it("não chama o Pixel quando não há nenhum dado de identidade", async () => {
    const { pixelIdentificar } = await import("./pixel-events")
    pixelCarrega()

    await pixelIdentificar({ fn: "", ph: undefined })

    expect(atual.chamadas).toHaveLength(0)
  })
})

/**
 * Defeito 86.9-QA-004 — medido em PRODUCAO 24h apos o deploy: `fbp` em 6,8% no
 * `ViewContent` contra 100% no `Lead`. A causa era esperar `window.fbq` (o stub
 * sincrono) em vez do cookie, que so nasce com o `fbevents.js` real.
 */
describe("quandoFbpPronto espera o COOKIE, nao o stub", () => {
  it("nao libera enquanto so existe window.fbq (o stub) sem cookie", async () => {
    const { quandoFbpPronto } = await import("./pixel-events")
    pixelCarrega() // stub presente...
    vi.stubGlobal("document", { cookie: "" }) // ...mas o _fbp ainda nao existe

    const promessa = quandoFbpPronto()
    await vi.advanceTimersByTimeAsync(300)
    let resolveu = false
    void promessa.then(() => { resolveu = true })
    await vi.advanceTimersByTimeAsync(0)
    expect(resolveu).toBe(false)

    // o fbevents.js real chega e grava o cookie
    vi.stubGlobal("document", { cookie: "_fbp=fb.1.123.456" })
    await vi.advanceTimersByTimeAsync(150)
    await expect(promessa).resolves.toBe(true)
  })

  it("libera na hora quando o cookie ja existe", async () => {
    const { quandoFbpPronto } = await import("./pixel-events")
    vi.stubGlobal("document", { cookie: "outro=1; _fbp=fb.1.9.9; mais=2" })
    await expect(quandoFbpPronto()).resolves.toBe(true)
  })

  it("desiste apos o teto sem vazar timer (bloqueador de anuncios)", async () => {
    const { quandoFbpPronto } = await import("./pixel-events")
    vi.stubGlobal("document", { cookie: "" })

    const promessa = quandoFbpPronto()
    await vi.advanceTimersByTimeAsync(6000)

    await expect(promessa).resolves.toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})
