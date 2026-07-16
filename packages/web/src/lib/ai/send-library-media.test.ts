import { describe, it, expect, vi, afterEach } from "vitest"
import {
  detectMediaRequest,
  detectMaterialRequest,
  selectAssets,
  sendLibraryMediaIfRequested,
  resolveSendableMedia,
  MAX_MEDIA_PER_TURN,
  type MediaAsset,
} from "./send-library-media"

// Acervo espelhando o Vind Residence (pós-curadoria 2026-07-10): 1 planta real,
// 1 fachada, e lazer/localização em `outro` com título descritivo.
const VIND: MediaAsset[] = [
  { id: "planta", title: "Planta", category: "planta", file_url: "u", file_name: "planta.png", file_type: "image" },
  { id: "fachada", title: "Fachada", category: "fachada", file_url: "u", file_name: "fachada.jpg", file_type: "image" },
  { id: "academia", title: "Academia", category: "outro", file_url: "u", file_name: "academia.png", file_type: "image" },
  { id: "brinquedoteca", title: "Brinquedoteca", category: "outro", file_url: "u", file_name: "brinq.png", file_type: "image" },
  { id: "pilates", title: "Pilates", category: "outro", file_url: "u", file_name: "pilates.png", file_type: "image" },
  { id: "piscina", title: "Piscina", category: "outro", file_url: "u", file_name: "piscina.png", file_type: "image" },
  { id: "localizacao", title: "Localização", category: "outro", file_url: "u", file_name: "local.png", file_type: "image" },
]

describe("detectMediaRequest", () => {
  it("AC1 — caso Carlos: pedido educado/implícito dispara", () => {
    // A frase exata que NÃO disparava na Story 75-17.
    const kinds = detectMediaRequest("Se possível mais fotos, metragem e valor.")
    expect(kinds).toContain("generic") // "mais" + "fotos"
    expect(kinds).toContain("planta") // "metragem"
    expect(kinds).toContain("tabela") // "valor"
  })

  it("AC2 — casa tipos específicos", () => {
    expect(detectMediaRequest("me manda a planta?")).toContain("planta")
    expect(detectMediaRequest("como é a fachada do prédio")).toContain("fachada")
    expect(detectMediaRequest("qual a tabela de valores")).toContain("tabela")
    expect(detectMediaRequest("tem foto da piscina?")).toContain("lazer")
    expect(detectMediaRequest("onde fica o empreendimento?")).toContain("localizacao")
  })

  it("tipos específicos disparam mesmo sem verbo de comando", () => {
    expect(detectMediaRequest("e a planta?")).toEqual(["planta"])
    expect(detectMediaRequest("area de lazer")).toEqual(["lazer"])
  })

  it("generic exige sinal de pedido (evita falso positivo)", () => {
    expect(detectMediaRequest("recebi as fotos, obrigado")).toEqual([])
    expect(detectMediaRequest("gostei das fotos")).toEqual([]) // sem sinal de pedido
    expect(detectMediaRequest("pode me mandar as fotos")).toContain("generic")
  })

  it("guarda de negação / já recebido", () => {
    expect(detectMediaRequest("não quero fotos agora")).toEqual([])
    expect(detectMediaRequest("já vi a planta, obrigado")).toEqual([])
    expect(detectMediaRequest("sem fotos por enquanto")).toEqual([])
  })

  it("texto vazio/irrelevante não dispara", () => {
    expect(detectMediaRequest("")).toEqual([])
    expect(detectMediaRequest(null)).toEqual([])
    expect(detectMediaRequest("bom dia, tudo bem?")).toEqual([])
    expect(detectMediaRequest("[Mensagem de voz recebida]")).toEqual([])
  })
})

describe("selectAssets", () => {
  it("AC3 — pedido genérico vira combo curado (fachada + lazer + planta)", () => {
    const chosen = selectAssets(VIND, ["generic"])
    const ids = chosen.map((a) => a.id)
    expect(ids).toContain("fachada")
    expect(ids).toContain("planta")
    // um item de lazer (o primeiro por ordem determinística: Academia)
    expect(ids.some((id) => ["academia", "brinquedoteca", "pilates", "piscina"].includes(id))).toBe(true)
    expect(chosen.length).toBe(3)
  })

  it("AC4 — nunca ultrapassa o teto", () => {
    const chosen = selectAssets(VIND, ["planta", "fachada", "lazer", "localizacao", "generic"])
    expect(chosen.length).toBeLessThanOrEqual(MAX_MEDIA_PER_TURN)
  })

  it("AC2 — pedido específico traz o asset certo", () => {
    expect(selectAssets(VIND, ["planta"]).map((a) => a.id)).toEqual(["planta"])
    expect(selectAssets(VIND, ["localizacao"]).map((a) => a.id)).toEqual(["localizacao"])
    expect(selectAssets(VIND, ["lazer"]).length).toBe(1)
  })

  it("caso Carlos completo → planta + fachada + lazer (tabela inexistente é ignorada)", () => {
    const kinds = detectMediaRequest("Se possível mais fotos, metragem e valor.")
    const chosen = selectAssets(VIND, kinds)
    const ids = chosen.map((a) => a.id)
    expect(chosen.length).toBe(3)
    expect(ids).toContain("planta")
    expect(ids).toContain("fachada")
    expect(ids.some((id) => ["academia", "brinquedoteca", "pilates", "piscina"].includes(id))).toBe(true)
  })

  it("AC7 — não reenvia asset já enviado", () => {
    const chosen = selectAssets(VIND, ["planta"], new Set(["planta"]))
    expect(chosen).toEqual([]) // única planta já foi enviada
  })

  it("não repete o mesmo asset entre tipos", () => {
    const chosen = selectAssets(VIND, ["planta", "planta"])
    expect(chosen.length).toBe(1)
  })

  it("degrada com acervo vazio", () => {
    expect(selectAssets([], ["generic"])).toEqual([])
  })

  it("é determinístico independentemente da ordem de entrada", () => {
    const a = selectAssets(VIND, ["generic"]).map((x) => x.id)
    const b = selectAssets([...VIND].reverse(), ["generic"]).map((x) => x.id)
    expect(a).toEqual(b)
  })
})

// Fake mínimo do admin Supabase: builder encadeável + thenable, por tabela.
function fakeAdmin(config: {
  leadPropertyId?: string | null
  assets?: MediaAsset[]
  sentAssetIds?: string[]
}) {
  const inserts: Array<Record<string, unknown>> = []
  const tables: Record<string, { list?: unknown[]; single?: unknown }> = {
    leads: { single: { property_interest_id: config.leadPropertyId ?? null } },
    agent_media_assets: { list: config.assets ?? [] },
    messages: {
      list: (config.sentAssetIds ?? []).map((id) => ({ metadata: { media_asset_id: id } })),
    },
  }
  function builder(table: string) {
    const b: Record<string, unknown> = {}
    const chain = () => b
    b.select = chain
    b.eq = chain
    b.not = chain
    b.order = chain
    b.limit = chain
    b.maybeSingle = () => Promise.resolve({ data: tables[table]?.single ?? null })
    b.insert = (row: Record<string, unknown>) => {
      inserts.push({ __table: table, ...row })
      return Promise.resolve({ error: null })
    }
    // torna o builder "awaitable" (para os SELECTs sem maybeSingle)
    b.then = (resolve: (v: unknown) => void) =>
      resolve({ data: tables[table]?.list ?? [] })
    return b
  }
  const admin = { from: (t: string) => builder(t) }
  return { admin, inserts }
}

const P_ASSETS: MediaAsset[] = [
  { id: "planta", title: "Planta", category: "planta", file_url: "u1", file_name: "p.png", file_type: "image" },
  { id: "fachada", title: "Fachada", category: "fachada", file_url: "u2", file_name: "f.jpg", file_type: "image" },
  { id: "academia", title: "Academia", category: "outro", file_url: "u3", file_name: "a.png", file_type: "image" },
]

const baseArgs = {
  orgId: "org1",
  leadId: "lead1",
  leadPhone: "5544999999999",
  conversationId: "conv1",
  phoneNumberId: "pn1",
  accessToken: "tok",
}

describe("sendLibraryMediaIfRequested (I/O)", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("Bug C — dedup real: não reenvia asset já enviado; grava log sem org_id", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }))
    const { admin, inserts } = fakeAdmin({
      leadPropertyId: "P",
      assets: P_ASSETS,
      sentAssetIds: ["fachada"], // Fachada já foi enviada antes
    })
    // "tem mais imagem?" → generic → combo fachada+lazer+planta; fachada dedupada.
    const n = await sendLibraryMediaIfRequested(
      admin as never,
      { ...baseArgs, text: "tem mais alguma imagem que possa me mandar?" }
    )
    expect(n).toBe(2) // academia + planta (fachada excluída)
    const sentIds = inserts.map((r) => (r.metadata as { media_asset_id: string }).media_asset_id)
    expect(sentIds).not.toContain("fachada")
    expect(sentIds.sort()).toEqual(["academia", "planta"])
    // A regressão do org_id: o insert em messages NUNCA pode conter org_id.
    for (const row of inserts) {
      expect(row).not.toHaveProperty("org_id")
      expect(row.role).toBe("assistant")
    }
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("não envia quando não há empreendimento identificado", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }))
    const { admin, inserts } = fakeAdmin({ leadPropertyId: null, assets: [] })
    const n = await sendLibraryMediaIfRequested(
      admin as never,
      { ...baseArgs, text: "me manda a planta" }
    )
    expect(n).toBe(0)
    expect(inserts).toHaveLength(0)
  })

  it("não faz nada quando não é pedido de mídia", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }))
    const { admin } = fakeAdmin({ leadPropertyId: "P", assets: P_ASSETS })
    const n = await sendLibraryMediaIfRequested(admin as never, { ...baseArgs, text: "bom dia" })
    expect(n).toBe(0)
    expect(fetch).not.toHaveBeenCalled()
  })
})

// Fake admin por tabela, com suporte a .order (usado por resolveSendableMedia).
function fakeDb(tables: Record<string, { list?: unknown[]; single?: unknown }>) {
  function builder(table: string) {
    const b: Record<string, unknown> = {}
    const chain = () => b
    b.select = chain
    b.eq = chain
    b.not = chain
    b.order = chain
    b.limit = chain
    b.maybeSingle = () => Promise.resolve({ data: tables[table]?.single ?? null })
    b.insert = () => Promise.resolve({ error: null })
    b.then = (resolve: (v: unknown) => void) => resolve({ data: tables[table]?.list ?? [] })
    return b
  }
  return { from: (t: string) => builder(t) } as never
}

const VIND_FULL = [
  { id: "planta", title: "Planta", category: "planta", file_url: "u", file_name: "p.png", file_type: "image", property_id: "vind", property: { name: "Vind Residence" } },
  { id: "fachada", title: "Fachada", category: "fachada", file_url: "u", file_name: "f.jpg", file_type: "image", property_id: "vind", property: { name: "Vind Residence" } },
]

describe("resolveSendableMedia (Story 75-157)", () => {
  it("AC1 — caso Maicon: resolve pelo empreendimento estabelecido no CONTEXTO ('Vind'), sem property_interest_id", async () => {
    const admin = fakeDb({
      leads: { single: { property_interest_id: null } },
      agent_media_assets: { list: VIND_FULL },
      messages: { list: [{ content: "O Vind tem tudo a ver com voce, Maicon!" }] },
      properties: { single: { name: "Vind Residence" } },
    })
    const r = await resolveSendableMedia(admin, {
      orgId: "o", leadId: "l", conversationId: "c", text: "voce tem alguma imagem?",
    })
    expect(r.skipReason).toBeNull()
    expect(r.propertyId).toBe("vind")
    expect(r.propertyName).toBe("Vind Residence")
    expect(r.chosen.length).toBeGreaterThan(0)
  })

  it("usa property_interest_id direto quando presente", async () => {
    const admin = fakeDb({
      leads: { single: { property_interest_id: "vind" } },
      agent_media_assets: { list: VIND_FULL },
      messages: { list: [] },
      properties: { single: { name: "Vind Residence" } },
    })
    const r = await resolveSendableMedia(admin, {
      orgId: "o", leadId: "l", conversationId: "c", text: "me manda a planta",
    })
    expect(r.skipReason).toBeNull()
    expect(r.chosen.some((a) => a.id === "planta")).toBe(true)
  })

  it("ambíguo (Vind E Yarden citados) → NÃO adivinha (no_property)", async () => {
    const MIX = [
      ...VIND_FULL,
      { id: "y1", title: "Fachada Y", category: "fachada", file_url: "u", file_name: "y.jpg", file_type: "image", property_id: "yarden", property: { name: "Yarden" } },
    ]
    const admin = fakeDb({
      leads: { single: { property_interest_id: null } },
      agent_media_assets: { list: MIX },
      messages: { list: [{ content: "vi o Vind e o Yarden" }] },
    })
    const r = await resolveSendableMedia(admin, {
      orgId: "o", leadId: "l", conversationId: "c", text: "quero fotos",
    })
    expect(r.skipReason).toBe("no_property")
    expect(r.chosen).toHaveLength(0)
  })

  it("empreendimento definido mas sem asset ativo → no_assets", async () => {
    const admin = fakeDb({
      leads: { single: { property_interest_id: "vind" } },
      agent_media_assets: { list: [] },
      messages: { list: [] },
    })
    const r = await resolveSendableMedia(admin, {
      orgId: "o", leadId: "l", conversationId: "c", text: "me manda a planta",
    })
    expect(r.skipReason).toBe("no_assets")
    expect(r.propertyId).toBe("vind")
  })

  it("tudo já enviado antes (dedup) → none_selected", async () => {
    const admin = fakeDb({
      leads: { single: { property_interest_id: "vind" } },
      agent_media_assets: { list: VIND_FULL },
      messages: { list: [{ metadata: { media_asset_id: "planta" } }, { metadata: { media_asset_id: "fachada" } }] },
      properties: { single: { name: "Vind Residence" } },
    })
    const r = await resolveSendableMedia(admin, {
      orgId: "o", leadId: "l", conversationId: "c", text: "me manda a planta e a fachada",
    })
    expect(r.skipReason).toBe("none_selected")
  })

  it("sem pedido de material → no_request", async () => {
    const admin = fakeDb({ leads: { single: { property_interest_id: "vind" } }, agent_media_assets: { list: VIND_FULL } })
    const r = await resolveSendableMedia(admin, {
      orgId: "o", leadId: "l", conversationId: "c", text: "bom dia",
    })
    expect(r.skipReason).toBe("no_request")
    expect(r.chosen).toHaveLength(0)
  })
})

describe("detectMaterialRequest (compat 75-17)", () => {
  it("mantém a semântica de tipo único", () => {
    expect(detectMaterialRequest("me manda a planta")).toBe("planta")
    expect(detectMaterialRequest("tabela de valores")).toBe("tabela")
    expect(detectMaterialRequest("pode mandar fotos")).toBe("qualquer")
    expect(detectMaterialRequest("bom dia")).toBe(null)
  })
})
