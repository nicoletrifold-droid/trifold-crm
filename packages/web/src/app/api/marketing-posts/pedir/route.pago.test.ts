/**
 * Story 75-294 — POST /api/marketing-posts/pedir no modo TRÁFEGO PAGO.
 * Cobre: validação de destino/objetivo, trio de proporções indo ao motor,
 * chips compostos no servidor, fachada forçada como referência, teto da ad
 * copy reforçado no insert, e orgânico 100% intocado.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

let guardError: Response | null = null
const appUser = { id: "u-1", org_id: "org-1", role: "admin" }

/** Linhas inseridas em marketing_posts (para inspecionar destino/ad copy). */
let insertedRow: Record<string, unknown> | null = null

const fakeDb = () => ({
  from: (table: string) => {
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      in: () => b,
      order: () => b,
      maybeSingle: async () => ({ data: null, error: null }),
      insert: (row: Record<string, unknown>) => {
        if (table === "marketing_posts") insertedRow = row
        return {
          select: () => ({ single: async () => ({ data: { id: "post-1", ...row }, error: null }) }),
        }
      },
      update: () => b,
      single: async () => ({ data: { id: "post-1" }, error: null }),
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        resolve({ data: brandRows(table), error: null }),
    }
    return b
  },
})

let kitAssets: Array<{ brand_id: string; tipo: string; label: string | null; file_name: string }> = []
function brandRows(table: string): unknown[] {
  if (table === "marketing_brands")
    return [
      {
        id: "b-inst",
        nome: "Trifold",
        tipo: "institucional",
        property_id: null,
        cores: [{ hex: "#F27A5E", nome: "coral" }],
        voz_da_marca: null,
        diretrizes: null,
        briefing: null,
      },
    ]
  if (table === "marketing_brand_assets") return kitAssets
  return []
}

vi.mock("@web/lib/marketing/guard", () => ({
  marketingGuard: async () =>
    guardError ? { error: guardError } : { admin: fakeDb(), supabase: fakeDb(), appUser },
}))

let aiInput: Record<string, unknown> | null = null
let aiResult: Record<string, unknown> | null = {}
vi.mock("@trifold/ai", () => ({
  createAnthropicClient: () => ({}),
  generateMarketingPostFromRequest: async (_c: unknown, input: Record<string, unknown>) => {
    aiInput = input
    return aiResult
  },
}))

let artesBase: Record<string, unknown> | null = null
let artesSpecs: unknown[] = []
vi.mock("@web/lib/marketing/arte-service", () => ({
  gerarArtesParaPost: async (_a: unknown, base: Record<string, unknown>, specs: unknown[]) => {
    artesBase = base
    artesSpecs = specs
    return []
  },
  montarPatchDeArtes: () => ({ artes: [], arte_url: null, arte_arquivos: null, arte_descricao: null, arte_cta: null }),
}))

import { POST } from "./route"

const AI_OK = {
  copy: "Legenda do anúncio",
  roteiro: null,
  justificativa: "porque sim",
  scheduled_for: null,
  artes: [{ descricao: "fachada ao pôr do sol", arquivos_kit: [], cta: "Agende sua visita", titulo: "T", subtitulo: null }],
  // contrato real: `arte` singular espelha artes[0] (a rota usa o singular na união)
  arte: { descricao: "fachada ao pôr do sol", arquivos_kit: [], cta: "Agende sua visita", titulo: "T", subtitulo: null },
  ad_primary_text: "Unidades exclusivas com lazer completo em Maringá.",
  ad_headline: "Unidades exclusivas com lazer completo liberado para Airbnb",
}

function call(body: Record<string, unknown>) {
  return POST(new Request("https://x", { method: "POST", body: JSON.stringify(body) }) as never)
}

const PAGO = { pedido: "Anúncio pra investidor batendo na entrega", destino: "pago" }

beforeEach(() => {
  guardError = null
  insertedRow = null
  aiInput = null
  aiResult = { ...AI_OK }
  artesBase = null
  artesSpecs = []
  kitAssets = []
})

describe("POST /api/marketing-posts/pedir — tráfego pago", () => {
  it("guard nega → repassa a resposta (401)", async () => {
    guardError = new Response("{}", { status: 401 })
    expect((await call(PAGO)).status).toBe(401)
  })

  it("destino/objetivo fora da lista → 400", async () => {
    expect((await call({ ...PAGO, destino: "ads" })).status).toBe(400)
    expect((await call({ ...PAGO, objetivo: "vendas" })).status).toBe(400)
  })

  it("pago não exige formato e força estatico; orgânico continua exigindo", async () => {
    expect((await call(PAGO)).status).toBe(201)
    expect(insertedRow).toMatchObject({ formato: "estatico", destino: "pago", objetivo: "leads" })
    expect((await call({ pedido: "post normal", destino: "organico" })).status).toBe(400)
  })

  it("trio de proporções vai ao motor (default as 3; escolha é respeitada)", async () => {
    await call(PAGO)
    expect(artesBase).toMatchObject({ ratios: ["1:1", "4:5", "9:16"] })
    await call({ ...PAGO, proporcoes: ["9:16"] })
    expect(artesBase).toMatchObject({ ratios: ["9:16"] })
    expect(artesSpecs).toHaveLength(1)
  })

  it("orgânico NÃO manda ratios (comportamento atual intocado)", async () => {
    await call({ pedido: "post normal", formato: "estatico", canal: "instagram" })
    expect((artesBase as { ratios?: unknown })?.ratios).toBeNull()
    expect(insertedRow).toMatchObject({ destino: "organico", objetivo: null, ad_primary_text: null, ad_headline: null })
  })

  it("ad copy entra com o teto do Meta reforçado (corte em fronteira de palavra + …)", async () => {
    await call(PAGO)
    const headline = insertedRow?.ad_headline as string
    expect(headline.length).toBeLessThanOrEqual(27)
    expect(headline.endsWith("…")).toBe(true)
    expect(insertedRow?.ad_primary_text).toBe(AI_OK.ad_primary_text)
  })

  it("chips são compostos no servidor e chegam ao Sonnet como direção", async () => {
    await call({ ...PAGO, chips: { cenario: "por_do_sol" }, direcao_arte: "destacar a piscina" })
    expect(aiInput?.direcaoArte).toBe("pôr do sol atrás do prédio, céu quente; destacar a piscina")
    expect(aiInput).toMatchObject({ destino: "pago" })
    expect(typeof aiInput?.objetivoInstrucao).toBe("string")
  })

  it("75-296: arte de pago é enxuta — specs sem CTA e sem subtítulo; arte_cta null no post", async () => {
    aiResult = {
      ...AI_OK,
      artes: [{ ...AI_OK.artes[0], subtitulo: "Entrega contratual: abril de 2027" }],
    }
    await call(PAGO)
    expect(artesSpecs[0]).toMatchObject({ cta: null, subtitulo: null, titulo: "T" })
    expect(insertedRow?.arte_cta).toBeNull()
    // orgânico continua compondo CTA e subtítulo
    await call({ pedido: "post normal", formato: "estatico", canal: "instagram" })
    expect(artesSpecs[0]).toMatchObject({ cta: "Agende sua visita" })
  })

  it("75-295: cena com prédio SEM chip → rede força a fachada do Kit mesmo assim", async () => {
    kitAssets = [{ brand_id: "b-inst", tipo: "foto", label: "Fachada", file_name: "fachada-vind.jpg" }]
    await call(PAGO) // descricao do fixture: "fachada ao pôr do sol"
    const spec = artesSpecs[0] as { arquivosKit: string[] }
    expect(spec.arquivosKit).toContain("fachada-vind.jpg")
  })

  it("chip fachada_real força as fotos do Kit como referência da tela 1", async () => {
    kitAssets = [
      { brand_id: "b-inst", tipo: "foto", label: "Fachada", file_name: "fachada-vind.jpg" },
      { brand_id: "b-inst", tipo: "logo", label: null, file_name: "logo.png" },
    ]
    await call({ ...PAGO, chips: { cenario: "fachada_real" } })
    const spec = artesSpecs[0] as { arquivosKit: string[] }
    expect(spec.arquivosKit).toContain("fachada-vind.jpg")
    expect(spec.arquivosKit).not.toContain("logo.png")
  })
})
